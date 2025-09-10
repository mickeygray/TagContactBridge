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
      error.message
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
      }
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
