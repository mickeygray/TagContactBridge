// utils/quickFilterClientStatus.js

const {
  fetchInvoices,
  fetchBillingSummary,
  fetchActivities,
} = require("../services/logicsService");

/** …helpers omitted for brevity… **/

const stopPatterns = [
  /do not (contact|call|text)/i,
  /no a\/s/i,
  /no adserv/i,
  /no additional service/i,
  /client hung up/i,
  /does not want to (be )?contacted/i,
  /opt out/i,
];
const STATUS_CHANGE_RE = /\bstatus changed from\s+(\w+)\s+to\s+(\w+)/i;
const CONVERSION_WINDOW_MS = 60 * 60 * 1000; // 1h
function getLastInvoiceDate(invoices = []) {
  const times = invoices.flatMap((inv) => {
    const c = new Date(inv.CreatedDate).getTime();
    const m = inv.ModifiedDate ? new Date(inv.ModifiedDate).getTime() : c;
    return [c, m];
  });
  if (!times.length) return null;
  return new Date(Math.max(...times));
}
async function singleListFilter(clients, domain) {
  console.log(`▶️ singleListFilter: starting with ${clients.length} clients`);
  const clean = [];

  for (const data of clients) {
    const client = { ...data };
    console.log(`\n— checking client ${client.caseNumber} (${domain})`);

    // 1) INVOICE CHECK
    let invoices;
    try {
      invoices = await fetchInvoices(domain, parseInt(client.caseNumber, 10));
    } catch (err) {
      console.log(`  ❌ skip ${client.caseNumber}: invoice fetch error`);
      continue;
    }
    if (!Array.isArray(invoices) || invoices.length === 0) {
      console.log(`  ❌ skip ${client.caseNumber}: no invoices`);
      continue;
    }

    const lastInvoiceDate = getLastInvoiceDate(invoices);
    const invoiceCount = invoices.length;
    const lastInv = invoices[invoiceCount - 1];
    const lastAmount = lastInv.UnitPrice ?? lastInv.Amount ?? 0;

    if (
      client.invoiceCount != null &&
      (client.invoiceCount !== invoiceCount ||
        client.lastInvoiceAmount !== lastAmount)
    ) {
      console.log(
        `  ❌ skip ${client.caseNumber}: invoice mismatch (had ${client.invoiceCount}/${client.lastInvoiceAmount}, got ${invoiceCount}/${lastAmount})`
      );
      continue;
    }
    console.log(`  ✅ invoices OK (${invoiceCount} @ ${lastAmount})`);

    // 2) BILLING SUMMARY CHECK
    let summary;
    try {
      summary = await fetchBillingSummary(
        domain,
        parseInt(client.caseNumber, 10)
      );
    } catch {
      console.log(`  ❌ skip ${client.caseNumber}: billing summary error`);
      continue;
    }
    const pastDue = summary.PastDue ?? 0;
    const paidAmount = summary.PaidAmount ?? 0;
    if (pastDue > 0 || paidAmount > 50000) {
      console.log(
        `  ❌ skip ${client.caseNumber}: billing flagged (pastDue=${pastDue}, paid=${paidAmount})`
      );
      continue;
    }
    console.log(`  ✅ billing OK (pastDue=${pastDue}, paid=${paidAmount})`);

    // 3) ACTIVITY CHECK
    let activities;
    try {
      activities = await fetchActivities(
        domain,
        parseInt(client.caseNumber, 10)
      );
    } catch {
      console.log(`  ❌ skip ${client.caseNumber}: activities fetch error`);
      continue;
    }
    const sinceMs = lastInvoiceDate?.getTime() ?? 0;
    const nowMs = Date.now();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

    // gather “converted from prospect” times
    const convTimes = activities
      .filter((a) =>
        /converted from prospect/i.test(`${a.Subject} ${a.Comment}`)
      )
      .map((a) => new Date(a.CreatedDate).getTime());

    let badActivity = false;
    for (const a of activities) {
      const ts = new Date(a.CreatedDate).getTime();
      if (ts <= sinceMs) continue;
      const raw = `${a.Subject || ""} ${a.Comment || ""}`;

      // status change?
      if (/status changed/i.test(raw)) {
        const m = raw.match(STATUS_CHANGE_RE);
        if (m) {
          const newStatus = m[2].trim();
          if (/Tier\s*5/i.test(newStatus)) {
            console.log(`  ❌ skip ${client.caseNumber}: Tier 5 status change`);
            badActivity = true;
          } else if (
            /Tier\s*4/i.test(newStatus) &&
            ts >= nowMs - THIRTY_DAYS_MS
          ) {
            console.log(`  ❌ skip ${client.caseNumber}: Tier 4 in last 30d`);
            badActivity = true;
          }
        }
      }
      if (badActivity) break;

      // do-not-contact patterns?
      if (stopPatterns.some((rx) => rx.test(raw))) {
        console.log(`  ❌ skip ${client.caseNumber}: do-not-contact language`);
        badActivity = true;
        break;
      }
    }
    if (badActivity) continue;

    console.log(`  ✅ activities OK`);
    // — all checks passed!
    clean.push(client);
  }

  console.log(`\n✔️ singleListFilter: returning ${clean.length} clean clients`);
  return clean;
}

module.exports = { singleListFilter };
