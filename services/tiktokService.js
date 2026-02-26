// services/tiktokService.js
// ─────────────────────────────────────────────────────────────
// TikTok Lead Generation API integration.
// Polls for leads since TikTok doesn't push webhooks for leads.
// ─────────────────────────────────────────────────────────────

const axios = require("axios");

const TT_APP_ID = process.env.TT_APP_ID;
const TT_APP_SECRET = process.env.TT_APP_SECRET;
const TT_ACCESS_TOKEN = process.env.TT_ACCESS_TOKEN;
const TT_ADVERTISER_ID = process.env.TT_ADVERTISER_ID;
const TT_SANDBOX = process.env.TT_SANDBOX === "true";

// Sandbox uses different base URL
const BASE_URL = TT_SANDBOX
  ? "https://sandbox-ads.tiktok.com/open_api/v1.3"
  : "https://business-api.tiktok.com/open_api/v1.3";

// Track processed lead IDs to avoid duplicates
const processedLeadIds = new Set();

/**
 * Make authenticated request to TikTok API
 */
async function tiktokRequest(method, endpoint, data = {}) {
  const url = `${BASE_URL}${endpoint}`;

  const config = {
    method,
    url,
    headers: {
      "Access-Token": TT_ACCESS_TOKEN,
      "Content-Type": "application/json",
    },
  };

  if (method.toUpperCase() === "GET") {
    config.params = data;
  } else {
    config.data = data;
  }

  console.log(`[TIKTOK] ${method.toUpperCase()} ${endpoint}`);

  try {
    const response = await axios(config);
    return { ok: true, data: response.data };
  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    console.error(`[TIKTOK] Error: ${errMsg}`);
    if (err.response?.data) {
      console.error(
        "[TIKTOK] Response:",
        JSON.stringify(err.response.data, null, 2),
      );
    }
    return { ok: false, error: errMsg, details: err.response?.data };
  }
}

/**
 * List all Instant Forms (Pages) for the advertiser
 */
async function listForms() {
  const result = await tiktokRequest("GET", "/pages/fields/get/", {
    advertiser_id: TT_ADVERTISER_ID,
  });

  if (result.ok) {
    console.log("[TIKTOK] Forms:", JSON.stringify(result.data, null, 2));
  }
  return result;
}

/**
 * Get fields for a specific form/page
 */
async function getFormFields(pageId) {
  const result = await tiktokRequest("GET", "/page/field/get/", {
    advertiser_id: TT_ADVERTISER_ID,
    page_id: pageId,
  });

  if (result.ok) {
    console.log(
      `[TIKTOK] Form ${pageId} fields:`,
      JSON.stringify(result.data, null, 2),
    );
  }
  return result;
}

/**
 * Get leads for a specific page/form
 *
 * @param {string} pageId - The Instant Form ID
 * @param {object} opts - Options
 * @param {number} opts.startTime - Unix timestamp (seconds) for start of date range
 * @param {number} opts.endTime - Unix timestamp (seconds) for end of date range
 * @param {number} opts.page - Page number (default 1)
 * @param {number} opts.pageSize - Results per page (default 100)
 */
async function getLeads(pageId, opts = {}) {
  const now = Math.floor(Date.now() / 1000);
  const oneDayAgo = now - 24 * 60 * 60;

  const params = {
    advertiser_id: TT_ADVERTISER_ID,
    page_id: pageId,
    start_time: opts.startTime || oneDayAgo,
    end_time: opts.endTime || now,
    page: opts.page || 1,
    page_size: opts.pageSize || 100,
  };

  const result = await tiktokRequest("GET", "/page/lead/get/", params);

  if (result.ok) {
    const leads = result.data?.data?.leads || [];
    console.log(`[TIKTOK] Found ${leads.length} leads for page ${pageId}`);
  }
  return result;
}

/**
 * Get a single lead by ID
 */
async function getLead(leadId) {
  const result = await tiktokRequest("GET", "/lead/get/", {
    advertiser_id: TT_ADVERTISER_ID,
    lead_id: leadId,
  });

  return result;
}

/**
 * Create a mock/test lead (sandbox only)
 */
async function createMockLead(pageId, fields = {}) {
  const defaultFields = {
    name: "Test Lead",
    email: "test@example.com",
    phone_number: "+13105551234",
    ...fields,
  };

  const result = await tiktokRequest("POST", "/page/lead/mock/create/", {
    advertiser_id: TT_ADVERTISER_ID,
    page_id: pageId,
    lead_data: defaultFields,
  });

  if (result.ok) {
    console.log(
      "[TIKTOK] ✓ Mock lead created:",
      JSON.stringify(result.data, null, 2),
    );
  }
  return result;
}

/**
 * Get mock leads for testing
 */
async function getMockLeads(pageId) {
  const result = await tiktokRequest("GET", "/page/lead/mock/get/", {
    advertiser_id: TT_ADVERTISER_ID,
    page_id: pageId,
  });

  if (result.ok) {
    console.log("[TIKTOK] Mock leads:", JSON.stringify(result.data, null, 2));
  }
  return result;
}

/**
 * Delete mock leads
 */
async function deleteMockLeads(pageId) {
  const result = await tiktokRequest("POST", "/page/lead/mock/delete/", {
    advertiser_id: TT_ADVERTISER_ID,
    page_id: pageId,
  });

  return result;
}

/**
 * Normalize TikTok lead data to our standard format
 */
function normalizeLeadData(lead) {
  const fields = lead.lead_data || lead.fields || lead;

  // TikTok can send fields in different formats
  let name = "";
  let email = "";
  let phone = "";
  let city = "";
  let state = "";

  // Handle array format: [{field_name: "email", field_value: "test@example.com"}]
  if (Array.isArray(fields)) {
    for (const field of fields) {
      const fieldName = (field.field_name || field.name || "").toLowerCase();
      const fieldValue = field.field_value || field.value || "";

      if (fieldName.includes("name") || fieldName.includes("full_name")) {
        name = fieldValue;
      } else if (fieldName.includes("email")) {
        email = fieldValue;
      } else if (fieldName.includes("phone")) {
        phone = fieldValue;
      } else if (fieldName.includes("city")) {
        city = fieldValue;
      } else if (
        fieldName.includes("state") ||
        fieldName.includes("province")
      ) {
        state = fieldValue;
      }
    }
  } else {
    // Handle object format: {email: "test@example.com", name: "Test"}
    name = fields.name || fields.full_name || fields.fullname || "";
    email = fields.email || fields.email_address || "";
    phone = fields.phone || fields.phone_number || fields.phonenumber || "";
    city = fields.city || "";
    state = fields.state || fields.province || "";
  }

  // Normalize phone to digits only
  const phoneDigits = (phone || "").replace(/\D/g, "");
  const phone10 =
    phoneDigits.length === 11 && phoneDigits.startsWith("1")
      ? phoneDigits.slice(1)
      : phoneDigits;

  return {
    name: String(name).trim(),
    email: String(email).trim(),
    phone: phone10,
    city: String(city).trim(),
    state: String(state).trim(),
  };
}

/**
 * Poll for new leads and return unprocessed ones
 *
 * @param {string} pageId - The Instant Form ID to poll
 * @param {object} opts - Options for getLeads
 * @returns {Array} - Array of normalized, unprocessed leads
 */
async function pollForNewLeads(pageId, opts = {}) {
  const result = await getLeads(pageId, opts);

  if (!result.ok) {
    console.error("[TIKTOK] Failed to poll leads:", result.error);
    return [];
  }

  const allLeads = result.data?.data?.leads || [];
  const newLeads = [];

  for (const lead of allLeads) {
    const leadId = lead.lead_id || lead.id;

    if (!leadId) {
      console.warn("[TIKTOK] Lead missing ID, skipping");
      continue;
    }

    if (processedLeadIds.has(leadId)) {
      continue; // Already processed
    }

    // Mark as processed
    processedLeadIds.add(leadId);

    // Normalize and add to results
    const normalized = normalizeLeadData(lead);
    newLeads.push({
      leadId,
      pageId,
      raw: lead,
      fields: normalized,
      meta: {
        lead_id: leadId,
        page_id: pageId,
        advertiser_id: TT_ADVERTISER_ID,
        create_time: lead.create_time,
      },
    });
  }

  if (newLeads.length > 0) {
    console.log(`[TIKTOK] Found ${newLeads.length} new lead(s)`);
  }

  return newLeads;
}

/**
 * Check if TikTok credentials are configured
 */
function isConfigured() {
  return !!(TT_APP_ID && TT_APP_SECRET && TT_ACCESS_TOKEN && TT_ADVERTISER_ID);
}

/**
 * Get configuration status
 */
function getConfigStatus() {
  return {
    configured: isConfigured(),
    sandbox: TT_SANDBOX,
    baseUrl: BASE_URL,
    hasAppId: !!TT_APP_ID,
    hasAppSecret: !!TT_APP_SECRET,
    hasAccessToken: !!TT_ACCESS_TOKEN,
    hasAdvertiserId: !!TT_ADVERTISER_ID,
  };
}

module.exports = {
  listForms,
  getFormFields,
  getLeads,
  getLead,
  createMockLead,
  getMockLeads,
  deleteMockLeads,
  normalizeLeadData,
  pollForNewLeads,
  isConfigured,
  getConfigStatus,
  tiktokRequest,
};
