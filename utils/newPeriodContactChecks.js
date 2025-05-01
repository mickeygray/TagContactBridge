// utils/verifyClientStatus.js

// Pull in the core Logics service helpers
const {
  fetchInvoices,
  fetchBillingSummary,
  fetchActivities,
  fetchTasks,
} = require("../services/logicsService");
const {
  Types: { ObjectId },
} = require("mongoose");
// Mongoose Client model for DB writes
const Client = require("../models/Client");

function getThreeBusinessDaysAgo(from = new Date()) {
  const OFFSETS = { 1: 5, 2: 5, 3: 5, 4: 3, 5: 3 }; // Mon–Wed→5, Thu–Fri→3
  const offset = OFFSETS[from.getDay()] ?? 3;
  return new Date(from.getTime() - offset * 24 * 60 * 60 * 1000);
}

/** All of your constants in one place */
const helpers = {
  approvedAgents: new Set([
    "Eva Gray",
    "Phil Olson",
    "Bruce Allen",
    "Eli Hayes",
    "Kassy Burton",
    "Jonathan Haro",
    "Dani Pearson",
    "Jake Wallace",
  ]),
  keywords: ["swc", "a/s", "cci", "spoke", "call", "message"],
  stopPatterns: [
    /do not (contact|call|text)/i,
    /no a\/s/i,
    /no adserv/i,
    /no additional service/i,
    /client hung up/i,
    /does not want to (be )?contacted/i,
    /opt out/i,
  ],
  conversionWindowMs: 1000,
  getThreeDays: getThreeBusinessDaysAgo,
};

function stampReview(client) {
  const todayStr = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
  client.reviewDates = [
    ...(Array.isArray(client.reviewDates) ? client.reviewDates : []),
    todayStr,
  ];
  return client;
}
/**
 * 1️⃣ Check invoice count & last-amount mismatch.
 *    Mark inReview if mismatch, record initialPayment if missing.
 */
async function checkInvoiceMismatch(client, sinceDate) {
  const cutoff = sinceDate || client.lastContactDate;
  if (!cutoff) return client;

  let invoices;
  try {
    invoices = await fetchInvoices(client.domain, client.caseNumber);
  } catch (err) {
    (client.reviewMessage = `[Invoice] ${client.caseNumber} fetch error, flagging review:${err.message}`),
      stampReview(client);
    return client;
  }

  if (!Array.isArray(invoices) || invoices.length === 0) {
    client.reviewMessage = `[Invoice] ${client.caseNumber} no invoices returned, flagging review`;
    stampReview(client);
    return client;
  }

  // snapshot new values
  const currentCount = invoices.length;
  const lastInv = invoices[currentCount - 1];
  const lastAmount = lastInv.UnitPrice ?? lastInv.Amount ?? 0;
  const lastDate = new Date(lastInv.CreatedDate);

  // detect any mismatch against existing
  const countMismatch =
    client.invoiceCount != null && client.invoiceCount !== currentCount;
  const amountMismatch =
    client.lastInvoiceAmount != null && client.lastInvoiceAmount !== lastAmount;
  const dateMismatch =
    client.lastInvoiceDate instanceof Date &&
    client.lastInvoiceDate.getTime() !== lastDate.getTime();

  if (countMismatch || amountMismatch || dateMismatch) {
    client.reviewMessage =
      `[Invoice] ${client.caseNumber} mismatch → ` +
      `count ${client.invoiceCount}->${currentCount}, ` +
      `amount ${client.lastInvoiceAmount}->${lastAmount}, ` +
      `date ${client.lastInvoiceDate?.toISOString()}->${lastDate.toISOString()}`;

    stampReview(client);
  }

  // now that we’ve checked, persist the “truth” for next time
  client.invoiceCount = currentCount;
  client.lastInvoiceAmount = lastAmount;
  client.lastInvoiceDate = lastDate;

  if (client.lastInvoiceAmount === 0) {
    client.reviewMessage = `[Invoice] ${client.caseNumber} has a zero invoice as the last invoice`;
    stampReview(client);
  }

  return client;
}

/**
 * 2️⃣ Check past-due balance.
 *    Flag inReview if any past-due amount > 0.
 */
/**
 * 1️⃣ Fetch the client’s billing summary.
 * 2️⃣ If PastDue > 0, append today to reviewDates, set delinquent fields.
 * 3️⃣ Compare PaidAmount vs client.totalPayment:
 *     - On first run (sinceDate truthy), initialize totalPayment.
 *     - On subsequent runs, if PaidAmount changes:
 *         • If PaidAmount < existing totalPayment → refund suspicion → reviewDates
 *         • Always update client.totalPayment to the new PaidAmount
 *
 * @param {Object} client    Lean client object (may have reviewDates[])
 * @param {Date}   sinceDate Cutoff to decide “first run” vs “compare”
 */
async function checkClientBillingSummary(client, sinceDate, maxTotalPayments) {
  const cutoff = sinceDate || client.lastContactDate;
  if (!cutoff) return client;

  let summary;
  try {
    // Expecting shape: { data: { PastDue, PaidAmount, /*...*/ } }
    summary = await fetchBillingSummary(client.domain, client.caseNumber);
  } catch (err) {
    client.reviewMessage = `[Billing] ${client.caseNumber} fetch error, flagging review: ${err.message}`;

    stampReview(client);
    return client;
  }

  const pastDue = summary.PastDue ?? 0;
  const paidAmount = summary.PaidAmount ?? 0;

  // 1️⃣ Past-due check
  if (pastDue > 0) {
    client.reviewMessage = `[Billing] ${client.caseNumber} PastDue=${pastDue} → flagging review`;

    client.delinquentAmount = pastDue;
    // only set delinquentDate if not already set
    if (!client.delinquentDate) {
      client.delinquentDate = new Date();
    }
    stampReview(client);
  }

  const prevPaid = client.totalPayment;

  // 1️⃣ If we’ve never set totalPayment before, seed it:
  if (prevPaid == null) {
    client.totalPayment = paidAmount;
    client.reviewMessage = `[Billing] ${client.caseNumber} initialized totalPayment=${paidAmount}`;

    // 2️⃣ Otherwise, if it’s changed, flag and update:
  } else if (prevPaid !== paidAmount) {
    client.reviewMessage =
      `[Billing] ${client.caseNumber} totalPayment mismatch ` +
      `${prevPaid}->${paidAmount}`;

    // if it’s dropped, suspicious refund → review
    if (paidAmount < prevPaid) {
      client.reviewMessage = `[Billing] ${client.caseNumber} paid amount decreased. Possible Refund`;
      stampReview(client);
    }

    if (paidAmount > maxTotalPayments) {
      client.reviewMessage = `[Billing] ${client.caseNumber} paid amount above max payment threshold.`;
      stampReview(client);
    }

    // always overwrite to newest
    client.totalPayment = paidAmount;
  }

  return client;
}

/**
 * 3️⃣ Review status-change activities (excluding benign conversions).
 */
/**
 * 1️⃣ If any “converted to prospect” note appears, flag right away.
 * 2️⃣ Else if any genuine “status changed” appears after sinceDate, flag.
 * 3️⃣ Else if in the last 3 days any approved agent left a keyword note, flag.
 *
 * Only one Logics call, and we append a review timestamp on client.reviewDates.
 *
 * @param {Object} client      { domain, caseNumber, lastContactDate?, createDate?, reviewDates? }
 * @param {Date}   sinceDate   cutoff for step 2
 */
async function checkClientActivities(client, sinceDate) {
  const {
    approvedAgents,
    keywords,
    stopPatterns,
    conversionWindowMs,
    getThreeDays,
  } = helpers;

  // 1️⃣ fetch activities once
  let activities;
  try {
    activities = await fetchActivities(client.domain, client.caseNumber);
  } catch {
    return stampReview(client);
  }
  if (!Array.isArray(activities) || activities.length === 0) {
    return stampReview(client);
  }

  // precompute conversion-to-client timestamps
  const convTimes = activities
    .filter((a) => /converted from prospect/i.test(`${a.Subject} ${a.Comment}`))
    .map((a) => new Date(a.CreatedDate).getTime());

  const cutoffMs = sinceDate ? new Date(sinceDate).getTime() : 0;
  const threeDaysMs = getThreeDays().getTime();
  const nowMs = Date.now();

  // 2️⃣ “status changed” outside conversion window
  for (const a of activities) {
    const ts = new Date(a.CreatedDate).getTime();
    if (ts < cutoffMs) continue;
    const txt = `${a.Subject} ${a.Comment}`.toLowerCase();
    if (!txt.includes("status changed")) continue;
    if (convTimes.some((c) => Math.abs(c - ts) <= conversionWindowMs)) continue;
    client.reviewMessage = `[Activities] ${client.caseNumber} client status change recorded since ${sinceDate}`;
    return stampReview(client);
  }

  // 3️⃣ “converted to prospect” downgrade
  if (
    activities.some((a) =>
      /converted to prospect/i.test(`${a.Subject} ${a.Comment}`)
    )
  ) {
    client.reviewMessage = `[Activities] ${client.caseNumber} client downgraded to prospect since ${sinceDate}`;
    return stampReview(client);
  }

  // 4️⃣ keyword note by approved agent + no future follow-up task
  for (const a of activities) {
    const ts = new Date(a.CreatedDate).getTime();
    if (ts < threeDaysMs) continue;
    if (!approvedAgents.has(a.CreatedBy)) continue;
    const txt = `${a.Subject} ${a.Comment}`.toLowerCase();
    if (!keywords.some((kw) => txt.includes(kw))) continue;

    let tasks = [];
    try {
      tasks = await fetchTasks(client.domain, client.caseNumber);
    } catch {
      /* assume none */
    }

    const hasFuture =
      Array.isArray(tasks) &&
      tasks.some((t) => new Date(t.DueDate).getTime() > nowMs);
    if (!hasFuture) {
      client.reviewMessage = `[Activities] ${client.caseNumber} client has expired follow-up task as of  ${sinceDate}`;
      return stampReview(client);
    }
    break; // if they *do* have a future task, stop scanning
  }

  // 5️⃣ Explicit “do-not-contact” language
  for (const a of activities) {
    const txt = `${a.Subject} ${a.Comment}`;
    if (stopPatterns.some((rx) => rx.test(txt))) {
      client.reviewMessage = `[Activities] ${client.caseNumber} client activities includes do not contact language as of ${sinceDate}`;
      return stampReview(client);
    }
  }

  // passed all checks → leave unchanged
  return client;
}
// nothing flagged

/**
 * Bulk-verify and insert new clients.
 * Returns { added, reviewList }.
 */
async function addVerifiedClientsAndReturnUpdatedLists(
  freshClients,
  maxTotalPayments
) {
  const toReview = [];
  const partial = [];
  const verified = [];
  const bulkOps = [];

  for (const data of freshClients) {
    // clone your incoming lean client
    let client = { ...data };

    // generate your per-client cutoff
    const sinceDate = client.lastContactDate || client.createDate;

    // 1️⃣invoice mismatch
    client = await checkInvoiceMismatch(client, sinceDate);

    // 2️⃣billing summary
    client = await checkClientBillingSummary(
      client,
      sinceDate,
      maxTotalPayments
    );

    // 3️⃣activity/task checks
    client = await checkClientActivities(client, sinceDate);

    // ★ three-strike logic
    // assume stampReview now writes "YYYY-MM-DD" strings
    const today = new Date().toISOString().split("T")[0];

    const uniqueDates = Array.isArray(client.reviewDates)
      ? Array.from(new Set(client.reviewDates))
      : [];

    const count = uniqueDates.length;
    const hasToday = uniqueDates.includes(today);

    // 1) Three‐strike review
    if (count >= 3) {
      client.status = "inReview";
      client.reviewDates = [];
      client.reviewMessage = `[Review Warning] ${client.caseNumber} has exceeded three reviews. Consider manual follow-up.`;
      toReview.push(client);

      // 2️⃣ existing partials…
    } else if (client.status === "partial") {
      partial.push(client);

      // 3️⃣ any other client with a reviewMessage → review
    } else if (client.reviewMessage) {
      toReview.push(client);

      // 4️⃣ clean for this period (never stamped today)
    } else if (!hasToday) {
      verified.push(client);

      // stamped today but not 3 strikes → neither reviewed nor contacted
    }

    // prepare a bulkWrite update for this client
    bulkOps.push({
      updateOne: {
        filter: { _id: client._id },
        update: {
          $set: {
            invoiceCount: client.invoiceCount,
            lastInvoiceAmount: client.lastInvoiceAmount,
            lastInvoiceDate: client.lastInvoiceDate,
            totalPayment: client.totalPayment,
            delinquentAmount: client.delinquentAmount,
            delinquentDate: client.delinquentDate,
            reviewDates: client.reviewDates,
            status: client.status,
          },
        },
      },
    });
  }

  // Persist everything in one go
  if (bulkOps.length) {
    await Client.bulkWrite(bulkOps);
  }

  console.log(
    `[Import] toReview=${toReview.length}, partial=${partial.length}, verified=${verified.length}`
  );

  return { toReview, partial, verified };
}

module.exports = {
  checkInvoiceMismatch,
  checkClientBillingSummary,
  checkClientActivities,
  addVerifiedClientsAndReturnUpdatedLists,
};
