// config/companyConfig.js
// ─────────────────────────────────────────────────────────────
// Multi-company configuration.
//
// Centralizes ALL company-specific settings so the cadence
// engine, webhook routes, SMS, email, RVM, and dialer can
// resolve the right credentials by company key.
//
// Includes resolvers for:
//   - Facebook page_id → company
//   - TikTok advertiser_id → company
//   - lead-contact payload → company
// ─────────────────────────────────────────────────────────────

const path = require("path");

const COMPANIES = {
  WYNN: {
    key: "WYNN",
    name: "Wynn Tax Solutions",
    logicsDomain: "WYNN",
    clientContactPhone: process.env.WYNN_CLIENT_CONTACT_PHONE || "",
    dropApiKey: process.env.WYNN_DROP_API_KEY || process.env.DROP_API_KEY || "",
    // Email
    fromEmail:
      process.env.WYNN_FROM_EMAIL ||
      process.env.FROM_EMAIL ||
      "inquiry@WynnTaxSolutions.com",
    alertEmail: process.env.WYNN_ALERT_EMAIL || "alert@wynntaxsolutions.com",
    toEmail:
      process.env.WYNN_TO_EMAIL ||
      process.env.TO_EMAIL ||
      "inquiry@taxadvocategroup.com",
    templateDir: path.join("WYNN", "ProspectWelcome"),
    logoFile: "Wynn_Logo.png",
    pdfFile: "wynn-tax-guide.pdf",
    sendgridApiKey: process.env.WYNN_API_KEY,
    // Phone / Dialer
    ringoutCaller:
      process.env.WYNN_RINGOUT_CALLER ||
      process.env.RING_CENTRAL_RINGOUT_CALLER ||
      "",
    callrailAccountId: process.env.CALL_RAIL_ACCOUNT_ID || "",
    callrailKey: process.env.CALL_RAIL_KEY || "",
    callrailTrackingNumber:
      process.env.WYNN_CALLRAIL_TRACKING ||
      process.env.CALL_RAIL_TRACKING_NUMBER ||
      "",
    callrailCompanyId:
      process.env.WYNN_CALLRAIL_COMPANY_ID ||
      process.env.CALL_RAIL_COMPANY_ID ||
      "",
    localPhone: "310-561-1009",
    tollFreePhone: "866-770-3749",

    // SMS
    scheduleUrl:
      process.env.WYNN_SCHEDULE_URL ||
      "https://www.wynntaxsolutions.com/schedule",

    // RVM (Drop.co)
    rvmAudioDir: "WYNN",
    dropCampaignToken:
      process.env.WYNN_DROP_CAMPAIGN_TOKEN ||
      process.env.DROP_CAMPAIGN_TOKEN ||
      "",
    dropTransferNumber:
      process.env.WYNN_DROP_TRANSFER_NUMBER ||
      process.env.DROP_TRANSFER_NUMBER ||
      "",
    ttAdvertiserId: process.env.WYNN_TT_ADVERTISER_ID,
    ttAccessToken: process.env.TT_ACCESS_TOKEN,
    // Facebook
    fbPageId: process.env.WYNN_FB_PAGE_ID || "",
    fbPageToken: process.env.FB_PAGE_TOKEN || process.env.FB_LEADS_ID || "",

    // TikTok
    ttAdvertiserId: process.env.WYNN_TT_ADVERTISER_ID || "",

    // Pre-ping
    allowedStates: ["OH", "IN", "KS", "NE", "MO", "IA", "ND", "SD", "OK", "CA"],
    minAge: 45,
  },

  TAG: {
    key: "TAG",
    name: "Tax Advocate Group",
    logicsDomain: "TAG",
    dropApiKey: process.env.TAG_DROP_API_KEY || process.env.DROP_API_KEY || "",
    // Email
    fromEmail: process.env.TAG_FROM_EMAIL || "inquiry@taxadvocategroup.com",
    toEmail: process.env.TAG_TO_EMAIL || "inquiry@taxadvocategroup.com",
    alertEmail: process.env.TAG_ALERT_EMAIL || "alert@taxadvocategroup.com",
    templateDir: path.join("TAG", "ProspectWelcome"),
    logoFile: "TAG_Logo.png",
    pdfFile: "tag-tax-guide.pdf",
    clientContactPhone: process.env.TAG_CLIENT_CONTACT_PHONE || "",
    sendgridApiKey: process.env.TAG_API_KEY || process.env.WYNN_API_KEY,
    ttAdvertiserId: process.env.TAG_TT_ADVERTISER_ID,
    ttAccessToken: process.env.TT_ACCESS_TOKEN,
    // Phone / Dialer
    ringoutCaller: process.env.TAG_RINGOUT_CALLER || "",
    callrailAccountId:
      process.env.TAG_CALL_RAIL_ACCOUNT_ID ||
      process.env.CALL_RAIL_ACCOUNT_ID ||
      "",
    callrailKey:
      process.env.TAG_CALL_RAIL_KEY || process.env.CALL_RAIL_KEY || "",
    callrailTrackingNumber: process.env.TAG_CALLRAIL_TRACKING || "",
    callrailCompanyId: process.env.TAG_CALLRAIL_COMPANY_ID || "",
    localPhone: "",
    tollFreePhone: process.env.TAG_PHONE || "800-471-9431",

    // SMS
    scheduleUrl:
      process.env.TAG_SCHEDULE_URL ||
      "https://www.taxadvocategroup.com/schedule",

    // RVM (Drop.co)
    rvmAudioDir: "TAG",
    dropCampaignToken:
      process.env.TAG_DROP_CAMPAIGN_TOKEN ||
      process.env.DROP_CAMPAIGN_TOKEN ||
      "",
    dropTransferNumber:
      process.env.TAG_DROP_TRANSFER_NUMBER ||
      process.env.DROP_TRANSFER_NUMBER ||
      "",

    // Facebook
    fbPageId: process.env.TAG_FB_PAGE_ID || "",
    fbPageToken: process.env.TAG_FB_PAGE_TOKEN || "",

    // TikTok
    ttAdvertiserId: process.env.TAG_TT_ADVERTISER_ID || "",

    // Pre-ping
    allowedStates: ["OH", "IN", "KS", "NE", "MO", "IA", "ND", "SD", "OK", "CA"],
    minAge: 45,
  },
};

const DEFAULT_COMPANY = "WYNN";

/* ══════════════════════════════════════════════════════════════
   GETTERS
   ══════════════════════════════════════════════════════════════ */

function getCompanyConfig(company) {
  const key = (company || DEFAULT_COMPANY).toUpperCase();
  return COMPANIES[key] || COMPANIES[DEFAULT_COMPANY];
}

function getTemplatePaths(company) {
  const config = getCompanyConfig(company);
  const baseDir = path.join(__dirname, "..", "Templates", config.templateDir);
  return {
    templatePath: path.join(baseDir, "handlebars", "ProspectWelcome1.hbs"),
    logoPath: path.join(baseDir, "images", config.logoFile),
    pdfPath: path.join(baseDir, "attachments", config.pdfFile),
  };
}

function getRvmAudioBase(company) {
  const config = getCompanyConfig(company);
  const baseUrl =
    process.env.RVM_AUDIO_BASE_URL || "https://tag-webhook.ngrok.app/audio";
  return `${baseUrl}/${config.rvmAudioDir}`;
}

function getCompanyKeys() {
  return Object.keys(COMPANIES);
}

/* ══════════════════════════════════════════════════════════════
   COMPANY RESOLVERS
   ══════════════════════════════════════════════════════════════ */

/**
 * Resolve company from a Facebook webhook entry.
 * @param {string} pageId — Facebook page ID from webhook
 * @returns {string} company key ("WYNN", "TAG")
 */
function resolveCompanyFromFbPageId(pageId) {
  if (!pageId) return DEFAULT_COMPANY;
  const pid = String(pageId);
  for (const config of Object.values(COMPANIES)) {
    if (config.fbPageId && String(config.fbPageId) === pid) {
      return config.key;
    }
  }
  console.warn(
    `[COMPANY] Unknown FB page_id: ${pageId} → defaulting to ${DEFAULT_COMPANY}`,
  );
  return DEFAULT_COMPANY;
}

/**
 * Resolve company from a TikTok webhook entry.
 * @param {string} advertiserId — TikTok advertiser ID
 * @returns {string} company key
 */
function resolveCompanyFromTtAdvertiserId(advertiserId) {
  if (!advertiserId) return DEFAULT_COMPANY;
  const aid = String(advertiserId);
  for (const config of Object.values(COMPANIES)) {
    if (config.ttAdvertiserId && String(config.ttAdvertiserId) === aid) {
      return config.key;
    }
  }
  console.warn(
    `[COMPANY] Unknown TT advertiser_id: ${advertiserId} → defaulting to ${DEFAULT_COMPANY}`,
  );
  return DEFAULT_COMPANY;
}

/**
 * Resolve company from a lead-contact payload.
 * Checks (in order):
 *   1. Explicit company field in payload
 *   2. Domain in referer/origin header
 *   3. Source string inference
 *   4. Default
 *
 * @param {object} body — Request body
 * @param {object} [headers] — Request headers
 * @returns {string} company key
 */
function resolveCompanyFromPayload(body, headers) {
  // 1. Explicit company field
  const explicit = body?.company || body?.Company;
  if (explicit) {
    const key = String(explicit).toUpperCase();
    if (COMPANIES[key]) return key;
  }

  // 2. Domain from referer or origin
  const referer = headers?.referer || headers?.origin || "";
  if (referer.includes("wynntaxsolutions")) return "WYNN";
  if (referer.includes("taxadvocategroup")) return "TAG";

  // 3. Source-based inference
  const source = (body?.source || body?.Source || "").toLowerCase();
  if (source.includes("wynn")) return "WYNN";
  if (source.includes("tag")) return "TAG";

  // 4. Default
  return DEFAULT_COMPANY;
}

/**
 * Get the FB page token for a company.
 * @param {string} company
 * @returns {string}
 */
function getFbPageToken(company) {
  return getCompanyConfig(company).fbPageToken || "";
}

module.exports = {
  getCompanyConfig,
  getTemplatePaths,
  getRvmAudioBase,
  getCompanyKeys,
  resolveCompanyFromFbPageId,
  resolveCompanyFromTtAdvertiserId,
  resolveCompanyFromPayload,
  getFbPageToken,
  COMPANIES,
  DEFAULT_COMPANY,
};
