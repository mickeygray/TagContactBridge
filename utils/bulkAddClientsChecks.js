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
  const REVIEW_WINDOW_DAYS = 30;
  const reviewWindowStart = new Date(
    Date.now() - REVIEW_WINDOW_DAYS * 86400000
  );

  const rawSince = client.sinceDate ? new Date(client.sinceDate) : null;
  const cutoff =
    rawSince && rawSince > reviewWindowStart ? rawSince : reviewWindowStart;
  if (!cutoff) {
    console.log(`[reviewClientContact] ${client.caseNumber} has no sinceDate`);
    return client;
  }

  console.log(
    `[reviewClientContact] Fetching activities for ${client.caseNumber}`
  );
  let activities;
  try {
    activities = await fetchActivities(client.domain, client.caseNumber);
  } catch (err) {
    stampReview(
      client,
      `[Activity] ${client.caseNumber} fetch error: ${err.message}`
    );
    console.log(
      `[reviewClientContact] Error fetching activities: ${err.message}`
    );
    return client;
  }

  if (!Array.isArray(activities) || activities.length === 0) {
    stampReview(
      client,
      `[Activity] ${client.caseNumber} no activities returned`
    );
    console.log(`[reviewClientContact] No activities for ${client.caseNumber}`);
    return client;
  }

  const convTimes = activities
    .filter((act) =>
      /converted from prospect/i.test(`${act.Subject} ${act.Comment}`)
    )
    .map((act) => new Date(act.CreatedDate).getTime());

  const thresholdMs = 1000;
  for (const act of activities) {
    const createdMs = new Date(act.CreatedDate).getTime();
    if (createdMs <= cutoff.getTime()) continue;

    const text = `${act.Subject || ""} ${act.Comment || ""}`.toLowerCase();
    if (!text.includes("status changed")) continue;

    if (convTimes.some((ts) => Math.abs(ts - createdMs) <= thresholdMs))
      continue;

    const readableDate = new Date(createdMs).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    stampReview(
      client,
      `[Activity] ${client.caseNumber} status change message: ${act.Subject} recorded on ${readableDate}`
    );
    console.log(
      `[reviewClientContact] ${client.caseNumber} flagged due to status change`
    );
    return client;
  }

  console.log(`[reviewClientContact] ${client.caseNumber} passed`);
  return client;
}

/**
 * Bulk-verify and insert new clients.
 * Returns { added, reviewList }.
 */
async function addVerifiedClientsAndReturnReviewList(rawClients) {
  const toSave = [];
  const reviewList = [];
  console.log(`[Input] Received ${rawClients.length} clients`);
  for (const data of rawClients) {
    console.log(`\n▶️ Processing client: ${data.caseNumber}`);
    console.time(`⏱️ Total time for ${data.caseNumber}`);

    let client = { ...data };

    console.time(`  processInvoices - ${data.caseNumber}`);
    client = await processInvoices(client);
    console.timeEnd(`  processInvoices - ${data.caseNumber}`);

    console.time(`  flagAndUpdateDelinquent - ${data.caseNumber}`);
    client = await flagAndUpdateDelinquent(client);
    console.timeEnd(`  flagAndUpdateDelinquent - ${data.caseNumber}`);

    console.time(`  reviewClientContact - ${data.caseNumber}`);
    client = await reviewClientContact(client);
    console.timeEnd(`  reviewClientContact - ${data.caseNumber}`);

    if (client.status === "inReview") {
      reviewList.push(client);
      console.log(`❗ ${client.caseNumber} added to reviewList`);
    } else {
      toSave.push(client);
      console.log(`✅ ${client.caseNumber} added to toSave`);
    }

    console.timeEnd(`⏱️ Total time for ${data.caseNumber}`);
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
