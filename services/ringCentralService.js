// services/ringCentralService.js
// ─────────────────────────────────────────────────────────────
// RingCentral RingOut integration with background auth.
//
// Strategy:
//   - warmup() runs at startup and on a 45-min timer
//   - Sets isAuthenticated = true on success, false on failure
//   - placeRingOutCall() just checks the flag (no async auth)
//   - If call fails with 401, flag flips and we retry once
// ─────────────────────────────────────────────────────────────

const RC = require("@ringcentral/sdk").SDK;

// Module-level state
let rcSdk = null;
let platform = null;
let isAuthenticated = false; // Simple flag - no async check needed

/**
 * Get or create the RingCentral platform instance.
 */
function getPlatform() {
  if (!rcSdk) {
    console.log("[RC] Creating SDK instance");
    rcSdk = new RC({
      server: process.env.RING_CENTRAL_SERVER_URL,
      clientId: process.env.RING_CENTRAL_CLIENT_ID,
      clientSecret: process.env.RING_CENTRAL_CLIENT_SECRET,
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

  console.log("[RC] Attempting login...");
  const startTime = Date.now();

  try {
    await p.login({ jwt: process.env.RING_CENTRAL_JWT_TOKEN });
    isAuthenticated = true;
    console.log(`[RC] ✓ Authenticated (took ${Date.now() - startTime}ms)`);
    return true;
  } catch (err) {
    isAuthenticated = false;
    console.error(
      `[RC] ✗ Auth failed (took ${Date.now() - startTime}ms):`,
      err.message,
    );
    return false;
  }
}

/**
 * Places a RingCentral RingOut call.
 * If isAuthenticated is true, goes straight to call (no async auth).
 * If false, attempts auth first.
 */
async function placeRingOutCall({ toNumber, fromNumber, playPrompt = false }) {
  console.log("[RC] ═══════════════════════════════════════");
  console.log("[RC] placeRingOutCall");
  console.log("[RC]   To:", toNumber);
  console.log("[RC]   From:", fromNumber);
  console.log("[RC]   Auth:", isAuthenticated ? "✓ ready" : "○ need login");

  if (!toNumber) return { ok: false, error: "Missing toNumber" };
  if (!fromNumber) return { ok: false, error: "Missing fromNumber" };

  // Only auth if we need to
  if (!isAuthenticated) {
    const loginOk = await doLogin();
    if (!loginOk) {
      return { ok: false, error: "Authentication failed" };
    }
  }

  const p = getPlatform();
  const body = {
    from: { phoneNumber: fromNumber },
    to: { phoneNumber: toNumber },
    playPrompt: !!playPrompt,
  };

  try {
    const resp = await p.post(
      "/restapi/v1.0/account/~/extension/~/ring-out",
      body,
    );
    const json = await resp.json();

    console.log("[RC] ✓ Call initiated:", json?.status?.callStatus);
    console.log("[RC] ═══════════════════════════════════════");

    return {
      ok: true,
      status: json?.status?.callStatus,
      sessionId: json?.id,
      raw: json,
    };
  } catch (err) {
    const status = err?.response?.status;
    console.error("[RC] ✗ RingOut error:", err.message, "HTTP:", status);

    // Token expired mid-cycle — re-auth and retry once
    if (status === 401) {
      console.log("[RC] Token expired — re-authenticating...");
      isAuthenticated = false;

      const loginOk = await doLogin();
      if (!loginOk) {
        return { ok: false, error: "Re-auth failed" };
      }

      try {
        const resp2 = await p.post(
          "/restapi/v1.0/account/~/extension/~/ring-out",
          body,
        );
        const json2 = await resp2.json();

        console.log("[RC] ✓ Retry successful:", json2?.status?.callStatus);
        return {
          ok: true,
          status: json2?.status?.callStatus,
          sessionId: json2?.id,
          raw: json2,
        };
      } catch (err2) {
        console.error("[RC] ✗ Retry failed:", err2.message);
        return {
          ok: false,
          error: err2?.message || "RingOut failed after retry",
        };
      }
    }

    console.log("[RC] ═══════════════════════════════════════");
    return { ok: false, error: err?.message || "RingOut failed" };
  }
}

/**
 * Proactively authenticate and keep session warm.
 * Call at startup with refresh interval.
 */
async function warmup(refreshIntervalMs = 45 * 60 * 1000) {
  console.log("[RC] ══════════════════════════════════════════════════");
  console.log("[RC] WARMUP: Authenticating at startup...");

  await doLogin();

  console.log("[RC] WARMUP: isAuthenticated =", isAuthenticated);
  console.log("[RC] WARMUP: Calls will now skip auth step");

  if (refreshIntervalMs > 0) {
    setInterval(async () => {
      console.log("[RC] REFRESH: Running scheduled re-auth...");
      await doLogin();
      console.log("[RC] REFRESH: isAuthenticated =", isAuthenticated);
    }, refreshIntervalMs);
    console.log(
      `[RC] WARMUP: Auto-refresh scheduled every ${Math.round(refreshIntervalMs / 60000)} min`,
    );
  }

  console.log("[RC] ══════════════════════════════════════════════════");
  return isAuthenticated;
}

/**
 * Get current auth status.
 */
function getAuthStatus() {
  return { isAuthenticated, sdkInitialized: !!rcSdk };
}

module.exports = {
  placeRingOutCall,
  warmup,
  getAuthStatus,
  doLogin,
};
