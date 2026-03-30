const axios = require("axios");
const FormData = require("form-data");

const config = {
  TAG: {
    baseUrl: process.env.TAG_LOGICS_API_URL,
    apiKey: process.env.LOGICS_API_KEY,
    secret: process.env.TAG_LOGICS_SECRET,
  },
  WYNN: {
    baseUrl: process.env.WYNN_LOGICS_API_URL,
    apiKey: process.env.WYNN_LOGICS_API_KEY,
    secret: process.env.WYNN_LOGICS_SECRET,
  },
  AMITY: {
    baseUrl: process.env.AMITY_LOGICS_API_URL,
    apiKey: process.env.AMITY_LOGICS_API_KEY,
    secret: process.env.AMITY_LOGICS_SECRET,
  },
};

async function postCaseFile(domain, payload) {
  const { baseUrl, apiKey, secret } = config[domain] || config.TAG;
  const resp = await axios.post(`${baseUrl}/Case/CaseFile`, payload, {
    headers: { "Content-Type": "application/json" },
    auth: { username: apiKey, password: secret },
  });
  return resp.data;
}

async function updateCaseStatus(domain, statusId, searchPhone) {
  const { baseUrl, apiKey, secret } = config[domain] || config.TAG;
  const resp = await axios.post(
    `${baseUrl}/UpdateCase/UpdateCase`,
    { SearchPhone: searchPhone, StatusID: parseInt(statusId) },
    {
      headers: { "Content-Type": "application/json" },
      auth: { username: apiKey, password: secret },
    },
  );
  return resp.data;
}

async function uploadCaseDocument({
  domain,
  caseNumber,
  comment,
  fileCategoryID,
  fileBuffer,
  filename,
  contentType,
}) {
  const formData = new FormData();
  formData.append("file", fileBuffer, { filename, contentType });
  const { baseUrl, apiKey, secret } = config[domain] || config.TAG;
  const url = `${baseUrl}/Documents/CaseDocument?CaseID=${caseNumber}&Comment=${encodeURIComponent(comment)}&FileCategoryID=${fileCategoryID}`;
  const resp = await axios.post(url, formData, {
    headers: { ...formData.getHeaders() },
    auth: { username: apiKey, password: secret },
  });
  return resp.data;
}

async function fetchActivities(domain, caseNumber) {
  const { baseUrl, apiKey, secret } = config[domain] || config.TAG;
  const resp = await axios.get(`${baseUrl}/CaseActivity/Activity`, {
    auth: { username: apiKey, password: secret },
    params: { CaseID: parseInt(caseNumber, 10) },
  });
  return resp.data.Data;
}

async function fetchInvoices(domain, caseID) {
  const { baseUrl, apiKey, secret } = config[domain] || config.TAG;
  const resp = await axios.get(`${baseUrl}/Billing/CaseInvoice`, {
    auth: { username: apiKey, password: secret },
    params: { CaseID: parseInt(caseID) },
  });
  return resp.data.Data;
}

async function fetchTasks(domain, caseID) {
  const { baseUrl, apiKey, secret } = config[domain] || config.TAG;
  const resp = await axios.get(`${baseUrl}/task/task`, {
    auth: { username: apiKey, password: secret },
    params: { CaseID: parseInt(caseID) },
  });
  return JSON.parse(resp.data.data || "[]");
}

async function fetchPayments(domain, caseNumber) {
  const { baseUrl, apiKey, secret } = config[domain] || config.TAG;
  const resp = await axios.get(`${baseUrl}/billing/casepayment`, {
    auth: { username: apiKey, password: secret },
    params: { CaseID: parseInt(caseNumber) },
  });
  return JSON.parse(resp.data.data || "[]");
}

async function fetchBillingSummary(domain, caseNumber) {
  const { baseUrl, apiKey, secret } = config[domain] || config.TAG;
  try {
    const response = await axios.get(`${baseUrl}/Billing/CaseBillingSummary`, {
      auth: { username: apiKey, password: secret },
      params: { CaseID: parseInt(caseNumber) },
    });
    return response.data.Data;
  } catch {
    return null;
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
  const resp = await axios.post(`${baseUrl}/Billing/caseinvoice`, payload, {
    headers: { "Content-Type": "application/json" },
    auth: { username: apiKey, password: secret },
  });
  return resp.data;
}

async function createActivityLoop(domain, caseId, comment) {
  const activities = await fetchActivities(domain, caseId);
  const existing = activities.find((act) => act.Subject === "PB CALL LOG");
  const { baseUrl, apiKey, secret } = config[domain];
  if (!existing || !existing.ActivityID) {
    await axios.post(
      `${baseUrl}/CaseActivity/Activity`,
      {
        CaseID: parseInt(caseId, 10),
        ActivityType: "General",
        Subject: "PB CALL LOG",
        Comment: comment,
        Popup: false,
        Pin: true,
      },
      {
        headers: { "Content-Type": "application/json" },
        auth: { username: apiKey, password: secret },
      },
    );
  }
  return comment;
}

async function fetchCaseAccountContact(domain, caseId) {
  const { baseUrl, apiKey, secret } = config[domain];
  const url = `${baseUrl}/Billing/CaseAccount`;
  let resp;
  try {
    resp = await axios.get(url, {
      headers: { CaseID: String(caseId), "Content-Type": "application/json" },
      auth: { username: apiKey, password: secret },
      timeout: 20000,
    });
  } catch {
    resp = await axios.get(`${url}?CaseID=${encodeURIComponent(caseId)}`, {
      headers: { "Content-Type": "application/json" },
      auth: { username: apiKey, password: secret },
      timeout: 20000,
    });
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
  let records = payload.data;
  if (typeof records === "string") {
    try {
      records = JSON.parse(records);
    } catch {
      records = [];
    }
  }
  if (!Array.isArray(records)) records = [];
  const acct = records.find((r) => r.PrimaryAccount) || records[0] || {};
  return {
    caseId,
    phone: (acct.PhoneNo || "").trim(),
    email: (acct.EmailID || "").trim(),
  };
}

/* -------------------------------------------------------------------------- */
/*                          SOURCE NAME MAPPING                               */
/* -------------------------------------------------------------------------- */

// Ad platform sources — same across all companies
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
  "vf landing page": "VF Landing Page",
  "ld posting": "LD Posting",
  affiliate: "Affiliate",
  messenger: "Facebook Messenger",
  "fb-messenger": "Facebook Messenger",
  gs03rb7w: "LD Posting",
  "ld posting": "LD Posting",
  "ld-posting": "LD Posting",
};

const DEFAULT_SOURCE_NAME = "Digital Lead 2026";

// Web form sources — these get the company-specific source name
const WEB_FORM_SOURCES = [
  "contact-form",
  "lead-form",
  "landing-qualify",
  "state-tax-guide",
  "caitlyn-verified",
  "tax-stewart",
  "tax-stewart-verified",
  "messenger",
  "lead-form-affiliate",
];

const AFFILIATE_SOURCE_MAP = {
  oev4ll6o: "Affiliate - OEV4LL6O",
};

const AFFILIATE_NID_SOURCE_MAP = {
  3702: "Affiliate - OEV4LL6O",
};
function formatPhoneForLogics(phone) {
  if (!phone) return undefined;
  let d = String(phone).replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10) return undefined;
  return `(${d.slice(0, 3)})${d.slice(3, 6)}-${d.slice(6)}`;
}
function resolveLogicsSourceName(source, meta = {}, company = "WYNN") {
  const sourceKey = (source || "").toLowerCase().trim();
  const trafficSource = (meta.trafficSource || "").toLowerCase().trim();
  const affiliatePartner = (meta.affiliatePartner || "").toLowerCase().trim();
  const affiliateNid = String(meta.affiliateNid || "").trim();

  if (trafficSource === "affiliate" || sourceKey.includes("affiliate")) {
    if (affiliatePartner && AFFILIATE_SOURCE_MAP[affiliatePartner]) {
      return AFFILIATE_SOURCE_MAP[affiliatePartner];
    }

    if (affiliateNid && AFFILIATE_NID_SOURCE_MAP[affiliateNid]) {
      return AFFILIATE_NID_SOURCE_MAP[affiliateNid];
    }

    return "Affiliate";
  }

  if (WEB_FORM_SOURCES.includes(sourceKey)) {
    try {
      const { getCompanyConfig } = require("../config/companyConfig");
      const companyConfig = getCompanyConfig(company);
      return companyConfig.webFormSourceName || `${company} Web Form`;
    } catch {
      return `${company} Web Form`;
    }
  }

  return SOURCE_NAME_MAP[sourceKey] || DEFAULT_SOURCE_NAME;
}
function buildLeadAdPayload(fields, source, meta = {}, company = "WYNN") {
  const { name, email, phone, state, city } = fields;
  const nameParts = (name || "").trim().split(/\s+/);
  let firstName = nameParts[0] || "";
  let lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
  if (!firstName || firstName.startsWith("<")) {
    firstName = "Unknown";
    lastName = "Lead";
  }
  const formattedPhone = formatPhoneForLogics(phone);
  const notes = [];
  if (city) notes.push(`City: ${city}`);
  if (meta.formId)
    notes.push(`${source === "facebook" ? "FB" : "TT"} Form: ${meta.formId}`);
  if (meta.adgroupId) notes.push(`Ad Group: ${meta.adgroupId}`);
  if (meta.campaignId) notes.push(`Campaign: ${meta.campaignId}`);
  if (meta.affiliatePartner)
    notes.push(`Affiliate Partner: ${meta.affiliatePartner}`);
  if (meta.affiliateNid) notes.push(`Affiliate NID: ${meta.affiliateNid}`);
  if (meta.affiliateClickId)
    notes.push(`Affiliate Click ID: ${meta.affiliateClickId}`);
  // ── Resolve source name ────────────────────────────────────────────────
  const sourceName = resolveLogicsSourceName(source, meta, company);

  const payload = {
    FirstName: firstName,
    LastName: lastName,
    StatusID: 2,
    SourceName: sourceName,
  };
  if (email) payload.Email = email;
  if (formattedPhone) {
    payload.CellPhone = formattedPhone;
    payload.SMSPermit = "true";
    payload.DuplicateCheck = "CellPhone"; // ← add this
  }
  if (state) payload.State = state.toUpperCase().slice(0, 2);
  if (notes.length) payload.Notes = notes.join(" | ");
  return payload;
}

async function createLeadAdCase(domain, fields, source, meta = {}) {
  try {
    const payload = buildLeadAdPayload(fields, source, meta, domain);
    const result = await postCaseFile(domain, payload);

    // Logics returns Success: false with a duplicate message when DuplicateCheck hits
    if (result?.Success === false) {
      const msg = (result?.Message || result?.message || "").toLowerCase();
      if (msg.includes("duplicate") || msg.includes("already exist")) {
        console.log(
          `[LOGICS] ⚠ Duplicate phone detected by Logics: ${fields.phone}`,
        );
        return {
          ok: false,
          caseId: null,
          duplicate: true,
          error: "Duplicate phone in Logics",
        };
      }
    }

    const caseIdRaw =
      result?.Data?.CaseID ??
      result?.data?.Data?.CaseID ??
      result?.data?.CaseID ??
      null;
    const caseIdNum = caseIdRaw != null ? Number(caseIdRaw) : null;
    const caseId = Number.isFinite(caseIdNum) ? caseIdNum : null;
    if (!caseId)
      return {
        ok: false,
        caseId: null,
        error: "No CaseID returned from Logics",
      };
    return { ok: true, caseId };
  } catch (err) {
    return { ok: false, caseId: null, error: err.message };
  }
}

async function fetchCaseInfo(domain, caseId) {
  const { baseUrl, apiKey, secret } = config[domain] || config.WYNN;
  try {
    const resp = await axios.get(`${baseUrl}/Case/CaseInfo`, {
      auth: { username: apiKey, password: secret },
      params: { CaseID: parseInt(caseId, 10) },
    });
    const body = resp.data;
    if (!body?.Success && !body?.Data)
      return { ok: false, error: body?.Message || "No data returned" };
    const caseData = body.Data || body;
    const status = caseData.StatusID ?? caseData.Status ?? null;
    return { ok: true, status, data: caseData };
  } catch (err) {
    return { ok: false, error: err.response?.data?.Message || err.message };
  }
}

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
  resolveLogicsSourceName,
  AFFILIATE_SOURCE_MAP,
  AFFILIATE_NID_SOURCE_MAP,
  SOURCE_NAME_MAP,
  DEFAULT_SOURCE_NAME,
  WEB_FORM_SOURCES,
};
