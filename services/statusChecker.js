// services/statusChecker.js
// ─────────────────────────────────────────────────────────────
// Standalone Logics status checker.
// Runs every 15 minutes on its own cron, completely decoupled
// from the cadence engine.
//
// Checks every active lead's status in Logics CRM.
// If status is no longer active (1 or 2):
//   - Deactivates in MongoDB (preserves history)
//   - Sets all DNC flags
//   - Removes from PhoneBurner
//   - Does NOT re-push to Logics (Logics is the source of truth here)
//
// The cadence engine ONLY contacts leads that have been
// status-checked within the last 15 minutes (freshness gate).
//
// Leads are sorted oldest-check-first so stale leads get
// priority. If we can't fit all leads in 15 minutes,
// the ones checked most recently wait until next run.
// ─────────────────────────────────────────────────────────────

const LeadCadence = require("../models/LeadCadence");
const { fetchCaseInfo } = require("./logicsService");
const { deactivateLead } = require("../utils/deactivateLead");

const ACTIVE_STATUSES = [1, 2];
const LEAD_PACING_MS = 150; // 150ms between Logics API calls
const CHECK_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_CHECK_DURATION_MS = 13 * 60 * 1000; // Stop after 13 min to leave buffer

let running = false;

/**
 * Check if a lead has been status-checked recently enough
 * to be eligible for outreach.
 *
 * @param {object} lead — LeadCadence document
 * @returns {boolean}
 */
function isStatusFresh(lead) {
  return true;
  // TODO: Re-enable when ready to gate cadence on freshness:
  // if (!lead.lastLogicsCheckAt) return false;
  // return (
  //   Date.now() - new Date(lead.lastLogicsCheckAt).getTime() < CHECK_WINDOW_MS
  // );
}

/**
 * Check all active leads against Logics CRM.
 * Sorted oldest-check-first so stale leads get priority.
 * Stops after MAX_CHECK_DURATION_MS to stay within the 15-min window.
 *
 * @returns {{ checked, deactivated, failed, skipped, remaining }}
 */
async function runStatusCheck() {
  if (running) {
    console.log("[STATUS-CHECK] ⚠ Previous run still active — skipping");
    return {
      checked: 0,
      deactivated: 0,
      failed: 0,
      skipped: true,
      remaining: 0,
    };
  }

  running = true;
  const startTime = Date.now();
  console.log("[STATUS-CHECK] ══════════════════════════════════════════");
  console.log("[STATUS-CHECK] Starting status check");

  const results = {
    checked: 0,
    deactivated: 0,
    failed: 0,
    skipped: false,
    remaining: 0,
  };

  try {
    // Sort by lastLogicsCheckAt ascending — oldest/never-checked first
    const leads = await LeadCadence.find(
      { active: true },
      {
        caseId: 1,
        company: 1,
        name: 1,
        phone: 1,
        lastLogicsCheckAt: 1,
        pbContactId: 1,
      },
    )
      .sort({ lastLogicsCheckAt: 1 })
      .lean();

    console.log(`[STATUS-CHECK] ${leads.length} active leads to check`);

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];

      // Time guard — stop before we exceed the window
      if (Date.now() - startTime > MAX_CHECK_DURATION_MS) {
        results.remaining = leads.length - i;
        console.log(
          `[STATUS-CHECK] ⏱ Time limit reached after ${results.checked} checks — ${results.remaining} remaining for next run`,
        );
        break;
      }

      const domain = (lead.company || "wynn").toUpperCase();

      try {
        const caseInfo = await fetchCaseInfo(domain, lead.caseId);

        if (!caseInfo.ok) {
          results.failed++;
          continue;
        }

        const status = caseInfo.status;

        // Always update the status and timestamp
        await LeadCadence.updateOne(
          { _id: lead._id },
          { $set: { lastLogicsStatus: status, lastLogicsCheckAt: new Date() } },
        );

        results.checked++;

        if (!ACTIVE_STATUSES.includes(status)) {
          console.log(
            `[STATUS-CHECK] CaseID ${lead.caseId} — Status ${status} → deactivating`,
          );

          // Determine reason from Logics status
          const reason =
            status === 173
              ? "logics-dnc"
              : status === 223
                ? "logics-cadence-exhausted"
                : `logics-status-${status}`;

          // Full deactivation: Mongo + DNC flags + PB removal
          // Do NOT push back to Logics — Logics is the source of truth here
          await deactivateLead({
            phone: lead.phone,
            company: domain,
            reason,
            updateLogics: false, // Logics already has this status
            caseId: lead.caseId,
            mongoId: lead._id.toString(),
          });

          results.deactivated++;
        }
      } catch (err) {
        results.failed++;
        console.error(
          `[STATUS-CHECK] CaseID ${lead.caseId} — Error: ${err.message}`,
        );
      }

      // Pace between API calls
      await new Promise((r) => setTimeout(r, LEAD_PACING_MS));
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(
      `[STATUS-CHECK] Done in ${elapsed}s: ${results.checked} checked, ` +
        `${results.deactivated} deactivated, ${results.failed} failed` +
        (results.remaining
          ? `, ${results.remaining} deferred to next run`
          : ""),
    );
  } catch (err) {
    console.error("[STATUS-CHECK] Fatal error:", err.message);
  } finally {
    running = false;
  }

  console.log("[STATUS-CHECK] ══════════════════════════════════════════");
  return results;
}

/**
 * Get a Set of 10-digit phone numbers currently on an active RC call.
 * Used by cadence engine to skip leads mid-conversation.
 *
 * @param {object} rcPlatform — RingCentral SDK platform instance
 * @returns {Set<string>}
 */
async function getActivePhonesOnCall(rcPlatform) {
  if (!rcPlatform) {
    console.log(
      "[STATUS-CHECK] getActivePhonesOnCall: no rcPlatform yet — returning empty set",
    );
    return new Set();
  }
  try {
    const r = await rcPlatform.get("/restapi/v1.0/account/~/active-calls", {
      view: "Simple",
      perPage: 100,
    });
    const data = await r.json();
    const phones = new Set();
    for (const record of data.records || []) {
      const num = to10(record.to?.phoneNumber || "");
      if (num) phones.add(num);
    }
    console.log(
      `[STATUS-CHECK] getActivePhonesOnCall: ${phones.size} active call(s) found`,
    );
    return phones;
  } catch (err) {
    console.error("[STATUS-CHECK] getActivePhonesOnCall error:", err.message);
    return new Set();
  }
}

/**
 * Normalize any phone format to a 10-digit string.
 * @param {string} phone
 * @returns {string}
 */
function to10(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length === 10) return digits;
  return "";
}

module.exports = {
  runStatusCheck,
  isStatusFresh,
  getActivePhonesOnCall,
  to10,
  ACTIVE_STATUSES,
  CHECK_WINDOW_MS,
};
