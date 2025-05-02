// utils/verifyClientStatus.js

const {
  fetchInvoices,
  fetchBillingSummary,
  fetchActivities,
} = require("../services/logicsService");
const Client = require("../models/Client");

/**
 * stampReview(client, msg)
 *  – always appends `msg` to client.reviewMessages[]
 *  – appends today (YYYY‑MM‑DD) to client.reviewDates[] if not already
 */
function stampReview(client, msg) {
  if (!Array.isArray(client.reviewMessages)) {
    client.reviewMessages = [];
  }
  if (!Array.isArray(client.reviewDates)) {
    client.reviewDates = [];
  }

  client.reviewMessages.push(msg);

  const today = new Date().toISOString().slice(0, 10);
  if (!client.reviewDates.includes(today)) {
    client.reviewDates.push(today);
  }

  return client;
}

/**
 * Extract the latest invoice timestamp (CreatedDate or ModifiedDate).
 */
function getLastInvoiceDate(invoices = []) {
  const times = invoices.flatMap((inv) => {
    const c = new Date(inv.CreatedDate).getTime();
    const m = inv.ModifiedDate ? new Date(inv.ModifiedDate).getTime() : c;
    return [c, m];
  });
  if (!times.length) return null;
  return new Date(Math.max(...times));
}

/**
 * 1️⃣ processInvoices
 *    • fetch & seed invoiceCount, lastInvoiceAmount, initialPayment
 *    • derive sinceDate = lastInvoiceDate
 *    • stampReview on any mismatch
 */
async function processInvoices(client) {
  let invoices;
  try {
    invoices = await fetchInvoices(client.domain, client.caseNumber);
  } catch (err) {
    stampReview(
      client,
      `[Invoice] fetch error (${err.message}), flagging review`
    );
    client.status = "inReview";
    client.sinceDate = null;
    return client;
  }

  if (!Array.isArray(invoices) || invoices.length === 0) {
    stampReview(client, `[Invoice] no invoices returned, flagging review`);
    client.status = "inReview";
    client.sinceDate = null;
    return client;
  }

  // derive cutoff
  const lastInvoiceDate = getLastInvoiceDate(invoices);
  client.sinceDate = lastInvoiceDate;
  client.lastInvoiceDate = lastInvoiceDate;

  const count = invoices.length;
  const lastInv = invoices[count - 1];
  const amount = lastInv.UnitPrice ?? lastInv.Amount ?? 0;

  // seed on first run
  if (client.invoiceCount == null) {
    client.invoiceCount = count;
  }
  if (client.lastInvoiceAmount == null) {
    client.lastInvoiceAmount = amount;
  }
  if (client.initialPayment == null) {
    const first = invoices[0];
    client.initialPayment = first.UnitPrice ?? first.Amount ?? 0;
  }

  // detect mismatch
  if (client.invoiceCount !== count || client.lastInvoiceAmount !== amount) {
    stampReview(
      client,
      `[Invoice] mismatch count ${client.invoiceCount}->${count}, amount ${client.lastInvoiceAmount}->${amount}`
    );
    client.status = "inReview";
  }

  // persist “truth”
  client.invoiceCount = count;
  client.lastInvoiceAmount = amount;

  return client;
}

/**
 * 2️⃣ flagAndUpdateDelinquent
 *    • checks billing summary pastDue since client.sinceDate
 */
async function flagAndUpdateDelinquent(client, maxTotalPayments = null) {
  // use the invoice‐derived cutoff
  const cutoff = client.sinceDate;
  if (!cutoff) return client;

  let summary;
  try {
    summary = await fetchBillingSummary(client.domain, client.caseNumber);
  } catch (err) {
    stampReview(
      client,
      `[Billing] fetch error (${err.message}), flagging review`
    );
    client.status = "inReview";
    return client;
  }

  const pastDue = summary.PastDue ?? 0;
  const paidAmount = summary.PaidAmount ?? 0;

  // ❗ Past‐due check
  if (pastDue > 0) {
    stampReview(client, `[Billing] PastDue=${pastDue} → flagging review`);
    client.status = "inReview";
  }

  // ▶️ Now handle total‑payment vs threshold
  const prevPaid = client.totalPayment;

  // First time: seed it
  if (prevPaid == null) {
    client.totalPayment = paidAmount;
  }
  // On subsequent runs:
  else if (paidAmount > 50000) {
    // record the mismatch
    stampReview(
      client,
      `[Billing] totalPayment mismatch ${prevPaid}->${paidAmount}`
    );

    // if it dropped — refund suspicion
    if (paidAmount < prevPaid) {
      stampReview(
        client,
        `[Billing] paid amount decreased (${prevPaid}->${paidAmount}), possible refund`
      );
      client.status = "inReview";
    }
    // if above your max threshold
    if (maxTotalPayments != null && paidAmount > maxTotalPayments) {
      stampReview(
        client,
        `[Billing] paid amount ${paidAmount} exceeds maxTotalPayments=${maxTotalPayments}`
      );
      client.status = "inReview";
    }

    // always overwrite to newest
    client.totalPayment = paidAmount;
  }

  return client;
}

/**
 * 3️⃣ reviewClientContact
 *    • flags any “status changed” (outside 1s of conversion)
 *      occurring after client.sinceDate
 */
async function reviewClientContact(client) {
  const cutoff = client.sinceDate;
  if (!cutoff) return client;

  let activities;
  try {
    activities = await fetchActivities(client.domain, client.caseNumber);
  } catch (err) {
    stampReview(client, `[Activity] fetch error, flagging review`);
    client.status = "inReview";
    return client;
  }

  if (!Array.isArray(activities) || activities.length === 0) {
    stampReview(client, `[Activity] no activities, flagging review`);
    client.status = "inReview";
    return client;
  }

  // find any “converted from prospect” times
  const convTs = activities
    .filter((a) => /converted from prospect/i.test(`${a.Subject} ${a.Comment}`))
    .map((a) => new Date(a.CreatedDate).getTime());

  const threshold = 1000;
  for (const a of activities) {
    const ts = new Date(a.CreatedDate).getTime();
    if (ts <= cutoff.getTime()) continue;
    const txt = `${a.Subject} ${a.Comment}`.toLowerCase();
    if (!txt.includes("status changed")) continue;
    // skip if near a conversion event
    if (convTs.some((c) => Math.abs(c - ts) <= threshold)) {
      continue;
    }
    stampReview(
      client,
      `[Activity] genuine status change at ${new Date(ts).toISOString()}`
    );
    client.status = "inReview";
    break;
  }

  return client;
}

/**
 * Bulk‐verify a list of fresh clients.
 * Returns { added, reviewList }.
 */
async function addVerifiedClientsAndReturnReviewList(rawClients) {
  const toSave = [];
  const reviewList = [];

  for (const data of rawClients) {
    let client = { ...data };

    // 1️⃣ invoices → sets client.sinceDate
    client = await processInvoices(client);

    // 2️⃣ delinquent
    client = await flagAndUpdateDelinquent(client);

    // 3️⃣ activity
    client = await reviewClientContact(client);

    if (client.status === "inReview") {
      reviewList.push(client);
    } else {
      toSave.push(client);
    }
  }

  const added = toSave.length ? await Client.insertMany(toSave) : [];

  return { added, reviewList };
}

module.exports = {
  stampReview,
  processInvoices,
  flagAndUpdateDelinquent,
  reviewClientContact,
  addVerifiedClientsAndReturnReviewList,
};
