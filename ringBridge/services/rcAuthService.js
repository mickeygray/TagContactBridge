// services/rcAuthService.js
// ─────────────────────────────────────────────────────────────
// RingCentral EX authentication + presence API.
//
// Reuses the proven auth pattern from TagContactBridge's
// ringCentralService.js:
//   - warmup() runs at startup and on a 45-min timer
//   - Sets isAuthenticated = true on success, false on failure
//   - API calls check the flag, re-auth on 401, propagate 429
// ─────────────────────────────────────────────────────────────

const RC = require('@ringcentral/sdk').SDK;
const config = require('../config/env');
const log = require('../utils/logger');

// Module-level state (same pattern as ringCentralService.js on :4000)
let rcSdk = null;
let platform = null;
let isAuthenticated = false;

/**
 * Get or create the RingCentral platform instance.
 */
function getPlatform() {
  if (!rcSdk) {
    if (!config.RC_CLIENT_ID || !config.RC_CLIENT_SECRET) {
      log.warn('RC credentials not configured — cannot create SDK');
      return null;
    }

    log.info('Creating RC SDK instance');
    rcSdk = new RC({
      server: config.RC_SERVER_URL,
      clientId: config.RC_CLIENT_ID,
      clientSecret: config.RC_CLIENT_SECRET
    });
    platform = rcSdk.platform();
  }
  return platform;
}

/**
 * Authenticate with RingCentral. Called by warmup timer.
 */
async function doLogin() {
  const p = getPlatform();
  if (!p) {
    isAuthenticated = false;
    return false;
  }

  log.info('Attempting RC login...');
  const startTime = Date.now();

  try {
    await p.login({ jwt: config.RC_USER_JWT });
    isAuthenticated = true;
    log.success(`Authenticated with RC EX (took ${Date.now() - startTime}ms)`);

    // Log who we are
    try {
      const ext = await p.get('/restapi/v1.0/account/~/extension/~');
      const extData = await ext.json();
      log.info(`Logged in as: ${extData.name} (ext ${extData.extensionNumber})`);
    } catch (_) { /* non-critical */ }

    return true;
  } catch (err) {
    isAuthenticated = false;
    log.error(`RC auth failed (took ${Date.now() - startTime}ms):`, err.message);
    return false;
  }
}

/**
 * Proactively authenticate and keep session warm.
 * Same pattern as TagContactBridge — call at startup.
 */
async function warmup(refreshIntervalMs = 45 * 60 * 1000) {
  log.info('══════════════════════════════════════════════════');
  log.info('WARMUP: Authenticating at startup...');

  await doLogin();

  log.info(`WARMUP: isAuthenticated = ${isAuthenticated}`);

  if (isAuthenticated && refreshIntervalMs > 0) {
    setInterval(async () => {
      log.info('REFRESH: Running scheduled re-auth...');
      await doLogin();
    }, refreshIntervalMs);
    log.info(`WARMUP: Auto-refresh every ${Math.round(refreshIntervalMs / 60000)} min`);
  }

  log.info('══════════════════════════════════════════════════');
  return isAuthenticated;
}

/**
 * Extract Retry-After from RC error response.
 * (Carried over from ringCentralService.js)
 */
function extractRetryAfter(err) {
  const headers = err?.response?.headers || err?.apiResponse?.response?.headers || {};
  let retryAfter;
  if (typeof headers.get === 'function') {
    retryAfter = headers.get('retry-after');
  } else {
    retryAfter = headers['retry-after'] || headers['Retry-After'] || headers['x-rate-limit-window'];
  }
  const parsed = parseInt(retryAfter, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 65;
}

/**
 * Make an authenticated API call with 401 retry + 429 handling.
 * Wraps the same error pattern as placeRingOutCall on :4000.
 */
async function apiCall(method, endpoint, body = null) {
  if (!isAuthenticated) {
    const loginOk = await doLogin();
    if (!loginOk) return { ok: false, error: 'Authentication failed' };
  }

  const p = getPlatform();
  if (!p) return { ok: false, error: 'Platform not initialized' };

  try {
    const resp = body
      ? await p[method](endpoint, body)
      : await p[method](endpoint);
    const data = await resp.json();
    return { ok: true, data };
  } catch (err) {
    const status = err?.response?.status || err?.statusCode;

    // ── 429 Rate Limited — propagate, don't retry ──
    if (status === 429) {
      const retryAfter = extractRetryAfter(err);
      log.warn(`Rate limited (429) on ${endpoint} — retry after ${retryAfter}s`);
      return { ok: false, error: 'Rate limited', rateLimited: true, retryAfter, statusCode: 429 };
    }

    // ── 401 Token expired — re-auth and retry once ──
    if (status === 401) {
      log.info('Token expired — re-authenticating...');
      isAuthenticated = false;
      const loginOk = await doLogin();
      if (!loginOk) return { ok: false, error: 'Re-auth failed' };

      try {
        const resp2 = body
          ? await p[method](endpoint, body)
          : await p[method](endpoint);
        const data2 = await resp2.json();
        return { ok: true, data: data2 };
      } catch (err2) {
        const status2 = err2?.response?.status || err2?.statusCode;
        if (status2 === 429) {
          const retryAfter = extractRetryAfter(err2);
          return { ok: false, error: 'Rate limited on retry', rateLimited: true, retryAfter, statusCode: 429 };
        }
        return { ok: false, error: err2?.message || 'Retry failed' };
      }
    }

    return { ok: false, error: err?.message || 'API call failed' };
  }
}

// ─── Presence API ──────────────────────────────────────────

/**
 * List all user extensions on the account.
 * Use this to discover extension IDs for your agents.
 */
async function listExtensions() {
  const result = await apiCall('get', '/restapi/v1.0/account/~/extension?type=User&status=Enabled&perPage=100');
  if (!result.ok) return [];

  return (result.data.records || []).map(ext => ({
    id: ext.id.toString(),
    extensionNumber: ext.extensionNumber,
    name: ext.name,
    email: ext.contact?.email || null,
    status: ext.status
  }));
}

/**
 * Get presence status for a single extension.
 */
async function getPresence(extensionId) {
  const result = await apiCall('get',
    `/restapi/v1.0/account/~/extension/${extensionId}/presence?detailedTelephonyState=true`
  );
  return result.ok ? result.data : null;
}

/**
 * Set DND status for an extension.
 */
async function setDnd(extensionId, enabled) {
  const result = await apiCall('put',
    `/restapi/v1.0/account/~/extension/${extensionId}/presence`,
    { dndStatus: enabled ? 'DoNotAcceptAnyCalls' : 'TakeAllCalls' }
  );
  return result.ok ? result.data : null;
}

/**
 * Get current access token (for CX token exchange later).
 */
async function getAccessToken() {
  if (!platform) return null;
  try {
    const tokenData = await platform.auth().data();
    return tokenData.access_token;
  } catch (err) {
    log.error('Failed to get access token:', err.message);
    return null;
  }
}

/**
 * Get current auth status.
 */
function getAuthStatus() {
  return { isAuthenticated, sdkInitialized: !!rcSdk };
}

module.exports = {
  warmup,
  doLogin,
  getPlatform,
  getAuthStatus,
  getAccessToken,
  listExtensions,
  getPresence,
  setDnd,
  apiCall
};
