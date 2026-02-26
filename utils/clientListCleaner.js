/**
 * clientListCleaner.js
 *
 * Smart filtering with time-based rules:
 * - REMOVE: Recent activity (last 30 days), recent invoices, cleared loans, bad behavior
 * - FLAG: Recent No A/S (last 6 months) without clear negative reason
 * - PASS: Older No A/S, everything else clean
 */

const {
  fetchInvoices,
  fetchActivities,
  fetchBillingSummary,
} = require("../services/logicsService");

// ============ TIME CONSTANTS ============
const NOW = Date.now();
const DAYS_30 = 30 * 24 * 60 * 60 * 1000;
const DAYS_90 = 90 * 24 * 60 * 60 * 1000;
const DAYS_180 = 180 * 24 * 60 * 60 * 1000;

// ============ AGENTS ============
const ACTIVE_AGENTS = [
  "Dani Pearson",
  "Matthew Anderson",
  "Jake Wallace",
  "Jonathan Haro",
  "Eli Hayes",
];

// ============ PATTERNS ============
const NO_AS_PATTERNS = [
  /\bno\s*a\/s\b/i,
  /\bno\s*a\.s\b/i,
  /\bno\s+add(itional)?\s*serv/i,
  /\bno\s+adserv/i,
];

const NEGATIVE_CLARIFICATIONS = [
  /\bno\s*money\b/i,
  /\bbroke\b/i,
  /\bnothing\s*here\b/i,
  /\bclose\s*(the\s*)?case\b/i,
  /\bcan'?t\s*afford\b/i,
  /\bno\s*funds\b/i,
  /\bunemployed\b/i,
  /\bdisabled\b/i,
  /\bfixed\s*income\b/i,
  /\bsocial\s*security\b/i,
  /\bssi\b/i,
  /\bssdi\b/i,
  /\bhardship\b/i,
  /\bfinancial\s*(difficulty|trouble|problem)/i,
];

const HARD_REMOVE_PATTERNS = [
  /\bbbb\s/i,
  /\bbbb\s*complaint/i,
  /\bfiled\s*(a\s*)?complaint/i,
  /\bcomplaint\s*(filed|with|to)/i,
  /\bopted\s*out\b/i,
  /\bdon'?t\s*call\b/i,
  /\bdo\s*not\s*call\b/i,
  /\bleave\s*(me\s*)?alone\b/i,
  /\bstop\s*calling\b/i,
  /\bstop\s*contacting\b/i,
  /\bangry\b/i,
  /\birate\b/i,
  /\bhostile\b/i,
  /\bthreatened\b/i,
  /\bhung\s*up\b/i,
  /\bclient\s*(is\s*)?(deceased|dead)\b/i,
  /\bclient\s*passed\s*away\b/i,
];

const COMM_KEYWORDS = [
  /\bswc\b/i,
  /\bcci\b/i,
  /\bspoke\s*(with|to)\s*client/i,
  /\bclient\s*called/i,
  /\bclient\s*contact/i,
  /\bmessage\s*sent/i,
  /\bsent\s*(text|email|message)/i,
  /\bleft\s*(vm|voicemail|message)/i,
  /\ba\/s\b/i,
];

const LOAN_PATTERNS = [/\bkwik\b/i, /\bdefi\b/i, /\bfee\b/i];

// ============ DATE PARSING HELPERS ============

/**
 * Extract all dates from a comment string
 * Looks for patterns like:
 * - "1/15/2025" or "01/15/2025"
 * - "Jan 15, 2025" or "January 15, 2025"
 * - "2025-01-15"
 */
function extractDatesFromText(text) {
  const dates = [];

  if (!text) return dates;

  // Pattern 1: MM/DD/YYYY or M/D/YYYY
  const slashPattern = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/g;
  let match;
  while ((match = slashPattern.exec(text)) !== null) {
    const [, month, day, year] = match;
    const fullYear = year.length === 2 ? `20${year}` : year;
    const parsed = new Date(
      `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
    );
    if (!isNaN(parsed.getTime())) {
      dates.push({ date: parsed, raw: match[0] });
    }
  }

  // Pattern 2: Mon DD, YYYY or Month DD, YYYY
  const monthNames =
    "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
  const monthPattern = new RegExp(
    `(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})`,
    "gi"
  );
  while ((match = monthPattern.exec(text)) !== null) {
    const parsed = new Date(match[0]);
    if (!isNaN(parsed.getTime())) {
      dates.push({ date: parsed, raw: match[0] });
    }
  }

  // Pattern 3: YYYY-MM-DD
  const isoPattern = /(\d{4})-(\d{2})-(\d{2})/g;
  while ((match = isoPattern.exec(text)) !== null) {
    const parsed = new Date(match[0]);
    if (!isNaN(parsed.getTime())) {
      dates.push({ date: parsed, raw: match[0] });
    }
  }

  return dates;
}

/**
 * Get the most recent date from an activity
 * Checks both CreatedDate and any dates found in Comment
 */
function getMostRecentDate(activity) {
  const createdDate = new Date(activity.CreatedDate);
  let mostRecent = createdDate;

  const commentDates = extractDatesFromText(activity.Comment);
  for (const { date } of commentDates) {
    if (date > mostRecent && date <= new Date()) {
      // Don't use future dates
      mostRecent = date;
    }
  }

  return mostRecent;
}

/**
 * Find the text segment around a No A/S mention
 * Returns the text between the date before and date after the No A/S
 */
function getNoASContext(comment) {
  if (!comment) return { text: "", date: null };

  const dates = extractDatesFromText(comment);
  const noASMatch = comment.match(
    /no\s*a\/s|no\s*add(itional)?\s*serv|no\s*adserv/i
  );

  if (!noASMatch) return { text: comment, date: null };

  const noASIndex = noASMatch.index;

  // Sort dates by position in text
  const sortedDates = dates
    .map((d) => ({ ...d, index: comment.indexOf(d.raw) }))
    .sort((a, b) => a.index - b.index);

  // Find the date immediately before No A/S
  let precedingDate = null;
  let startIndex = 0;

  for (const d of sortedDates) {
    if (d.index < noASIndex) {
      precedingDate = d.date;
      startIndex = d.index;
    } else {
      break;
    }
  }

  // Find the date immediately after No A/S (end of this entry)
  let endIndex = comment.length;
  for (const d of sortedDates) {
    if (d.index > noASIndex) {
      endIndex = d.index;
      break;
    }
  }

  const contextText = comment.substring(startIndex, endIndex).trim();

  return {
    text: contextText,
    date: precedingDate,
  };
}

function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function getDaysAgo(date) {
  try {
    const d = date instanceof Date ? date : new Date(date);
    return Math.floor((NOW - d.getTime()) / (24 * 60 * 60 * 1000));
  } catch {
    return 9999;
  }
}

function isWithinDays(date, days) {
  try {
    const d = date instanceof Date ? date : new Date(date);
    return NOW - d.getTime() <= days;
  } catch {
    return false;
  }
}

function matchesAnyPattern(text, patterns) {
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      const match = text.match(pattern);
      return { matched: true, text: match ? match[0] : "matched" };
    }
  }
  return { matched: false };
}

function hasNoAS(text) {
  return matchesAnyPattern(text, NO_AS_PATTERNS).matched;
}

function hasNegativeClarification(text) {
  return matchesAnyPattern(text, NEGATIVE_CLARIFICATIONS).matched;
}

function hasHardRemoveLanguage(text) {
  return matchesAnyPattern(text, HARD_REMOVE_PATTERNS);
}

function extractCommunicationActivities(activities) {
  const comms = [];
  for (const act of activities) {
    const combined = `${act.Subject || ""} ${act.Comment || ""}`;
    if (matchesAnyPattern(combined, COMM_KEYWORDS).matched) {
      const mostRecentDate = getMostRecentDate(act);
      comms.push({
        date: formatDate(mostRecentDate),
        daysAgo: getDaysAgo(mostRecentDate),
        createdBy: act.CreatedBy || "Unknown",
        subject: act.Subject || "",
        snippet: (act.Comment || "").substring(0, 300),
      });
    }
  }
  // Sort by most recent first
  comms.sort((a, b) => a.daysAgo - b.daysAgo);
  return comms.slice(0, 10);
}

// ============ SINGLE CLIENT PROCESSOR ============

async function processClient(client, domain) {
  const result = {
    status: null,
    reason: null,
    reviewMessages: [],
  };

  // ============ FETCH DATA ============
  let invoices = [];
  let activities = [];
  let billing = null;

  try {
    invoices =
      (await fetchInvoices(domain, parseInt(client.caseNumber, 10))) || [];
  } catch (e) {
    console.error(`[Invoice fetch] ${client.caseNumber}: ${e.message}`);
  }

  await new Promise((r) => setTimeout(r, 30));

  try {
    activities =
      (await fetchActivities(domain, parseInt(client.caseNumber, 10))) || [];
  } catch (e) {
    console.error(`[Activity fetch] ${client.caseNumber}: ${e.message}`);
  }

  await new Promise((r) => setTimeout(r, 30));

  try {
    billing = await fetchBillingSummary(
      domain,
      parseInt(client.caseNumber, 10)
    );
  } catch (e) {
    // Optional
  }

  const paidAmount = billing?.PaidAmount || 0;

  // ============ CHECK 1: Any activity in last 30 days = REMOVE ============
  // Check BOTH CreatedDate AND dates within comments
  for (const act of activities) {
    const mostRecentDate = getMostRecentDate(act);

    if (isWithinDays(mostRecentDate, DAYS_30)) {
      result.status = "removed";
      result.reason = `Activity in last 30 days: "${
        act.Subject || "Note"
      }" by ${act.CreatedBy || "Unknown"} (most recent: ${formatDate(
        mostRecentDate
      )})`;
      return result;
    }
  }

  // ============ CHECK 2: Any positive invoice in last 90 days = REMOVE ============
  for (const inv of invoices) {
    const amount = inv.UnitPrice ?? inv.Amount ?? 0;
    if (amount > 0 && isWithinDays(inv.CreatedDate, DAYS_90)) {
      if (amount > 10000) {
        if (paidAmount >= amount) {
          result.status = "removed";
          result.reason = `Large invoice ($${amount}) in last 90 days, paid ($${paidAmount})`;
          return result;
        }
        continue;
      }
      result.status = "removed";
      result.reason = `Invoice ($${amount}) in last 90 days on ${formatDate(
        inv.CreatedDate
      )}`;
      return result;
    }
  }

  // ============ CHECK 3: Loan invoices in last 90 days ============
  for (const inv of invoices) {
    const amount = inv.UnitPrice ?? inv.Amount ?? 0;
    const desc = inv.Description || inv.Subject || "";

    if (
      amount < 0 &&
      matchesAnyPattern(desc, LOAN_PATTERNS).matched &&
      isWithinDays(inv.CreatedDate, DAYS_90)
    ) {
      const loanInvoice = invoices.find((other) => {
        const otherAmt = other.UnitPrice ?? other.Amount ?? 0;
        return (
          otherAmt > 0 &&
          matchesAnyPattern(
            other.Description || other.Subject || "",
            LOAN_PATTERNS
          ).matched
        );
      });

      const loanAmount = loanInvoice
        ? loanInvoice.UnitPrice ?? loanInvoice.Amount ?? 0
        : 0;
      const totalLoanCost = Math.abs(amount) + loanAmount;

      if (paidAmount >= totalLoanCost - 1000) {
        result.status = "removed";
        result.reason = `Loan cleared: paid $${paidAmount}, loan total ~$${totalLoanCost}`;
        return result;
      }
    }
  }

  // ============ CHECK 4: Hard remove language in activities ============
  for (const act of activities) {
    const combined = `${act.Subject || ""} ${act.Comment || ""}`;
    const hardMatch = hasHardRemoveLanguage(combined);

    if (hardMatch.matched) {
      result.status = "removed";
      result.reason = `Bad language: "${hardMatch.text}" on ${formatDate(
        act.CreatedDate
      )}`;
      return result;
    }
  }

  // ============ CHECK 5: Hard remove language in invoices ============
  for (const inv of invoices) {
    const desc = inv.Description || inv.Subject || "";
    const hardMatch = hasHardRemoveLanguage(desc);

    if (hardMatch.matched) {
      result.status = "removed";
      result.reason = `Bad language in invoice: "${hardMatch.text}"`;
      return result;
    }
  }

  // ============ CHECK 6: No A/S Invoice in last 6 months = FLAG ============
  for (const inv of invoices) {
    const amount = inv.UnitPrice ?? inv.Amount ?? 0;
    const desc = inv.Description || inv.Subject || "";

    if (
      amount === 0 &&
      hasNoAS(desc) &&
      isWithinDays(inv.CreatedDate, DAYS_180)
    ) {
      const comms = extractCommunicationActivities(activities);

      result.reviewMessages.push({
        category: "NO_AS_INVOICE",
        message: `No A/S invoice in last 6 months`,
        data: {
          date: formatDate(inv.CreatedDate),
          daysAgo: getDaysAgo(inv.CreatedDate),
          description: desc,
          recentCommunications: comms,
        },
      });
      break;
    }
  }

  // ============ CHECK 7: No A/S Activity in last 6 months ============
  for (const act of activities) {
    const combined = `${act.Subject || ""} ${act.Comment || ""}`;

    if (hasNoAS(combined)) {
      // Get context around the No A/S mention
      const context = getNoASContext(act.Comment);
      const noASDate = context.date || new Date(act.CreatedDate);

      // Only care about No A/S in last 6 months
      if (!isWithinDays(noASDate, DAYS_180)) {
        continue; // Older than 6 months - skip, let through
      }

      // Check the context text for negative clarification
      if (hasNegativeClarification(context.text)) {
        result.status = "removed";
        result.reason = `No A/S with negative clarification: "${context.text.substring(
          0,
          100
        )}"`;
        return result;
      }

      // FLAG for review - include all communication history
      const comms = extractCommunicationActivities(activities);

      result.reviewMessages.push({
        category: "NO_AS_ACTIVITY",
        message: `No A/S activity in last 6 months - needs review`,
        data: {
          activityDate: formatDate(act.CreatedDate),
          noASDate: formatDate(noASDate),
          daysAgo: getDaysAgo(noASDate),
          createdBy: act.CreatedBy || "Unknown",
          subject: act.Subject || "",
          contextAroundNoAS: context.text.substring(0, 500),
          fullComment: (act.Comment || "").substring(0, 1000),
          recentCommunications: comms,
        },
      });
      break;
    }
  }

  // ============ FINAL STATUS ============
  if (result.reviewMessages.length > 0) {
    result.status = "flagged";
  } else {
    result.status = "clean";
  }

  return result;
}

// ============ MAIN FUNCTION ============

async function cleanClientList(contacts, domain) {
  const flagged = [];
  const clean = [];
  const removed = [];

  console.log(
    `[ListCleaner] Starting: ${contacts.length} contacts for ${domain}`
  );

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];

    if ((i + 1) % 100 === 0) {
      console.log(`[ListCleaner] Progress: ${i + 1}/${contacts.length}`);
    }

    if (!contact.caseNumber) {
      removed.push({ ...contact, _removeReason: "Missing case number" });
      continue;
    }

    try {
      const result = await processClient(contact, domain);

      if (result.status === "removed") {
        removed.push({ ...contact, _removeReason: result.reason });
      } else if (result.status === "flagged") {
        flagged.push({ ...contact, reviewMessages: result.reviewMessages });
      } else {
        clean.push(contact);
      }
    } catch (err) {
      console.error(
        `[ListCleaner] Error ${contact.caseNumber}: ${err.message}`
      );
      clean.push(contact);
    }
  }

  console.log(
    `[ListCleaner] Done: ${clean.length} clean, ${flagged.length} flagged, ${removed.length} removed`
  );

  return {
    flagged,
    clean,
    removed,
    meta: {
      total: contacts.length,
      clean: clean.length,
      flagged: flagged.length,
      removed: removed.length,
      domain,
    },
  };
}

module.exports = {
  cleanClientList,
};
