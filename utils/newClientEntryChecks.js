// utils/verifyClientStatus.js

const {
  fetchInvoices,
  fetchBillingSummary,
  fetchActivities,
} = require("../services/logicsService");
const Client = require("../models/Client");

/**
 * stampReview
 * – always pushes `msg` into client.reviewMessages
 * – pushes today into client.reviewDates (once per day)
 */
function stampReview(client, msg) {
  client.reviewMessages = client.reviewMessages || [];
  client.reviewDates = client.reviewDates || [];

  client.reviewMessages.push(msg);

  const today = new Date().toISOString().slice(0, 10);
  if (!client.reviewDates.includes(today)) {
    client.reviewDates.push(today);
  }
  // also mark status / reviewDate
  client.status = "inReview";
  client.reviewDate = new Date();

  return client;
}

/**
 * From a list of invoices, pick the latest of CreatedDate / ModifiedDate.
 */
function getLastInvoiceDate(invoices = []) {
  const times = invoices.flatMap((inv) => {
    const c = Date.parse(inv.CreatedDate);
    const m = inv.ModifiedDate ? Date.parse(inv.ModifiedDate) : c;
    return [c, m];
  });
  if (!times.length) return null;
  return new Date(Math.max(...times));
}

/**
 * 1️⃣ processInvoices
 *    – seeds invoiceCount / lastInvoiceAmount / initialPayment on first run
 *    – flags mismatch
 *    – records client.lastInvoiceDate
 */
async function processInvoices(client) {
  let invoices;
  try {
    invoices = await fetchInvoices(client.domain, client.caseNumber);
  } catch (err) {
    return stampReview(
      client,
      `[Invoice] fetch error for ${client.caseNumber}, flagging review: ${err.message}`
    );
  }

  if (!Array.isArray(invoices) || invoices.length === 0) {
    return stampReview(
      client,
      `[Invoice] no invoices returned for ${client.caseNumber}, flagging review`
    );
  }

  // find our cutoff
  const lastDate = getLastInvoiceDate(invoices);
  client.lastInvoiceDate = lastDate;

  // snapshot values
  const currentCount = invoices.length;
  const lastInv = invoices[currentCount - 1];
  const lastAmount = lastInv.UnitPrice ?? lastInv.Amount ?? 0;
  const initialAmount = invoices[0].UnitPrice ?? 0;

  // seed on first run
  if (client.invoiceCount == null) client.invoiceCount = currentCount;
  if (client.lastInvoiceAmount == null) client.lastInvoiceAmount = lastAmount;
  if (client.initialPayment == null) client.initialPayment = initialAmount;

  // mismatch?
  if (
    client.invoiceCount !== currentCount ||
    client.lastInvoiceAmount !== lastAmount
  ) {
    stampReview(
      client,
      `[Invoice] ${client.caseNumber} mismatch: ` +
        `count ${client.invoiceCount}->${currentCount}, ` +
        `amount ${client.lastInvoiceAmount}->${lastAmount}`
    );
  }

  // persist truths
  client.invoiceCount = currentCount;
  client.lastInvoiceAmount = lastAmount;

  return client;
}

/**
 * 2️⃣ flagAndUpdateDelinquent
 *    – if PastDue > 0 since lastInvoiceDate
 */
async function flagAndUpdateDelinquent(client) {
  const cutoff = client.lastInvoiceDate;
  if (!cutoff) return client;

  let summary;
  try {
    summary = await fetchBillingSummary(client.domain, client.caseNumber);
  } catch (err) {
    return stampReview(
      client,
      `[Billing] fetch error for ${client.caseNumber}, flagging review`
    );
  }

  const pastDue = summary.PastDue ?? 0;
  if (pastDue > 0) {
    stampReview(
      client,
      `[Billing] ${client.caseNumber} PastDue=${pastDue} → flagging review`
    );
  }

  return client;
}

/**
 * 3️⃣ reviewClientContact
 *    – flags “status changed” notes after lastInvoiceDate
 */
async function reviewClientContact(client) {
  const cutoff = client.lastInvoiceDate;
  if (!cutoff) return client;

  let activities;
  try {
    activities = await fetchActivities(client.domain, client.caseNumber);
  } catch (err) {
    return stampReview(
      client,
      `[Activity] fetch error for ${client.caseNumber}, flagging review`
    );
  }

  if (!Array.isArray(activities) || activities.length === 0) {
    return stampReview(
      client,
      `[Activity] no activities for ${client.caseNumber}, flagging review`
    );
  }

  // find conversion‐to‐prospect timestamps
  const convTimes = activities
    .filter((a) => /converted from prospect/i.test(`${a.Subject} ${a.Comment}`))
    .map((a) => Date.parse(a.CreatedDate));

  const windowMs = 1000;

  // scan for “status changed”
  for (const a of activities) {
    const ts = Date.parse(a.CreatedDate);
    if (ts <= cutoff.getTime()) continue;

    const txt = `${a.Subject} ${a.Comment}`.toLowerCase();
    if (!txt.includes("status changed")) continue;

    // skip if within conversion window
    if (convTimes.some((c) => Math.abs(c - ts) <= windowMs)) {
      continue;
    }

    return stampReview(
      client,
      `[Activity] ${client.caseNumber} status changed → flagging review`
    );
  }

  return client;
}

/**
 * Single‐client pipeline. Returns either:
 *   { newClient,     clientToReview: null }
 * or
 *   { newClient: null, clientToReview }
 */
async function addAndVerifySingleClient(raw) {
  // Shallow clone so we don’t mutate the original
  let client = { ...raw };

  // 1️⃣ Invoices (also sets lastInvoiceDate & flags mismatch)
  client = await processInvoices(client);

  // 2️⃣ Delinquent check
  client = await flagAndUpdateDelinquent(client);

  // 3️⃣ Activity review
  client = await reviewClientContact(client);

  // Return the client regardless of status
  return client;
}

module.exports = {
  stampReview,
  processInvoices,
  flagAndUpdateDelinquent,
  reviewClientContact,
  addAndVerifySingleClient,
};
