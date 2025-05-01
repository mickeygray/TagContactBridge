// utils/verifyClientStatus.js

// Pull in the core Logics service helpers
const {
  fetchInvoices,
  fetchBillingSummary,
  fetchActivities,
} = require("../services/logicsService");

// Mongoose Client model for DB writes
const Client = require("../models/Client");

/**
 * 1️⃣ Check invoice count & last-amount mismatch.
 *    Mark inReview if mismatch, record initialPayment if missing.
 */
async function checkInvoiceMismatch(client, sinceDate) {
  const cutoff = sinceDate || client.lastContactDate;
  if (!cutoff) return client;

  try {
    let invoices;
    try {
      invoices = await fetchInvoices(client.domain, client.caseNumber);
    } catch (err) {
      console.log(
        `[Invoice] ${client.caseNumber} fetch error, flagged: ${err.message}`
      );
      client.status = "inReview";
      client.reviewDate = new Date();
      return client;
    }

    if (!Array.isArray(invoices) || invoices.length === 0) {
      console.log(
        `[Invoice] ${client.caseNumber} no invoices returned, flagged`
      );
      client.status = "inReview";
      client.reviewDate = new Date();
      return client;
    }

    console.log(
      `[Invoice][RAW] ${client.caseNumber}:`,
      JSON.stringify(invoices, null, 2)
    );

    const currentCount = invoices.length;
    const lastAmount = invoices.at(-1)?.UnitPrice || 0;
    if (sinceDate) {
      client.invoiceCount = currentCount;
      client.lastInvoiceAmount = lastAmount;
      console.log(
        `[Invoice] ${client.caseNumber} initialized counts: invoiceCount=${client.invoiceCount}, lastInvoiceAmount=${client.lastInvoiceAmount}`
      );
    }
    // Set initial payment once
    if (client.initialPayment == null && invoices[0]) {
      client.initialPayment = invoices[0].UnitPrice;
      console.log(
        `[Invoice] ${client.caseNumber} initialPayment=${client.initialPayment}`
      );
    }

    // Flag mismatches
    if (
      client.invoiceCount !== currentCount ||
      client.lastInvoiceAmount !== lastAmount
    ) {
      client.status = "inReview";
      client.reviewDate = new Date();
      console.log(
        `[Invoice] ${client.caseNumber} flagged: count ${client.invoiceCount}->${currentCount}, amount ${client.lastInvoiceAmount}->${lastAmount}`
      );
    }
  } catch (err) {
    console.error(`[Invoice] Error for ${client.caseNumber}:`, err.message);
  }
  return client;
}

/**
 * 2️⃣ Check past-due balance.
 *    Flag inReview if any past-due amount > 0.
 */
async function flagAndUpdateDelinquent(client, sinceDate) {
  const cutoff = sinceDate || client.lastContactDate;
  if (!cutoff) return client;

  let pastDue;
  try {
    const summary = await fetchBillingSummary(client.domain, client.caseNumber);

    pastDue = summary.PastDue;
    if (pastDue > 0) {
      console.log(
        `[Delinquent] ${client.caseNumber} past due amount greater than 0, flagged for review`
      );
      client.status = "inReview";
      client.reviewDate = new Date();
      return client;
    }
  } catch (err) {
    console.log(
      `[Delinquent] ${client.caseNumber} fetch error: ${err.message}, flagged for review`
    );
    client.status = "inReview";
    client.reviewDate = new Date();
    return client;
  }
  return client;
}

/**
 * 3️⃣ Review status-change activities (excluding benign conversions).
 */
async function reviewClientContact(client, sinceDate) {
  // 1️⃣ Determine cutoff: either the rolling window or lastContactDate
  const cutoff = sinceDate || client.lastContactDate;
  if (!cutoff) return client;

  // 2️⃣ Fetch activities
  let activities;
  try {
    activities = await fetchActivities(client.domain, client.caseNumber);
  } catch (err) {
    console.log(
      `[Activity] ${client.caseNumber} fetch error (${err.message}), flagging for review`
    );
    client.status = "inReview";
    client.reviewDate = new Date();
    return client;
  }

  // 3️⃣ No activities → flag
  if (!Array.isArray(activities) || activities.length === 0) {
    console.log(
      `[Activity] ${client.caseNumber} no activities, flagging for review`
    );
    client.status = "inReview";
    client.reviewDate = new Date();
    return client;
  }

  // 4️⃣ Identify only the true conversion events (within 1 second window)
  //    by matching the exact conversion phrase.
  const convTimes = activities
    .filter((act) =>
      /converted from prospect/i.test(`${act.Subject} ${act.Comment}`)
    )
    .map((act) => new Date(act.CreatedDate).getTime());

  // 5️⃣ Now scan for any “status changed” entries outside that 1 s window:
  const thresholdMs = 1000;
  for (const act of activities) {
    const createdMs = new Date(act.CreatedDate).getTime();
    // skip anything before cutoff
    if (createdMs < new Date(cutoff).getTime()) continue;

    const text = `${act.Subject || ""} ${act.Comment || ""}`.toLowerCase();
    // looking only at genuine status‐changed notes
    if (!text.includes("status changed")) continue;

    // if it occurs within 1 s of a conversion event, skip it
    const isNearConversion = convTimes.some(
      (ts) => Math.abs(createdMs - ts) <= thresholdMs
    );
    if (isNearConversion) {
      console.log(
        `[Activity] ${client.caseNumber} status‐changed at ${new Date(
          createdMs
        ).toISOString()} — within conversion window, skipping`
      );
      continue;
    }

    // anything else is significant → flag
    client.status = "inReview";
    client.reviewDate = new Date();
    console.log(
      `[Activity] ${client.caseNumber} flagged at ${new Date(
        createdMs
      ).toISOString()} — genuine status change`
    );
    break;
  }

  return client;
}

/**
 * Bulk-verify and insert new clients.
 * Returns { added, reviewList }.
 */
async function addVerifiedClientsAndReturnReviewList(rawClients) {
  const toSave = [];
  const reviewList = [];
  const sinceDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  for (const data of rawClients) {
    let client = { ...data };
    client = await checkInvoiceMismatch(client, sinceDate);
    client = await flagAndUpdateDelinquent(client, sinceDate);
    client = await reviewClientContact(client, sinceDate);

    if (client.status === "inReview") {
      reviewList.push({ ...data, reviewReason: "Automated checks failed" });
    } else {
      toSave.push(data);
    }
  }

  const added = toSave.length ? await Client.insertMany(toSave) : [];
  console.log(
    `[Import] added=${added.length}, reviewList=${reviewList.length}`
  );

  return { added, reviewList };
}

module.exports = {
  checkInvoiceMismatch,
  flagAndUpdateDelinquent,
  reviewClientContact,
  addVerifiedClientsAndReturnReviewList,
};
