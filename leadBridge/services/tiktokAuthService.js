// services/tiktokAuthService.js
// ─────────────────────────────────────────────────────────────
// Handles TikTok Developer API OAuth 2.0 flow.
//
// FLOW:
//   1. GET /tt/oauth/start?company=TAG  → redirects to TikTok login
//   2. TikTok redirects to /tt/oauth/callback?code=...&state=...
//   3. Server exchanges code for tokens → stored in MongoDB
//   4. Background job refreshes access tokens before they expire
//
// SETUP:
//   - Add to .env:
//       TT_CLIENT_KEY=your_client_key
//       TT_CLIENT_SECRET=your_client_secret
//       TT_REDIRECT_URI=https://your-ngrok-url.ngrok.app/tt/oauth/callback
//   - Mount routes from tiktokAuthRoutes.js on your Express app
// ─────────────────────────────────────────────────────────────

const axios = require("axios");
const crypto = require("crypto");
const TiktokToken = require("../../shared/models/TiktokToken");

const TIKTOK_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

const CLIENT_KEY = process.env.TT_CLIENT_KEY;
const CLIENT_SECRET = process.env.TT_CLIENT_SECRET;
const REDIRECT_URI = process.env.TT_REDIRECT_URI;

const SCOPES = [
  "video.publish",
  "video.upload",
  "comment.list",
  "comment.create",
  "user.info.basic",
].join(",");

// In-memory CSRF state store (keyed by state param)
const pendingStates = new Map();

// ─── Build Authorization URL ─────────────────────────────────

/**
 * Generate the TikTok OAuth authorization URL for a given company.
 * @param {string} company — "TAG" or "WYNN"
 * @returns {{ url: string, state: string }}
 */
function buildAuthUrl(company) {
  const state = `${company}_${crypto.randomBytes(16).toString("hex")}`;

  // Store state with company so we can retrieve it in callback
  pendingStates.set(state, { company, createdAt: Date.now() });

  // Clean up states older than 10 minutes
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [key, val] of pendingStates.entries()) {
    if (val.createdAt < cutoff) pendingStates.delete(key);
  }

  const params = new URLSearchParams({
    client_key: CLIENT_KEY,
    response_type: "code",
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state,
  });

  return {
    url: `${TIKTOK_AUTH_URL}?${params.toString()}`,
    state,
  };
}

// ─── Exchange Code for Tokens ────────────────────────────────

/**
 * Exchange authorization code for access + refresh tokens.
 * Called from the OAuth callback route.
 * @param {string} code — from TikTok callback query param
 * @param {string} state — from TikTok callback query param
 * @returns {Promise<{ ok: boolean, company?: string, error?: string }>}
 */
async function handleCallback(code, state) {
  // Validate state
  const pending = pendingStates.get(state);
  if (!pending) {
    console.error("[TT-AUTH] Invalid or expired state:", state);
    return { ok: false, error: "Invalid or expired state parameter" };
  }

  const { company } = pending;
  pendingStates.delete(state);

  try {
    const response = await axios.post(
      TIKTOK_TOKEN_URL,
      new URLSearchParams({
        client_key: CLIENT_KEY,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 10000,
      },
    );

    const data = response.data;

    if (data.error) {
      console.error("[TT-AUTH] Token exchange error:", data.error_description);
      return { ok: false, error: data.error_description };
    }

    const now = Date.now();

    await TiktokToken.findOneAndUpdate(
      { company },
      {
        company,
        openId: data.open_id,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        accessTokenExpiresAt: new Date(now + data.expires_in * 1000),
        refreshTokenExpiresAt: new Date(now + data.refresh_expires_in * 1000),
        scope: data.scope,
        authorizedAt: new Date(),
      },
      { upsert: true, new: true },
    );

    console.log(
      `[TT-AUTH] ✓ Tokens saved for ${company} (openId: ${data.open_id})`,
    );
    return { ok: true, company };
  } catch (err) {
    const msg = err.response?.data?.error_description || err.message;
    console.error("[TT-AUTH] Token exchange failed:", msg);
    return { ok: false, error: msg };
  }
}

// ─── Get Valid Access Token ──────────────────────────────────

/**
 * Get a valid access token for a company, refreshing if needed.
 * @param {string} company — "TAG" or "WYNN"
 * @returns {Promise<{ accessToken: string, openId: string } | null>}
 */
async function getValidToken(company) {
  const record = await TiktokToken.findOne({ company });

  if (!record) {
    console.warn(
      `[TT-AUTH] No token found for ${company} — re-authorization needed`,
    );
    return null;
  }

  // Refresh if expiring within 30 minutes
  const expiresIn = record.accessTokenExpiresAt - Date.now();
  if (expiresIn < 30 * 60 * 1000) {
    console.log(
      `[TT-AUTH] Access token expiring soon for ${company}, refreshing...`,
    );
    const refreshed = await refreshToken(company, record);
    if (!refreshed) return null;
    return { accessToken: refreshed.accessToken, openId: refreshed.openId };
  }

  return { accessToken: record.accessToken, openId: record.openId };
}

// ─── Refresh Token ───────────────────────────────────────────

/**
 * Refresh the access token using the refresh token.
 * @param {string} company
 * @param {object} record — existing TiktokToken document
 * @returns {Promise<TiktokToken | null>}
 */
async function refreshToken(company, record) {
  try {
    const response = await axios.post(
      TIKTOK_TOKEN_URL,
      new URLSearchParams({
        client_key: CLIENT_KEY,
        client_secret: CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: record.refreshToken,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 10000,
      },
    );

    const data = response.data;

    if (data.error) {
      console.error(
        `[TT-AUTH] Refresh failed for ${company}:`,
        data.error_description,
      );
      return null;
    }

    const now = Date.now();

    const updated = await TiktokToken.findOneAndUpdate(
      { company },
      {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        accessTokenExpiresAt: new Date(now + data.expires_in * 1000),
        refreshTokenExpiresAt: new Date(now + data.refresh_expires_in * 1000),
      },
      { new: true },
    );

    console.log(`[TT-AUTH] ✓ Token refreshed for ${company}`);
    return updated;
  } catch (err) {
    const msg = err.response?.data?.error_description || err.message;
    console.error(`[TT-AUTH] Refresh error for ${company}:`, msg);
    return null;
  }
}

// ─── Background Token Refresh Job ───────────────────────────

/**
 * Proactively refresh tokens that expire within 2 hours.
 * Call this on a schedule (e.g. every hour via cron).
 */
async function refreshAllTokens() {
  try {
    const records = await TiktokToken.find({});
    const cutoff = new Date(Date.now() + 2 * 60 * 60 * 1000);

    for (const record of records) {
      if (record.accessTokenExpiresAt < cutoff) {
        console.log(`[TT-AUTH] Proactive refresh for ${record.company}`);
        await refreshToken(record.company, record);
      }
    }
  } catch (err) {
    console.error("[TT-AUTH] refreshAllTokens error:", err.message);
  }
}

// ─── Token Status (for dashboard) ───────────────────────────

async function getTokenStatus() {
  const records = await TiktokToken.find({});
  return records.map((r) => ({
    company: r.company,
    openId: r.openId,
    accessTokenExpiresAt: r.accessTokenExpiresAt,
    refreshTokenExpiresAt: r.refreshTokenExpiresAt,
    isExpired: r.accessTokenExpiresAt < new Date(),
    authorizedAt: r.authorizedAt,
  }));
}

module.exports = {
  buildAuthUrl,
  handleCallback,
  getValidToken,
  refreshAllTokens,
  getTokenStatus,
};
