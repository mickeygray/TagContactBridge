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
    const pastDue = summary.PastDue ?? 0;
    if (pastDue > 0) {
      stampReview(
        client,
        `[Billing] ${client.caseNumber} PastDue=${pastDue} → flagging review`
      );
    }

    return client;
  } catch (err) {
    return stampReview(
      client,
      `[Billing] fetch error for ${client.caseNumber}, flagging review`
    );
  }
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

  const CONVERSION_WINDOW_MS = 1000;

  // scan for “status changed”
  for (const a of activities) {
    const ts = new Date(a.CreatedDate).getTime();
    if (ts <= cutoff.getTime()) continue;

    const raw = `${a.Subject || ""} ${a.Comment || ""}`;
    if (!/status changed/i.test(raw)) continue;
    if (convTimes.some((c) => Math.abs(c - ts) <= CONVERSION_WINDOW_MS)) {
      continue;
    }
    const STATUS_CHANGE_RE =
      /status\s+changed\s+(?:from\s*([^,.;]+)\s*)?to\s*([^,.;]+)/i;
    // parse out the new status
    const m = raw.match(STATUS_CHANGE_RE);
    const when = new Date(ts).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    if (m) {
      const [, oldStatus, newStatus] = m.map((s) => s.trim());

      // 1) IGNORE the Wynn “Active Prospect → Pending Approval” step
      if (
        /Active Prospect/i.test(oldStatus) &&
        /Pending Approval/i.test(newStatus)
      ) {
        continue; // skip stamping for this specific transition
      }
      if (
        /Active Prospect/i.test(oldStatus) &&
        /Active Prospect/i.test(newStatus)
      ) {
        continue; // skip stamping for this specific transition
      }

      if (/Lead/i.test(oldStatus) && /Active Prospect/i.test(newStatus)) {
        continue; // skip stamping for this specific transition
      }
      if (/Lead/i.test(oldStatus) && /Pending Approval/i.test(newStatus)) {
        continue; // skip stamping for this specific transition
      }
      if (
        /Pending Approval/i.test(oldStatus) &&
        /Active Client/i.test(newStatus)
      ) {
        continue; // skip stamping for this specific transition
      }
      if (/Pending Approval/i.test(oldStatus) && /TI/i.test(newStatus)) {
        continue; // skip stamping for this specific transition
      }

      // — Tier 5 or Non‑Collectible → delete
      if (/Tier\s*5/i.test(newStatus) || /Non-Collectible/i.test(newStatus)) {
        await Client.deleteOne({ caseNumber: client.caseNumber });
        return { deleted: true, caseNumber: client.caseNumber };
      }

      // — Tier 1 → POA update for saleDate clients; review for createDate clients
      if (/Tier\s*1/i.test(newStatus)) {
        const isSaleClient = !!client.saleDate && !client.createDate;
        if (isSaleClient) {
          // tag them so the scheduler knows this came via Tier1
          client.autoPOA = true;

          // still record their “poa” stage so you can see it on the client object
          client.stage = "poa";
          client.stagesReceived = [
            ...new Set([...(client.stagesReceived || []), "poa"]),
          ];
          client.stagePieces = [
            ...new Set([...(client.stagePieces || []), "POA Email 1"]),
          ];

          // bump lastContactDate so your window logic picks them up
          client.lastContactDate = new Date();
          return client;
        }
        // …else fall back to review
        return stampReview(
          client,
          `[Activity] Tier 1 status change on ${when}`
        );
      }
    }

    // — any other status changed → generic review
    return stampReview(
      client,
      `[Activity] status changed (“${a.Subject}”) on ${when}`
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
