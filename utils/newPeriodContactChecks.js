// utils/verifyClientStatus.js

const {
  fetchInvoices,
  fetchBillingSummary,
  fetchActivities,
  fetchTasks,
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
function getThreeBusinessDaysAgo(from = new Date()) {
  const OFFSETS = { 1: 5, 2: 5, 3: 5, 4: 3, 5: 3 };
  // from.getDay(): 0=Sun,1=Mon…6=Sat
  const offset = OFFSETS[from.getDay()] ?? 3;
  return new Date(from.getTime() - offset * 24 * 60 * 60 * 1000);
}

// Agents whose keyword notes we treat specially
const approvedAgents = [
  "Eva Gray",
  "Phil Olson",
  "Bruce Allen",
  "Eli Hayes",
  "Kassy Burton",
  "Jonathan Haro",
  "Dani Pearson",
  "Jake Wallace",
];

// Keywords to look for in notes
const keywords = ["swc", "a/s", "cci", "spoke", "call", "message"];

// Patterns that should trigger a do-not-contact review
const stopPatterns = [
  /do not (contact|call|text)/i,
  /no a\/s/i,
  /no adserv/i,
  /no additional service/i,
  /client hung up/i,
  /does not want to (be )?contacted/i,
  /opt out/i,
];
/**
 * 1️⃣ processInvoices
 *    • fetch & seed invoiceCount, lastInvoiceAmount, initialPayment
 *    • derive sinceDate = lastInvoiceDate
 *    • stampReview on any mismatch
 */
async function processInvoices(client) {
  let invoices;
  try {
    invoices = await fetchInvoices(client.domain, parseInt(client.caseNumber));
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
  client.sinceDate = client.sinceDate ?? lastInvoiceDate;
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
    summary = await fetchBillingSummary(
      client.domain,
      parseInt(client.caseNumber)
    );
  } catch (err) {
    stampReview(
      client,
      `[Billing] fetch error (${err.message}), flagging review`
    );

    return client;
  }

  const pastDue = summary.PastDue ?? 0;
  const paidAmount = summary.PaidAmount ?? 0;

  // ❗ Past‐due check
  if (pastDue > 0) {
    stampReview(client, `[Billing] PastDue=${pastDue} → flagging review`);
  }

  // ▶️ Now handle total‑payment vs threshold
  const prevPaid = client.totalPayment;

  // First time: seed it
  if (prevPaid == null) {
    client.totalPayment = paidAmount;
  }
  // On subsequent runs:

  // if it dropped — refund suspicion
  if (paidAmount < prevPaid) {
    stampReview(
      client,
      `[Billing] paid amount decreased (${prevPaid}->${paidAmount}), possible refund`
    );
  }
  // if above your max threshold
  if (paidAmount > 50000) {
    stampReview(client, `[Billing] paid amount ${paidAmount} exceeds 50000`);
  }

  // always overwrite to newest
  client.totalPayment = paidAmount;

  return client;
}

/**
 * 3️⃣ reviewClientContact
 *    • flags any “status changed” (outside 1s of conversion)
 *      occurring after client.sinceDate
 */
async function checkClientActivities(client) {
  const cutoff = client.sinceDate;
  if (!cutoff) return client;

  let activities;
  try {
    activities = await fetchActivities(
      client.domain,
      parseInt(client.caseNumber)
    );
  } catch (err) {
    // API failure ⇒ immediate review
    stampReview(client, `[Activity] fetch error: ${err.message}`);
    return client;
  }

  if (!Array.isArray(activities) || activities.length === 0) {
    stampReview(client, `[Activity] no activities found`);
    return client;
  }

  // 1️⃣ Gather conversion timestamps (to skip adjacent status‑changed)
  const convTimes = activities
    .filter((a) => /converted from prospect/i.test(`${a.Subject} ${a.Comment}`))
    .map((a) => new Date(a.CreatedDate).getTime());

  const cutoffMs = cutoff.getTime();
  const sinceDateMs = client.sinceDate;
  const nowMs = Date.now();

  // 2️⃣ “status changed” outside conversion window
  for (const a of activities) {
    const ts = new Date(a.CreatedDate).getTime();
    if (ts <= cutoffMs) continue;
    const txt = `${a.Subject} ${a.Comment}`.toLowerCase();
    if (!txt.includes("status changed")) continue;
    // skip if within conversionWindowMs of a conversion event
    if (convTimes.some((c) => Math.abs(c - ts) <= 1000)) continue;

    // genuine status change ⇒ review
    const when = new Date(ts).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    if (new Date(a.CreatedDate) < new Date(client.sinceDate)) continue;
    stampReview(
      client,
      `[Activity] status change message ${a.Subject} on ${when} `
    );
    return client;
  }

  // 3️⃣ “converted to prospect” downgrade (anytime)
  if (
    activities.some(
      (a) =>
        /converted to prospect/i.test(`${a.Subject} ${a.Comment}`) &&
        new Date(a.CreatedDate) > new Date(client.sinceDate)
    )
  ) {
    stampReview(client, `[Activity] converted to prospect`);
    return client;
  }

  // 4️⃣ Keyword note by approved agent within last 3 business days + no future task
  for (const a of activities) {
    const ts = new Date(a.CreatedDate).getTime();
    if (ts < sinceDateMs) continue;
    if (!approvedAgents.includes(a.CreatedBy)) continue;
    const txt = `${a.Subject} ${a.Comment}`.toLowerCase();
    if (!keywords.some((kw) => txt.includes(kw))) continue;

    let tasks = [];
    try {
      tasks = await fetchTasks(client.domain, parseInt(client.caseNumber));
    } catch {
      tasks = [];
    }
    const hasFuture =
      Array.isArray(tasks) &&
      tasks.some((t) => new Date(t.DueDate).getTime() > nowMs);
    if (!hasFuture) {
      stampReview(
        client,
        `[Activity] keyword note by ${a.CreatedBy} without future task`
      );
      return client;
    }
    break;
  }

  // 5️⃣ Explicit “do-not-contact” patterns
  for (const a of activities) {
    const txt = `${a.Subject} ${a.Comment}`;
    if (stopPatterns.some((rx) => rx.test(txt))) {
      stampReview(client, `[Activity] do-not-contact language detected`);
      return client;
    }
  }

  // ❗ No flags → leave unchanged
  return client;
}

/**
 * Bulk‐verify a list of fresh clients.
 * Returns { added, reviewList }.
 */
async function addVerifiedClientsAndReturnUpdatedLists(freshClients) {
  const toReview = [];
  const partial = [];
  const verified = [];
  const bulkOps = [];

  for (const data of freshClients) {
    // clone incoming data
    let client = { ...data };
    console.log(client);
    // 1️⃣ Invoice processing (also stamps client.sinceDate & may flag)
    client = await processInvoices(client);

    // 2️⃣ Delinquent check (since client.sinceDate)
    client = await flagAndUpdateDelinquent(client);

    // 3️⃣ Activity review (since client.sinceDate)
    client = await checkClientActivities(client);

    // 4️⃣ Three‐strike & status/partial logic
    const today = new Date().toISOString().slice(0, 10);
    const dates = Array.isArray(client.reviewDates)
      ? Array.from(new Set(client.reviewDates))
      : [];
    const strikeCnt = dates.length;

    if (strikeCnt >= 3) {
      // reset their stamps and force review
      client.reviewDates = [];
      client.reviewMessages.push(
        `[Review Warning] ${client.caseNumber} has exceeded three reviews. Manual follow-up required.`
      );
      client.status = "inReview";
      toReview.push(client);
    } else if (client.status === "partial") {
      partial.push(client);
    } else if (
      Array.isArray(client.reviewMessages) &&
      client.reviewMessages.length
    ) {
      // any other flagged message
      toReview.push(client);
    } else {
      // no flags today → good to go
      verified.push(client);
    }

    // 5️⃣ Persist all inspection fields in one bulkWrite
    bulkOps.push({
      updateOne: {
        filter: { _id: client._id },
        update: {
          $set: {
            status: client.status,
            reviewDates: client.reviewDates,
            reviewMessages: client.reviewMessages,
            invoiceCount: client.invoiceCount,
            lastInvoiceAmount: client.lastInvoiceAmount,
            lastInvoiceDate: client.lastInvoiceDate,
            totalPayment: client.totalPayment,
            delinquentAmount: client.delinquentAmount,
            delinquentDate: client.delinquentDate,
          },
        },
      },
    });
  }

  if (bulkOps.length) {
    await Client.bulkWrite(bulkOps);
  }

  return { toReview, partial, verified };
}

module.exports = {
  stampReview,
  processInvoices,
  flagAndUpdateDelinquent,
  checkClientActivities,
  addVerifiedClientsAndReturnUpdatedLists,
};
