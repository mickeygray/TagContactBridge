const axios = require("axios");
const FormData = require("form-data");
const config = {
  TAG: {
    baseUrl: process.env.TAG_LOGICS_API_URL, // e.g. "https://taxag.irslogics.com/publicapi/2020-02-22"
    apiKey: process.env.LOGICS_API_KEY,
  },
  WYNN: {
    baseUrl: process.env.WYNN_LOGICS_API_URL, // e.g. "https://wynntax.logiqs.com/publicapi/2020-02-22"
    apiKey: process.env.WYNN_LOGICS_API_KEY,
  },
  AMITY: {
    baseUrl: process.env.AMITY_LOGICS_API_URL, // if/when you need Amity file imports
    apiKey: process.env.AMITY_LOGICS_API_KEY,
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
  const { baseUrl, apiKey } = config[domain] || config.TAG;
  const url = `${baseUrl}/cases/casefile?apikey=${apiKey}`;

  const resp = await axios.post(url, payload, {
    headers: { "Content-Type": "application/json" },
  });

  return resp.data;
}
async function updateCaseStatus(domain, caseId, statusId) {
  const domainConfig = config[domain] || config.TAG;
  const url = `${domainConfig.baseUrl}/publicapi/V3/UpdateCase/UpdateCase`;
  const payload = {
    CaseID: parseInt(caseId, 10),
    StatusID: statusId,
  };
  const headers = {
    "Content-Type": "application/json",
    apikey: domainConfig.apiKey,
  };

  const resp = await axios.post(url, payload, { headers });
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

  const url =
    `https://taxag.irslogics.com/publicapi/2020-02-22/documents/casedocument` +
    `?apikey=${process.env.LOGICS_API_KEY}` +
    `&CaseID=${caseNumber}` +
    `&Comment=${encodeURIComponent(comment)}` +
    `&FileCategoryID=${fileCategoryID}`;

  const resp = await axios.post(url, formData, {
    headers: {
      ...formData.getHeaders(),
    },
  });
  return resp.data;
}

/** Fetch raw activity array for a case */
async function fetchActivities(domain, caseNumber) {
  const { baseUrl, apiKey } = config[domain] || config.TAG;
  const resp = await axios.get(`${baseUrl}/cases/activity`, {
    params: { apikey: apiKey, CaseID: parseInt(caseNumber) },
  });
  return resp.data;
}

/** Fetch raw invoice array for a case */
async function fetchInvoices(domain, caseID) {
  const { baseUrl, apiKey } = config[domain] || config.TAG;
  const resp = await axios.get(`${baseUrl}/billing/caseinvoice`, {
    params: { apikey: apiKey, CaseID: parseInt(caseID) },
  });
  console.log(resp.data, "invoiceData");
  return JSON.parse(resp.data.data || "[]");
}

async function fetchTasks(domain, caseID) {
  const { baseUrl, apiKey } = config[domain] || config.TAG;
  const resp = await axios.get(`${baseUrl}/task/task`, {
    params: { apikey: apiKey, CaseID: parseInt(caseID) },
  });
  console.log(resp.data, "taskData");
  return JSON.parse(resp.data.data || "[]");
}

/** Fetch raw payment array for a case */
async function fetchPayments(domain, caseNumber) {
  const { baseUrl, apiKey } = config[domain] || config.TAG;
  const resp = await axios.get(`${baseUrl}/billing/casepayment`, {
    params: { apikey: apiKey, CaseID: parseInt(caseNumber) },
  });
  return JSON.parse(resp.data.data || "[]");
}

async function fetchBillingSummary(domain, caseNumber) {
  const configMap = {
    TAG: {
      baseUrl: process.env.TAG_LOGICS_API_URL,
      apiKey: process.env.LOGICS_API_KEY,
    },
    WYNN: {
      baseUrl: process.env.WYNN_LOGICS_API_URL,
      apiKey: process.env.WYNN_LOGICS_API_KEY,
    },
    AMITY: {
      baseUrl: process.env.AMITY_LOGICS_API_URL,
      apiKey: process.env.AMITY_LOGICS_API_KEY,
    },
  };

  const config = configMap[domain] || configMap.TAG;
  const endpoint = "billing/casebillingsummary";

  try {
    const response = await axios.get(`${config.baseUrl}${endpoint}`, {
      params: {
        apikey: config.apiKey,
        CaseID: parseInt(caseNumber),
      },
    });

    const summary = response.data.data;
    console.log(summary);
    return summary;
  } catch (error) {
    console.error(
      `❌ Error fetching PastDue for case #${caseNumber}:`,
      error.message
    );
  }
}

async function createZeroInvoice(domain, caseNumber) {
  const { baseUrl, apiKey } = config[domain] || config.TAG;
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
  const url = `${baseUrl}/Billing/caseinvoice?apikey=${apiKey}`;
  const resp = await axios.post(url, payload, {
    headers: { "Content-Type": "application/json" },
  });
  return resp.data;
}
async function createActivityLoop(domain, caseId, comment) {
  // 1️⃣ Fetch existing activities for the case
  const activities = await getActivities(domain, caseId);

  // 2️⃣ Look for PB CALL LOG activity
  const existing = activities.find((act) => act.Subject === "PB CALL LOG");
  const url = `${config[domain].baseUrl}/publicapi/V3/CaseActivity/Activity`;
  const headers = {
    "Content-Type": "application/json",
    apikey: config[domain].apiKey,
  };

  if (existing && existing.ActivityID) {
    // 3a️⃣ Update existing activity
    await axios.post(
      url,
      {
        ActivityID: existing.ActivityID,
        CaseID: parseInt(caseId, 10),
        Comment: comment,
      },
      { headers }
    );
  } else {
    // 3b️⃣ Create new activity
    await axios.post(
      url,
      {
        CaseID: parseInt(caseId, 10),
        ActivityType: "Note", // adjust as needed
        Subject: "PB CALL LOG",
        Comment: comment,
        Popup: false,
        Pin: false,
      },
      { headers }
    );
  }

  // 4️⃣ Return the comment for use in summaries
  return comment;
}
module.exports = {
  uploadCaseDocument,
  createActivityLoop,
  updateCaseStatus,
  postCaseFile,
  createZeroInvoice,
  fetchBillingSummary,
  fetchActivities,
  fetchInvoices,
  fetchPayments,
  fetchTasks,
};
