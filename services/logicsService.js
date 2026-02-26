const axios = require("axios");
const FormData = require("form-data");
const config = {
  TAG: {
    baseUrl: process.env.TAG_LOGICS_API_URL, // e.g. "https://taxag.irslogics.com/publicapi/2020-02-22"
    apiKey: process.env.LOGICS_API_KEY,
    secret: process.env.TAG_LOGICS_SECRET,
  },
  WYNN: {
    baseUrl: process.env.WYNN_LOGICS_API_URL, // e.g. "https://wynntax.logiqs.com/publicapi/2020-02-22"
    apiKey: process.env.WYNN_LOGICS_API_KEY,
    secret: process.env.WYNN_LOGICS_SECRET,
  },
  AMITY: {
    baseUrl: process.env.AMITY_LOGICS_API_URL, // if/when you need Amity file imports
    apiKey: process.env.AMITY_LOGICS_API_KEY,
    secret: process.env.AMITY_LOGICS_SECRET,
  },
};

/**
 * Posts a new casefile (lead) to the specified Logics domain.
 *
 * @param {"TAG"|"WYNN"|"AMITY"} domain
 * @param {Object} payload  // shape: { FirstName, LastName, Address, City, State, Zip, Notes, SourceName, ... }
 * @returns {Promise<Object>} response.data from the Logics API
 */
async function postCaseFile(domain, payload) {
  const { baseUrl, apiKey, secret } = config[domain] || config.TAG;
  const url = `${baseUrl}/Case/CaseFile`;

  const resp = await axios.post(url, payload, {
    headers: { "Content-Type": "application/json" },
    auth: {
      username: apiKey,
      password: secret,
    },
  });

  return resp.data;
}
async function updateCaseStatus(domain, statusId, searchPhone) {
  const domainConfig = config[domain] || config.TAG;
  const { baseUrl, apiKey, secret } = domainConfig;
  const url = `${baseUrl}/UpdateCase/UpdateCase`;
  const payload = {
    SearchPhone: searchPhone,
    StatusID: parseInt(statusId),
  };
  const headers = {
    "Content-Type": "application/json",
  };

  const resp = await axios.post(url, payload, {
    headers,
    auth: {
      username: apiKey,
      password: secret,
    },
  });
  console.log(resp.data);
  return resp.data;
}
async function uploadCaseDocument({
  caseNumber,
  comment,
  fileCategoryID,
  fileBuffer,
  filename,
  contentType,
}) {
  const formData = new FormData();
  formData.append("file", fileBuffer, { filename, contentType });
  const domainConfig = config[domain] || config.TAG;
  const { baseUrl, apiKey, secret } = domainConfig;
  const url =
    `${baseUrl}/Documents/CaseDocument` +
    `?CaseID=${caseNumber}` +
    `&Comment=${encodeURIComponent(comment)}` +
    `&FileCategoryID=${fileCategoryID}`;

  const resp = await axios.post(url, formData, {
    headers: {
      ...formData.getHeaders(),
    },
    auth: {
      username: apiKey,
      password: secret,
    },
  });
  return resp.data;
}

/** Fetch raw activity array for a case */
async function fetchActivities(domain, caseNumber) {
  console.log(domain);
  const { baseUrl, apiKey, secret } = config[domain] || config.TAG;

  // Build the full URL
  const url = `${baseUrl}/CaseActivity/Activity`;

  console.log("→ Logics GET", url, { CaseID: caseNumber });

  const resp = await axios.get(url, {
    // Basic Auth header: Authorization: Basic base64(apiKey:secret)
    auth: {
      username: apiKey,
      password: secret,
    },
    params: {
      CaseID: parseInt(caseNumber, 10),
    },
  });

  console.log(resp.data);
  return resp.data.Data;
}

/** Fetch raw invoice array for a case */
async function fetchInvoices(domain, caseID) {
  const { baseUrl, apiKey, secret } = config[domain] || config.TAG;
  const resp = await axios.get(`${baseUrl}/Billing/CaseInvoice`, {
    auth: {
      username: apiKey,
      password: secret,
    },
    params: { CaseID: parseInt(caseID) },
  });
  console.log(resp.data, "invoiceData");
  return resp.data.Data;
}

async function fetchTasks(domain, caseID) {
  const { baseUrl, apiKey, secret } = config[domain] || config.TAG;
  const resp = await axios.get(`${baseUrl}/task/task`, {
    auth: {
      username: apiKey,
      password: secret,
    },
    params: { CaseID: parseInt(caseID) },
  });
  console.log(resp.data, "taskData");
  return JSON.parse(resp.data.data || "[]");
}

/** Fetch raw payment array for a case */
async function fetchPayments(domain, caseNumber) {
  const { baseUrl, apiKey, secret } = config[domain] || config.TAG;
  const resp = await axios.get(`${baseUrl}/billing/casepayment`, {
    auth: {
      username: apiKey,
      password: secret,
    },
    params: { CaseID: parseInt(caseNumber) },
  });
  return JSON.parse(resp.data.data || "[]");
}

async function fetchBillingSummary(domain, caseNumber) {
  const { baseUrl, apiKey, secret } = config[domain] || config.TAG;
  const endpoint = "Billing/CaseBillingSummary";

  try {
    const response = await axios.get(`${baseUrl}${endpoint}`, {
      auth: {
        username: apiKey,
        password: secret,
      },
      params: {
        CaseID: parseInt(caseNumber),
      },
    });

    const summary = response.data.Data;

    return summary;
  } catch (error) {
    console.error(
      `❌ Error fetching PastDue for case #${caseNumber}:`,
      error.message,
    );
  }
}

async function createZeroInvoice(domain, caseNumber) {
  const { baseUrl, apiKey, secret } = config[domain] || config.TAG;
  const payload = {
    caseID: parseInt(caseNumber),
    invoiceTypeID: 7,
    quantity: 1,
    unitPrice: 0,
    date: Date.now(),
    invoiceTypeName: "Exploratory - Investigation & Transcript Analysis Fee",
    description: "NO A.S.",
    TagID: 3,
  };
  const url = `${baseUrl}/Billing/caseinvoice`;
  const resp = await axios.post(url, payload, {
    headers: { "Content-Type": "application/json" },
    auth: {
      username: apiKey,
      password: secret,
    },
  });
  return resp.data;
}
async function createActivityLoop(domain, caseId, comment) {
  // 1️⃣ Fetch existing activities for the case
  const activities = await fetchActivities(domain, caseId);

  // 2️⃣ Look for PB CALL LOG activity
  const existing = activities.find((act) => act.Subject === "PB CALL LOG");
  const url = `${config[domain].baseUrl}/CaseActivity/Activity`;

  const { apiKey, secret } = config[domain];
  const headers = {
    "Content-Type": "application/json",
  };

  if (!existing && !existing.ActivityID) {
    // 3b️⃣ Create new activity
    await axios.post(
      url,
      {
        CaseID: parseInt(caseId, 10),
        ActivityType: "General", // adjust as needed
        Subject: "PB CALL LOG",
        Comment: comment,
        Popup: false,
        Pin: true,
      },
      {
        headers,
        auth: {
          username: apiKey,
          password: secret,
        },
      },
    );
  }

  // 4️⃣ Return the comment for use in summaries
  return comment;
}

async function fetchCaseAccountContact(domain, caseId) {
  const { baseUrl, apiKey, secret } = config[domain];
  const url = `${baseUrl}/Billing/CaseAccount`;

  // Some tenants accept CaseID as a header, others as a query param.
  const tryHeader = () =>
    axios.get(url, {
      headers: {
        // CaseID header per your sample
        CaseID: String(caseId),
        "Content-Type": "application/json",
      },
      auth: { username: apiKey, password: secret },
      timeout: 20000,
    });

  const tryQuery = () =>
    axios.get(`${url}?CaseID=${encodeURIComponent(caseId)}`, {
      headers: { "Content-Type": "application/json" },
      auth: { username: apiKey, password: secret },
      timeout: 20000,
    });

  let resp;
  try {
    resp = await tryHeader();
  } catch (e) {
    // fallback to query param approach
    resp = await tryQuery();
  }

  const payload = resp?.data || {};
  if (payload.Success !== true) {
    return {
      caseId,
      phone: "",
      email: "",
      error: payload?.message || "Lookup failed",
    };
  }

  // Handle API returning stringified JSON in `data`
  let records = payload.data;
  if (typeof records === "string") {
    try {
      records = JSON.parse(records);
    } catch {
      records = [];
    }
  }
  if (!Array.isArray(records)) records = [];

  // Prefer PrimaryAccount, otherwise first record
  const acct = records.find((r) => r.PrimaryAccount) || records[0] || {};
  const phone = (acct.PhoneNo || "").trim();
  const email = (acct.EmailID || "").trim();

  return { caseId, phone, email };
}

/* -------------------------------------------------------------------------- */
/*  ADD THESE TO YOUR EXISTING logicsService.js                               */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*                         UTM → SourceName Mapping                           */
/* -------------------------------------------------------------------------- */

const SOURCE_NAME_MAP = {
  google: "VF Google",
  gclid: "VF Google",
  facebook: "VF Face/Insta",
  fb: "VF Face/Insta",
  instagram: "VF Face/Insta",
  ig: "VF Face/Insta",
  meta: "VF Face/Insta",
  fbclid: "VF Face/Insta",
  tiktok: "VF TikTok",
  tt: "VF TikTok",
  ttclid: "VF TikTok",
};

const DEFAULT_SOURCE_NAME = "VF Digital";

/**
 * Format phone to Logics format: (XXX)XXX-XXXX
 */
function formatPhoneForLogics(phone) {
  console.log("[LOGICS:formatPhone] Input:", phone);

  if (!phone) {
    console.log("[LOGICS:formatPhone] No phone provided → undefined");
    return undefined;
  }

  let d = String(phone).replace(/\D/g, "");
  console.log("[LOGICS:formatPhone] Digits only:", d, `(length: ${d.length})`);

  if (d.length === 11 && d.startsWith("1")) {
    d = d.slice(1);
    console.log("[LOGICS:formatPhone] Stripped leading 1:", d);
  }

  if (d.length !== 10) {
    console.log("[LOGICS:formatPhone] Not 10 digits → undefined");
    return undefined;
  }

  const formatted = `(${d.slice(0, 3)})${d.slice(3, 6)}-${d.slice(6)}`;
  console.log("[LOGICS:formatPhone] Formatted:", formatted);
  return formatted;
}

/**
 * Build a CaseFile payload for lead ads (Facebook, TikTok, etc.)
 */
function buildLeadAdPayload(fields, source, meta = {}) {
  console.log("[LOGICS:buildPayload] ══════════════════════════════════════");
  console.log(
    "[LOGICS:buildPayload] Input fields:",
    JSON.stringify(fields, null, 2),
  );
  console.log("[LOGICS:buildPayload] Source:", source);
  console.log("[LOGICS:buildPayload] Meta:", JSON.stringify(meta, null, 2));

  const { name, email, phone, state, city } = fields;

  // Parse name
  const nameParts = (name || "").trim().split(/\s+/);
  let firstName = nameParts[0] || "";
  let lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

  console.log("[LOGICS:buildPayload] Name parsing:", {
    raw: name,
    nameParts,
    firstName,
    lastName,
  });

  // Fallback for empty/test data
  if (!firstName || firstName.startsWith("<")) {
    console.log(
      "[LOGICS:buildPayload] FirstName empty or test data → 'Unknown'",
    );
    firstName = "Unknown";
    lastName = "Lead";
  }

  // Format phone
  const formattedPhone = formatPhoneForLogics(phone);

  // Build notes
  const notes = [];
  if (city) notes.push(`City: ${city}`);
  if (meta.formId)
    notes.push(`${source === "facebook" ? "FB" : "TT"} Form: ${meta.formId}`);
  if (meta.adgroupId) notes.push(`Ad Group: ${meta.adgroupId}`);
  if (meta.campaignId) notes.push(`Campaign: ${meta.campaignId}`);
  notes.push(
    `Source: ${source === "facebook" ? "Facebook" : "TikTok"} Lead Ad`,
  );

  console.log("[LOGICS:buildPayload] Notes:", notes);

  // Map source to SourceName
  const sourceKey = (source || "").toLowerCase().trim();
  const sourceName = SOURCE_NAME_MAP[sourceKey] || DEFAULT_SOURCE_NAME;
  console.log("[LOGICS:buildPayload] SourceName:", sourceKey, "→", sourceName);

  const payload = {
    FirstName: firstName,
    LastName: lastName,
    StatusID: 2,
    SourceName: sourceName,
  };

  if (email) {
    payload.Email = email;
    console.log("[LOGICS:buildPayload] Added Email:", email);
  }

  if (formattedPhone) {
    payload.CellPhone = formattedPhone;
    payload.SMSPermit = "true";
    console.log("[LOGICS:buildPayload] Added CellPhone:", formattedPhone);
  } else {
    console.log("[LOGICS:buildPayload] No valid phone to add");
  }

  if (state) {
    payload.State = state.toUpperCase().slice(0, 2);
    console.log("[LOGICS:buildPayload] Added State:", payload.State);
  }

  if (notes.length) {
    payload.Notes = notes.join(" | ");
  }

  console.log(
    "[LOGICS:buildPayload] Final payload:",
    JSON.stringify(payload, null, 2),
  );
  console.log("[LOGICS:buildPayload] ══════════════════════════════════════");

  return payload;
}

/**
 * Create a case from a lead ad submission
 */
async function createLeadAdCase(domain, fields, source, meta = {}) {
  console.log(
    "[LOGICS:createLeadAdCase] ══════════════════════════════════════",
  );
  console.log("[LOGICS:createLeadAdCase] Domain:", domain);
  console.log("[LOGICS:createLeadAdCase] Source:", source);
  console.log(
    "[LOGICS:createLeadAdCase] Fields:",
    JSON.stringify(fields, null, 2),
  );
  console.log("[LOGICS:createLeadAdCase] Meta:", JSON.stringify(meta, null, 2));

  try {
    const payload = buildLeadAdPayload(fields, source, meta);

    console.log("[LOGICS:createLeadAdCase] Calling postCaseFile...");
    const result = await postCaseFile(domain, payload);

    console.log(
      "[LOGICS:createLeadAdCase] postCaseFile response:",
      JSON.stringify(result, null, 2),
    );

    // Handle both:
    //  - result = { Data: { CaseID } }
    //  - result = axiosResponse = { data: { Data: { CaseID } } }
    const caseIdRaw =
      result?.Data?.CaseID ??
      result?.data?.Data?.CaseID ??
      result?.data?.CaseID ?? // keep just in case their wrapper uses this
      null;

    const caseIdNum = caseIdRaw != null ? Number(caseIdRaw) : null;
    const caseId = Number.isFinite(caseIdNum) ? caseIdNum : null;

    if (!caseId) {
      console.error(
        "[LOGICS:createLeadAdCase] ✗ No CaseID found in response (treating as failure)",
      );
      console.log(
        "[LOGICS:createLeadAdCase] ══════════════════════════════════════",
      );
      return {
        ok: false,
        caseId: null,
        error: "No CaseID returned from Logics",
      };
    }

    console.log("[LOGICS:createLeadAdCase] ✓ Case created — CaseID:", caseId);
    console.log(
      "[LOGICS:createLeadAdCase] ══════════════════════════════════════",
    );

    return { ok: true, caseId };
  } catch (err) {
    console.error("[LOGICS:createLeadAdCase] ✗ Error:", err.message);

    if (err.response) {
      console.error(
        "[LOGICS:createLeadAdCase] HTTP Status:",
        err.response.status,
      );
      console.error(
        "[LOGICS:createLeadAdCase] Response data:",
        JSON.stringify(err.response.data, null, 2),
      );
      console.error(
        "[LOGICS:createLeadAdCase] Response headers:",
        JSON.stringify(err.response.headers, null, 2),
      );
    }

    if (err.request) {
      console.error(
        "[LOGICS:createLeadAdCase] Request URL:",
        err.request?.path || err.config?.url,
      );
      console.error(
        "[LOGICS:createLeadAdCase] Request method:",
        err.config?.method,
      );
    }

    console.error(
      "[LOGICS:createLeadAdCase] ══════════════════════════════════════",
    );
    return { ok: false, caseId: null, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// ADD THIS to ./services/logicsService.js
// alongside your existing createLeadAdCase, config, etc.
// Then add fetchCaseInfo to module.exports.
// ─────────────────────────────────────────────────────────────

/**
 * Fetch case info from IRS Logics by CaseID.
 * Used by the cadence cron to check if status is still 1 or 2.
 *
 * @param {string} domain - "WYNN"
 * @param {number} caseId - Logics CaseID
 * @returns {{ ok: boolean, status?: number, data?: object, error?: string }}
 */
async function fetchCaseInfo(domain, caseId) {
  const { baseUrl, apiKey, secret } = config[domain] || config.WYNN;
  const url = `${baseUrl}/Case/CaseInfo`;

  console.log("[LOGICS:getCaseInfo] CaseID:", caseId, "URL:", url);

  try {
    const resp = await axios.get(url, {
      auth: { username: apiKey, password: secret },
      params: { CaseID: parseInt(caseId, 10) },
    });

    const body = resp.data;
    console.log(
      "[LOGICS:getCaseInfo] Response:",
      JSON.stringify(body, null, 2),
    );

    if (!body?.Success && !body?.Data) {
      return { ok: false, error: body?.Message || "No data returned" };
    }

    const caseData = body.Data || body;
    const status = caseData.StatusID ?? caseData.Status ?? null;

    return { ok: true, status, data: caseData };
  } catch (err) {
    const errMsg = err.response?.data?.Message || err.message;
    console.error("[LOGICS:getCaseInfo] Error:", errMsg);
    return { ok: false, error: errMsg };
  }
}

// ─────────────────────────────────────────────────────────────
// In your module.exports, add:
//   fetchCaseInfo
//
// e.g.:
// module.exports = { createLeadAdCase, fetchCaseInfo };
// ─────────────────────────────────────────────────────────────
/* -------------------------------------------------------------------------- */
/*  UPDATE YOUR module.exports TO INCLUDE THESE                               */
/* -------------------------------------------------------------------------- */

// Add to your existing module.exports:
//
// module.exports = {
//   ...existing exports...,

// };
module.exports = {
  uploadCaseDocument,
  fetchCaseInfo,
  createActivityLoop,
  updateCaseStatus,
  postCaseFile,
  createZeroInvoice,
  fetchCaseAccountContact,
  fetchBillingSummary,
  fetchActivities,
  fetchInvoices,
  fetchPayments,
  fetchTasks,
  formatPhoneForLogics,
  buildLeadAdPayload,
  createLeadAdCase,
  SOURCE_NAME_MAP,
  DEFAULT_SOURCE_NAME,
};
