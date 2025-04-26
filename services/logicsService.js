const axios = require("axios");
const FormData = require("form-data");
const config = {
  TAG: {
    baseUrl: process.env.TAG_LOGICS_API_URL, // e.g. "https://taxag.irslogics.com/publicapi/2020-02-22"
    apiKey: process.env.LOGICS_API_KEY,
  },
  WYNN: {
    baseUrl: process.env.WYNN_LOGICS_API_URL, // e.g. "https://wynntax.logiqs.com/publicapi/2020-02-22"
    apiKey: process.env.WYNN_LOGICS_KEY,
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

async function uploadCaseDocument({
  caseID,
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
    `&CaseID=${caseID}` +
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
async function fetchActivities(domain, caseID) {
  const { baseUrl, apiKey } = config[domain] || config.TAG;
  const resp = await axios.get(`${baseUrl}/cases/activity`, {
    params: { apikey: apiKey, CaseID: parseInt(caseID) },
  });
  return resp.data;
}

/** Fetch raw invoice array for a case */
async function fetchInvoices(domain, caseID) {
  const { baseUrl, apiKey } = config[domain] || config.TAG;
  const resp = await axios.get(`${baseUrl}/billing/caseinvoice`, {
    params: { apikey: apiKey, CaseID: parseInt(caseID) },
  });
  return JSON.parse(resp.data.data || "[]");
}

/** Fetch raw payment array for a case */
async function fetchPayments(domain, caseID) {
  const { baseUrl, apiKey } = config[domain] || config.TAG;
  const resp = await axios.get(`${baseUrl}/billing/casepayment`, {
    params: { apikey: apiKey, CaseID: parseInt(caseID) },
  });
  return JSON.parse(resp.data.data || "[]");
}

async function fetchPastDueAmount(domain, caseID) {
  const configMap = {
    TAG: {
      baseUrl: process.env.TAG_LOGICS_API_URL,
      apiKey: process.env.TAG_LOGICS_API_KEY,
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

    const data = JSON.parse(response.data.data || "{}");
    return parseFloat(data.PastDue || "0");
  } catch (error) {
    console.error(
      `❌ Error fetching PastDue for case #${caseNumber}:`,
      error.message
    );
    return 0;
  }
}

async function createZeroInvoice(domain, caseID) {
  const { baseUrl, apiKey } = config[domain] || config.TAG;
  const payload = {
    caseID: parseInt(caseID),
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

module.exports = {
  uploadCaseDocument,
  postCaseFile,
  createZeroInvoice,
  fetchPastDueAmount,
  fetchActivities,
  fetchInvoices,
  fetchPayments,
};
