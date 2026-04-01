// services/callFireService.js
// ─────────────────────────────────────────────────────────────
// CallFire integration for Day 2+ auto-dialer.
// DEBUG VERSION - verbose logging
// ─────────────────────────────────────────────────────────────

const axios = require("axios");

const CALLFIRE_USER = process.env.CALLFIRE_USER;
const CALLFIRE_PASSWORD = process.env.CALLFIRE_PASSWORD;
const CALLFIRE_BROADCAST_ID = process.env.CALLFIRE_BROADCAST_ID;
const CALLFIRE_FROM_NUMBER = process.env.CALLFIRE_FROM_NUMBER;

const CALLFIRE_BASE = "https://api.callfire.com/v2";

/**
 * Log config status on first use
 */
let configLogged = false;
function logConfig() {
  if (configLogged) return;
  configLogged = true;

  console.log("[CALLFIRE:SERVICE] ══════════════════════════════════════════");
  console.log("[CALLFIRE:SERVICE] Configuration:");
  console.log(
    `[CALLFIRE:SERVICE]   User: ${CALLFIRE_USER ? CALLFIRE_USER.substring(0, 10) + "..." : "MISSING"}`,
  );
  console.log(
    `[CALLFIRE:SERVICE]   Password: ${CALLFIRE_PASSWORD ? "***" : "MISSING"}`,
  );
  console.log(
    `[CALLFIRE:SERVICE]   Broadcast ID: ${CALLFIRE_BROADCAST_ID || "MISSING"}`,
  );
  console.log(
    `[CALLFIRE:SERVICE]   From Number: ${CALLFIRE_FROM_NUMBER || "MISSING"}`,
  );
  console.log("[CALLFIRE:SERVICE] ══════════════════════════════════════════");
}

/**
 * Get Basic Auth header for CallFire
 */
function getAuthHeader() {
  const credentials = Buffer.from(
    `${CALLFIRE_USER}:${CALLFIRE_PASSWORD}`,
  ).toString("base64");
  return `Basic ${credentials}`;
}

/**
 * Add a single contact to the voice broadcast.
 *
 * @param {string} phone - E.164 or 10-digit phone number
 * @param {string} name - Contact name (for logging/tracking)
 * @param {object} attributes - Optional attributes to pass to CallFire
 * @returns {{ ok: boolean, contactId?: string, error?: string }}
 */
async function addContactToBroadcast(phone, name, attributes = {}) {
  logConfig();

  console.log("[CALLFIRE:SERVICE] addContactToBroadcast()");
  console.log(`[CALLFIRE:SERVICE]   Phone: ${phone}`);
  console.log(`[CALLFIRE:SERVICE]   Name: ${name}`);

  if (!CALLFIRE_USER || !CALLFIRE_PASSWORD || !CALLFIRE_BROADCAST_ID) {
    console.error("[CALLFIRE:SERVICE] ✗ Missing credentials or broadcast ID");
    return { ok: false, error: "Missing CallFire configuration" };
  }

  // Normalize phone to E.164
  let e164 = phone.replace(/\D/g, "");
  if (e164.length === 10) {
    e164 = "1" + e164;
  }
  if (!e164.startsWith("1")) {
    e164 = "1" + e164;
  }

  console.log(`[CALLFIRE:SERVICE]   E.164: ${e164}`);

  try {
    const url = `${CALLFIRE_BASE}/calls/broadcasts/${CALLFIRE_BROADCAST_ID}/recipients`;
    console.log(`[CALLFIRE:SERVICE]   URL: ${url}`);

    const payload = [
      {
        phoneNumber: e164,
        attributes: {
          name: name || "Lead",
          ...attributes,
        },
      },
    ];
    console.log(
      `[CALLFIRE:SERVICE]   Payload:`,
      JSON.stringify(payload, null, 2),
    );

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json",
      },
    });

    console.log(
      `[CALLFIRE:SERVICE] ✓ Response:`,
      JSON.stringify(response.data, null, 2),
    );

    return {
      ok: true,
      contactId: response.data?.items?.[0]?.id,
      data: response.data,
    };
  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    console.error(`[CALLFIRE:SERVICE] ✗ Failed: ${errMsg}`);
    if (err.response) {
      console.error("[CALLFIRE:SERVICE]   Status:", err.response.status);
      console.error(
        "[CALLFIRE:SERVICE]   Data:",
        JSON.stringify(err.response.data, null, 2),
      );
    }
    return { ok: false, error: errMsg };
  }
}

/**
 * Add multiple contacts to the voice broadcast.
 *
 * @param {Array<{phone: string, name: string, caseId?: number}>} contacts
 * @returns {{ ok: boolean, added: number, failed: number, errors: Array }}
 */
async function addContactsToBroadcast(contacts) {
  logConfig();

  console.log("[CALLFIRE:SERVICE] ══════════════════════════════════════════");
  console.log("[CALLFIRE:SERVICE] addContactsToBroadcast()");
  console.log(`[CALLFIRE:SERVICE]   Contact count: ${contacts.length}`);

  if (!CALLFIRE_USER || !CALLFIRE_PASSWORD || !CALLFIRE_BROADCAST_ID) {
    console.error("[CALLFIRE:SERVICE] ✗ Missing credentials or broadcast ID");
    return {
      ok: false,
      added: 0,
      failed: contacts.length,
      errors: ["Missing configuration"],
    };
  }

  // Format contacts for CallFire API
  const recipients = contacts.map((c) => {
    let e164 = (c.phone || "").replace(/\D/g, "");
    if (e164.length === 10) e164 = "1" + e164;
    if (!e164.startsWith("1")) e164 = "1" + e164;

    return {
      phoneNumber: e164,
      attributes: {
        name: c.name || "Lead",
        caseId: c.caseId ? String(c.caseId) : "",
      },
    };
  });

  console.log(
    "[CALLFIRE:SERVICE]   Sample recipients:",
    JSON.stringify(recipients.slice(0, 3), null, 2),
  );

  try {
    const url = `${CALLFIRE_BASE}/calls/broadcasts/${CALLFIRE_BROADCAST_ID}/recipients`;
    console.log(`[CALLFIRE:SERVICE]   URL: ${url}`);

    const response = await axios.post(url, recipients, {
      headers: {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json",
      },
    });

    const added = response.data?.items?.length || 0;
    console.log(`[CALLFIRE:SERVICE] ✓ Added ${added} contacts`);
    console.log(
      "[CALLFIRE:SERVICE]   Response:",
      JSON.stringify(response.data, null, 2).substring(0, 1000),
    );
    console.log(
      "[CALLFIRE:SERVICE] ══════════════════════════════════════════",
    );

    return {
      ok: true,
      added,
      failed: contacts.length - added,
      errors: [],
      data: response.data,
    };
  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    console.error(`[CALLFIRE:SERVICE] ✗ Bulk add failed: ${errMsg}`);
    if (err.response) {
      console.error("[CALLFIRE:SERVICE]   Status:", err.response.status);
      console.error(
        "[CALLFIRE:SERVICE]   Data:",
        JSON.stringify(err.response.data, null, 2),
      );
    }
    console.log(
      "[CALLFIRE:SERVICE] ══════════════════════════════════════════",
    );

    return {
      ok: false,
      added: 0,
      failed: contacts.length,
      errors: [errMsg],
    };
  }
}

/**
 * Start or resume the voice broadcast (if it's paused).
 */
async function startBroadcast() {
  logConfig();

  console.log("[CALLFIRE:SERVICE] ══════════════════════════════════════════");
  console.log("[CALLFIRE:SERVICE] startBroadcast()");

  if (!CALLFIRE_BROADCAST_ID) {
    console.error("[CALLFIRE:SERVICE] ✗ No broadcast ID configured");
    return { ok: false, error: "No broadcast ID configured" };
  }

  try {
    // First, check current status
    const statusUrl = `${CALLFIRE_BASE}/calls/broadcasts/${CALLFIRE_BROADCAST_ID}`;
    console.log(`[CALLFIRE:SERVICE] Checking current status...`);

    const statusResp = await axios.get(statusUrl, {
      headers: {
        Authorization: getAuthHeader(),
      },
    });

    const currentStatus = statusResp.data?.status;
    console.log(
      `[CALLFIRE:SERVICE] Current broadcast status: ${currentStatus}`,
    );
    console.log(
      `[CALLFIRE:SERVICE] Broadcast details:`,
      JSON.stringify(statusResp.data, null, 2),
    );

    // Now try to start
    const startUrl = `${CALLFIRE_BASE}/calls/broadcasts/${CALLFIRE_BROADCAST_ID}/start`;
    console.log(`[CALLFIRE:SERVICE] Starting broadcast...`);
    console.log(`[CALLFIRE:SERVICE] URL: ${startUrl}`);

    const startResp = await axios.post(
      startUrl,
      {},
      {
        headers: {
          Authorization: getAuthHeader(),
          "Content-Type": "application/json",
        },
      },
    );

    console.log(
      `[CALLFIRE:SERVICE] Start response status: ${startResp.status}`,
    );
    console.log(
      `[CALLFIRE:SERVICE] Start response data:`,
      JSON.stringify(startResp.data, null, 2),
    );

    // Check status again after start
    const afterResp = await axios.get(statusUrl, {
      headers: {
        Authorization: getAuthHeader(),
      },
    });

    console.log(
      `[CALLFIRE:SERVICE] Status after start: ${afterResp.data?.status}`,
    );
    console.log("[CALLFIRE:SERVICE] ✓ Broadcast started");
    console.log(
      "[CALLFIRE:SERVICE] ══════════════════════════════════════════",
    );

    return { ok: true, status: afterResp.data?.status };
  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    console.error(`[CALLFIRE:SERVICE] ✗ Failed to start: ${errMsg}`);
    if (err.response) {
      console.error("[CALLFIRE:SERVICE] HTTP Status:", err.response.status);
      console.error(
        "[CALLFIRE:SERVICE] Response headers:",
        JSON.stringify(err.response.headers, null, 2),
      );
      console.error(
        "[CALLFIRE:SERVICE] Response data:",
        JSON.stringify(err.response.data, null, 2),
      );
    }
    console.log(
      "[CALLFIRE:SERVICE] ══════════════════════════════════════════",
    );
    return { ok: false, error: errMsg };
  }
}

/**
 * Get broadcast status
 */
async function getBroadcastStatus() {
  logConfig();

  console.log("[CALLFIRE:SERVICE] getBroadcastStatus()");

  if (!CALLFIRE_BROADCAST_ID) {
    console.error("[CALLFIRE:SERVICE] ✗ No broadcast ID configured");
    return { ok: false, error: "No broadcast ID configured" };
  }

  try {
    const url = `${CALLFIRE_BASE}/calls/broadcasts/${CALLFIRE_BROADCAST_ID}`;
    console.log(`[CALLFIRE:SERVICE]   URL: ${url}`);

    const response = await axios.get(url, {
      headers: {
        Authorization: getAuthHeader(),
      },
    });

    console.log("[CALLFIRE:SERVICE] ✓ Status:", response.data?.status);
    console.log(
      "[CALLFIRE:SERVICE]   Data:",
      JSON.stringify(response.data, null, 2).substring(0, 500),
    );

    return { ok: true, status: response.data?.status, data: response.data };
  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    console.error(`[CALLFIRE:SERVICE] ✗ Status check failed: ${errMsg}`);
    return { ok: false, error: errMsg };
  }
}

module.exports = {
  addContactToBroadcast,
  addContactsToBroadcast,
  startBroadcast,
  getBroadcastStatus,
};
