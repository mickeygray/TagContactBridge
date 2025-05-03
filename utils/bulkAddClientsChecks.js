// utils/verifyClientStatus.js

// Pull in the core Logics service helpers
const {
  fetchInvoices,
  fetchBillingSummary,
  fetchActivities,
} = require("../services/logicsService");

// Mongoose Client model for DB writes
const Client = require("../models/Client");

function stampReview(client, msg) {
  client.reviewMessages = Array.isArray(client.reviewMessages)
    ? client.reviewMessages
    : [];
  client.reviewDates = Array.isArray(client.reviewDates)
    ? client.reviewDates
    : [];

  client.reviewMessages.push(msg);

  const today = new Date().toISOString().slice(0, 10);
  if (!client.reviewDates.includes(today)) {
    client.reviewDates.push(today);
  }

  client.status = "inReview";
  client.reviewDate = new Date();
  return client;
}

/**
 * 1️⃣ Check invoice count & last-amount mismatch.
 *    Mark inReview if mismatch, record initialPayment if missing.
 */
async function processInvoices(client) {
  let invoices;

  try {
    invoices = await fetchInvoices(client.domain, client.caseNumber);
  } catch (err) {
    stampReview(client, `[Invoice] fetch error: ${err.message}`);
    return {
      client,
      sinceDate: null,
    };
  }

  if (!Array.isArray(invoices) || invoices.length === 0) {
    stampReview(client, `[Invoice] no invoices returned`);
    return {
      client,
      sinceDate: null,
    };
  }

  // derive the lastInvoiceDate from CreatedDate/ModifiedDate
  const lastInvoiceDate = invoices.reduce((maxTs, inv) => {
    const createdTs = new Date(inv.CreatedDate).getTime();
    const modifiedTs = inv.ModifiedDate
      ? new Date(inv.ModifiedDate).getTime()
      : createdTs;
    return Math.max(maxTs, createdTs, modifiedTs);
  }, 0);
  client.sinceDate = new Date(lastInvoiceDate);

  // snapshot truth
  const currentCount = invoices.length;
  const lastInv = invoices[invoices.length - 1];
  const lastAmount = lastInv.UnitPrice ?? lastInv.Amount ?? 0;

  // on first ever run, seed counts
  if (client.invoiceCount == null) {
    client.invoiceCount = currentCount;
    client.lastInvoiceAmount = lastAmount;
  }

  // set initialPayment once
  if (client.initialPayment == null && invoices[0]) {
    client.initialPayment = invoices[0].UnitPrice ?? invoices[0].Amount ?? 0;
  }

  // mismatch?
  if (
    client.invoiceCount !== currentCount ||
    client.lastInvoiceAmount !== lastAmount
  ) {
    stampReview(
      client,
      `[Invoice] mismatch: count ${client.invoiceCount}->${currentCount}, amount ${client.lastInvoiceAmount}->${lastAmount}`
    );
  }

  if (lastAmount === 0) {
    stampReview(client, `[Invoice] Zero Invoice: Clients last invoice is 0.`);
  }
  // overwrite with truth for next time
  client.invoiceCount = currentCount;
  client.lastInvoiceAmount = lastAmount;

  return client;
}

/**
 * 2️⃣ Check past-due balance.
 *    Flag inReview if any past-due amount > 0.
 */
async function flagAndUpdateDelinquent(client) {
  const cutoff = client.sinceDate;
  if (!cutoff) return client;

  try {
    const summary = await fetchBillingSummary(client.domain, client.caseNumber);
    const pastDue = summary.PastDue ?? 0;

    if (pastDue > 0) {
      stampReview(
        client,
        `[Delinquent] ${client.caseNumber} PastDue=${pastDue} → flagging review`
      );
      return client;
    }
  } catch (err) {
    stampReview(
      client,
      `[Delinquent] ${client.caseNumber} fetch error: ${err.message}`
    );
    return client;
  }

  return client;
}
/**
 * 3️⃣ Review status-change activities (excluding benign conversions).
 */
async function reviewClientContact(client) {
  const cutoff = client.sinceDate;
  if (!cutoff) return client;

  // 2️⃣ Fetch activities
  let activities;
  try {
    activities = await fetchActivities(client.domain, client.caseNumber);
  } catch (err) {
    stampReview(
      client,
      `[Activity] ${client.caseNumber} fetch error: ${err.message}`
    );
    return client;
  }

  // 3️⃣ No activities → flag
  if (!Array.isArray(activities) || activities.length === 0) {
    stampReview(
      client,
      `[Activity] ${client.caseNumber} no activities returned`
    );
    return client;
  }

  // 4️⃣ Identify conversion timestamps to ignore nearby “status changed”
  const convTimes = activities
    .filter((act) =>
      /converted from prospect/i.test(`${act.Subject} ${act.Comment}`)
    )
    .map((act) => new Date(act.CreatedDate).getTime());

  // 5️⃣ Scan for any genuine “status changed” after cutoff
  const thresholdMs = 1000;
  for (const act of activities) {
    const createdMs = new Date(act.CreatedDate).getTime();
    if (createdMs <= cutoff.getTime()) continue;

    const text = `${act.Subject || ""} ${act.Comment || ""}`.toLowerCase();
    if (!text.includes("status changed")) continue;

    // skip if within conversion window
    if (convTimes.some((ts) => Math.abs(ts - createdMs) <= thresholdMs)) {
      continue;
    }

    const readableDate = new Date(createdMs).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    stampReview(
      client,
      `[Activity] ${client.caseNumber} status change message: ${act.Subject} recorded on ${readableDate}`
    );
    // genuine status change → stamp review
    return client;
  }

  // passed all checks → leave unchanged
  return client;
}

/**
 * Bulk-verify and insert new clients.
 * Returns { added, reviewList }.
 */
async function addVerifiedClientsAndReturnReviewList(rawClients) {
  const toSave = [];
  const reviewList = [];

  for (const data of rawClients) {
    let client = { ...data };
    client = await processInvoices(client);
    client = await flagAndUpdateDelinquent(client);
    client = await reviewClientContact(client);

    if (client.status === "inReview") {
      reviewList.push(client);
    } else {
      toSave.push(client);
    }
  }

  const added = toSave.length ? await Client.insertMany(toSave) : [];
  console.log(
    `[Import] added=${added.length}, reviewList=${reviewList.length}`
  );

  return { added, reviewList };
}

module.exports = {
  processInvoices,
  flagAndUpdateDelinquent,
  reviewClientContact,
  addVerifiedClientsAndReturnReviewList,
};
