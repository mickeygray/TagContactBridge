// services/tiktokService.js
// ─────────────────────────────────────────────────────────────
// TikTok Lead Generation API integration.
// Polls for leads since TikTok doesn't push webhooks for leads.
// Company-aware: WYNN and TAG share one access token but have
// separate advertiser IDs under the same Business Center.
// ─────────────────────────────────────────────────────────────

const axios = require("axios");
const { getCompanyConfig } = require("../../shared/config/companyConfig");

const TT_APP_ID = process.env.TT_APP_ID;
const TT_APP_SECRET = process.env.TT_APP_SECRET;
const TT_SANDBOX = process.env.TT_SANDBOX === "true";

// Sandbox uses different base URL
const BASE_URL = TT_SANDBOX
  ? "https://sandbox-ads.tiktok.com/open_api/v1.3"
  : "https://business-api.tiktok.com/open_api/v1.3";

// Track processed lead IDs globally — TikTok lead IDs are unique across advertisers
const processedLeadIds = new Set();

/* -------------------------------------------------------------------------- */
/*                              HELPERS                                       */
/* -------------------------------------------------------------------------- */

/**
 * Get the access token for a company.
 * Both brands share a token — TAG can override with TAG_TT_ACCESS_TOKEN if needed.
 * @param {string} [company="WYNN"]
 */
function getAccessToken(company) {
  return (
    getCompanyConfig(company).ttAccessToken || process.env.TT_ACCESS_TOKEN || ""
  );
}

/**
 * Get the advertiser ID for a company.
 * @param {string} [company="WYNN"]
 */
function getAdvertiserId(company) {
  return getCompanyConfig(company).ttAdvertiserId || "";
}

/* -------------------------------------------------------------------------- */
/*                           API REQUEST                                      */
/* -------------------------------------------------------------------------- */

/**
 * Make authenticated request to TikTok API.
 * @param {string} method
 * @param {string} endpoint
 * @param {object} data
 * @param {string} [company="WYNN"]
 */
async function tiktokRequest(method, endpoint, data = {}, company = "WYNN") {
  const url = `${BASE_URL}${endpoint}`;
  const accessToken = getAccessToken(company);

  const config = {
    method,
    url,
    headers: {
      "Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  };

  if (method.toUpperCase() === "GET") {
    config.params = data;
  } else {
    config.data = data;
  }

  console.log(`[TIKTOK] ${method.toUpperCase()} ${endpoint} (${company})`);

  try {
    const response = await axios(config);
    return { ok: true, data: response.data };
  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    console.error(`[TIKTOK] Error (${company}): ${errMsg}`);
    if (err.response?.data) {
      console.error(
        "[TIKTOK] Response:",
        JSON.stringify(err.response.data, null, 2),
      );
    }
    return { ok: false, error: errMsg, details: err.response?.data };
  }
}

/* -------------------------------------------------------------------------- */
/*                           FORM / LEAD QUERIES                              */
/* -------------------------------------------------------------------------- */

/**
 * List all Instant Forms for the advertiser.
 * @param {string} [company="WYNN"]
 */
async function listForms(company = "WYNN") {
  const result = await tiktokRequest(
    "GET",
    "/pages/fields/get/",
    {
      advertiser_id: getAdvertiserId(company),
    },
    company,
  );

  if (result.ok) {
    console.log(
      `[TIKTOK] Forms (${company}):`,
      JSON.stringify(result.data, null, 2),
    );
  }
  return result;
}

/**
 * Get fields for a specific form/page.
 * @param {string} pageId
 * @param {string} [company="WYNN"]
 */
async function getFormFields(pageId, company = "WYNN") {
  const result = await tiktokRequest(
    "GET",
    "/page/field/get/",
    {
      advertiser_id: getAdvertiserId(company),
      page_id: pageId,
    },
    company,
  );

  if (result.ok) {
    console.log(
      `[TIKTOK] Form ${pageId} fields (${company}):`,
      JSON.stringify(result.data, null, 2),
    );
  }
  return result;
}

/**
 * Get leads for a specific page/form.
 *
 * @param {string} pageId     - The Instant Form ID
 * @param {object} opts       - Options
 * @param {number} opts.startTime  - Unix timestamp (seconds)
 * @param {number} opts.endTime    - Unix timestamp (seconds)
 * @param {number} opts.page       - Page number (default 1)
 * @param {number} opts.pageSize   - Results per page (default 100)
 * @param {string} [company="WYNN"]
 */
async function getLeads(pageId, opts = {}, company = "WYNN") {
  const now = Math.floor(Date.now() / 1000);
  const oneDayAgo = now - 24 * 60 * 60;

  const params = {
    advertiser_id: getAdvertiserId(company),
    page_id: pageId,
    start_time: opts.startTime || oneDayAgo,
    end_time: opts.endTime || now,
    page: opts.page || 1,
    page_size: opts.pageSize || 100,
  };

  const result = await tiktokRequest("GET", "/page/lead/get/", params, company);

  if (result.ok) {
    const leads = result.data?.data?.leads || [];
    console.log(
      `[TIKTOK] Found ${leads.length} lead(s) for page ${pageId} (${company})`,
    );
  }
  return result;
}

/**
 * Get a single lead by ID.
 * @param {string} leadId
 * @param {string} [company="WYNN"]
 */
async function getLead(leadId, company = "WYNN") {
  return await tiktokRequest(
    "GET",
    "/lead/get/",
    {
      advertiser_id: getAdvertiserId(company),
      lead_id: leadId,
    },
    company,
  );
}

/* -------------------------------------------------------------------------- */
/*                           MOCK / SANDBOX                                   */
/* -------------------------------------------------------------------------- */

/**
 * Create a mock/test lead (sandbox only).
 * @param {string} pageId
 * @param {object} fields
 * @param {string} [company="WYNN"]
 */
async function createMockLead(pageId, fields = {}, company = "WYNN") {
  const defaultFields = {
    name: "Test Lead",
    email: "test@example.com",
    phone_number: "+13105551234",
    ...fields,
  };

  const result = await tiktokRequest(
    "POST",
    "/page/lead/mock/create/",
    {
      advertiser_id: getAdvertiserId(company),
      page_id: pageId,
      lead_data: defaultFields,
    },
    company,
  );

  if (result.ok) {
    console.log(
      `[TIKTOK] ✓ Mock lead created (${company}):`,
      JSON.stringify(result.data, null, 2),
    );
  }
  return result;
}

/**
 * Get mock leads for testing.
 * @param {string} pageId
 * @param {string} [company="WYNN"]
 */
async function getMockLeads(pageId, company = "WYNN") {
  const result = await tiktokRequest(
    "GET",
    "/page/lead/mock/get/",
    {
      advertiser_id: getAdvertiserId(company),
      page_id: pageId,
    },
    company,
  );

  if (result.ok) {
    console.log(
      `[TIKTOK] Mock leads (${company}):`,
      JSON.stringify(result.data, null, 2),
    );
  }
  return result;
}

/**
 * Delete mock leads.
 * @param {string} pageId
 * @param {string} [company="WYNN"]
 */
async function deleteMockLeads(pageId, company = "WYNN") {
  return await tiktokRequest(
    "POST",
    "/page/lead/mock/delete/",
    {
      advertiser_id: getAdvertiserId(company),
      page_id: pageId,
    },
    company,
  );
}

/* -------------------------------------------------------------------------- */
/*                           NORMALIZATION                                    */
/* -------------------------------------------------------------------------- */

/**
 * Normalize TikTok lead data to our standard format.
 */
function normalizeLeadData(lead) {
  const fields = lead.lead_data || lead.fields || lead;

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

      if (fieldName.includes("name") || fieldName.includes("full_name"))
        name = fieldValue;
      else if (fieldName.includes("email")) email = fieldValue;
      else if (fieldName.includes("phone")) phone = fieldValue;
      else if (fieldName.includes("city")) city = fieldValue;
      else if (fieldName.includes("state") || fieldName.includes("province"))
        state = fieldValue;
    }
  } else {
    // Handle object format: {email: "test@example.com", name: "Test"}
    name = fields.name || fields.full_name || fields.fullname || "";
    email = fields.email || fields.email_address || "";
    phone = fields.phone || fields.phone_number || fields.phonenumber || "";
    city = fields.city || "";
    state = fields.state || fields.province || "";
  }

  // Normalize phone to 10 digits
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

/* -------------------------------------------------------------------------- */
/*                           POLLING                                          */
/* -------------------------------------------------------------------------- */

/**
 * Poll for new leads and return unprocessed ones.
 *
 * @param {string} pageId     - The Instant Form ID to poll
 * @param {object} opts       - Options for getLeads
 * @param {string} [company="WYNN"]
 * @returns {Array}           - Array of normalized, unprocessed leads
 */
async function pollForNewLeads(pageId, opts = {}, company = "WYNN") {
  const result = await getLeads(pageId, opts, company);

  if (!result.ok) {
    console.error(`[TIKTOK] Failed to poll leads (${company}):`, result.error);
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

    if (processedLeadIds.has(leadId)) continue;

    processedLeadIds.add(leadId);

    const normalized = normalizeLeadData(lead);
    newLeads.push({
      leadId,
      pageId,
      company,
      raw: lead,
      fields: normalized,
      meta: {
        lead_id: leadId,
        page_id: pageId,
        advertiser_id: getAdvertiserId(company),
        company,
        create_time: lead.create_time,
      },
    });
  }

  if (newLeads.length > 0) {
    console.log(`[TIKTOK] ${newLeads.length} new lead(s) (${company})`);
  }

  return newLeads;
}

/* -------------------------------------------------------------------------- */
/*                           STATUS / CONFIG                                  */
/* -------------------------------------------------------------------------- */

/**
 * Check if TikTok credentials are configured for a company.
 * @param {string} [company="WYNN"]
 */
function isConfigured(company = "WYNN") {
  return !!(
    TT_APP_ID &&
    TT_APP_SECRET &&
    getAccessToken(company) &&
    getAdvertiserId(company)
  );
}

/**
 * Get configuration status per company.
 * @param {string} [company="WYNN"]
 */
function getConfigStatus(company = "WYNN") {
  return {
    company,
    configured: isConfigured(company),
    sandbox: TT_SANDBOX,
    baseUrl: BASE_URL,
    hasAppId: !!TT_APP_ID,
    hasAppSecret: !!TT_APP_SECRET,
    hasAccessToken: !!getAccessToken(company),
    hasAdvertiserId: !!getAdvertiserId(company),
    advertiserId: getAdvertiserId(company)
      ? `...${getAdvertiserId(company).slice(-6)}`
      : "✗ MISSING",
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
