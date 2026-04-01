// ringBridge/cx/services/cxAuthService.js
// ─────────────────────────────────────────────────────────────
// RingCentral CX (NICE CXone) authentication.
// Completely separate from EX OAuth — different tokens, different
// endpoints, different credentials.
//
// Env vars:
//   CX_APP_ID        — CXone application ID
//   CX_APP_SECRET    — CXone application secret
//   CX_BUS_NO        — Business unit number
//   CX_API_CLUSTER   — API cluster (c1, c2, c3, b1, b2)
//   CX_USERNAME      — Admin username (for password grant)
//   CX_PASSWORD      — Admin password
// ─────────────────────────────────────────────────────────────

const axios = require("axios");
const log = require("../../utils/logger");

let accessToken = null;
let refreshToken = null;
let tokenExpiry = 0;
let baseUri = null;

const CLUSTER = process.env.CX_API_CLUSTER || "c1";
const AUTH_URL = `https://api-${CLUSTER}.niceincontact.com/InContactAuthorizationServer/Token`;

function isConfigured() {
  return !!(process.env.CX_APP_ID && process.env.CX_APP_SECRET);
}

async function authenticate() {
  if (!isConfigured()) {
    log.warn("[CX-AUTH] Not configured — set CX_APP_ID and CX_APP_SECRET");
    return false;
  }

  try {
    const res = await axios.post(AUTH_URL, {
      grant_type: "password",
      username: `${process.env.CX_BUS_NO}@${process.env.CX_USERNAME}`,
      password: process.env.CX_PASSWORD,
      scope: "",
    }, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${process.env.CX_APP_ID}:${process.env.CX_APP_SECRET}`).toString("base64")}`,
      },
    });

    accessToken = res.data.access_token;
    refreshToken = res.data.refresh_token;
    tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000; // refresh 60s early
    baseUri = res.data.resource_server_base_uri;

    log.success(`[CX-AUTH] Authenticated — base: ${baseUri}`);
    return true;
  } catch (err) {
    log.error(`[CX-AUTH] Auth failed: ${err.response?.data?.error_description || err.message}`);
    return false;
  }
}

async function refreshAuth() {
  if (!refreshToken) return authenticate();

  try {
    const res = await axios.post(AUTH_URL, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${process.env.CX_APP_ID}:${process.env.CX_APP_SECRET}`).toString("base64")}`,
      },
    });

    accessToken = res.data.access_token;
    refreshToken = res.data.refresh_token;
    tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
    return true;
  } catch {
    return authenticate(); // full re-auth on refresh failure
  }
}

async function getToken() {
  if (!accessToken || Date.now() >= tokenExpiry) {
    const ok = accessToken ? await refreshAuth() : await authenticate();
    if (!ok) return null;
  }
  return accessToken;
}

async function apiCall(method, path, data = null) {
  const token = await getToken();
  if (!token) throw new Error("CX not authenticated");

  const url = `${baseUri}services/v31.0${path}`;
  const config = {
    method,
    url,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  };
  if (data) config.data = data;

  const res = await axios(config);
  return res.data;
}

module.exports = { isConfigured, authenticate, getToken, apiCall };
