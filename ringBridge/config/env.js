// ringBridge/config/env.js
// ─────────────────────────────────────────────────────────────
// Reads from the parent TagContactBridge .env file.
// Reuses existing RING_CENTRAL_* env var names so you don't
// have to duplicate credentials — RC auth just works.
// ─────────────────────────────────────────────────────────────

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

module.exports = {
  // RingCentral — maps directly to existing TagContactBridge vars
  RC_SERVER_URL:
    process.env.RING_CENTRAL_SERVER_URL || "https://platform.ringcentral.com",
  RC_CLIENT_ID: process.env.RING_CENTRAL_CLIENT_ID || "",
  RC_CLIENT_SECRET: process.env.RING_CENTRAL_CLIENT_SECRET || "",
  RC_USER_JWT: process.env.RING_CENTRAL_JWT_TOKEN || "",

  // RingCX (add to parent .env when CX goes live)
  CX_ACCOUNT_ID: process.env.CX_ACCOUNT_ID || "",
  CX_BASE_URL: process.env.CX_BASE_URL || "https://ringcx.ringcentral.com",

  // Infrastructure
  MONGO_URI: process.env.MONGO_URI,
  NGROK_DOMAIN:
    process.env.NGROK_DOMAIN ||
    process.env.NGROK_STATIC_DOMAIN ||
    "https://tag-webhook.ngrok.app",
  WEBHOOK_SECRET:
    process.env.RINGBRIDGE_WEBHOOK_SECRET || "ringbridge-verify-token",
  WIDGET_JWT_SECRET:
    process.env.RINGBRIDGE_JWT_SECRET || "change-me-in-production",
  PORT: process.env.RINGBRIDGE_PORT || 6000,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};
