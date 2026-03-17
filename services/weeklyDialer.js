// services/weeklyDialer.js
// ─────────────────────────────────────────────────────────────
// Weekly RingOut dialer for older/exhausted leads.
//
// Runs Wednesday and Friday at noon PT.
// Targets:
//   1. Leads with Logics status 223 (Automatic Contact Ended)
//   2. Active leads that are 10+ business days old
//
// Uses RingCentral RingOut (not CallFire) with rate limiting.
// Paces at 1 call per 7 seconds to stay under RC Heavy limit.
//
// Does NOT re-activate exhausted leads — just dials them.
// If they answer or call back, the connectionChecker picks
// it up on the next cadence tick.
// ─────────────────────────────────────────────────────────────

const LeadCadence = require("../models/LeadCadence");
const { businessDaysSinceCreation } = require("./cadenceEngine");
const { updateCaseStatus } = require("./logicsService");

const WEEKLY_DIAL_MIN_AGE_DAYS = 10;
const WEEKLY_DIAL_PACE_MS = 7000; // 7s between calls (RC Heavy limit)
const WEEKLY_MAX_CALLS = 100; // Safety cap per session

// Logics status codes
const STATUS_AUTO_CONTACT_ENDED = 223;
const STATUS_BAD_INACTIVE = 57;
const BAD_INACTIVE_AGE_DAYS = 30;

/**
 * Run the weekly dialer.
 * Called by cron on Wed/Fri at noon PT.
 *
 * @param {Function} dialFn — dialLeadNow({ phone, name }) from webhook.js
 * @returns {{ total, dialed, skipped, failed, rateLimited }}
 */
async function runWeeklyDial(dialFn) {
  console.log("[WEEKLY-DIAL] ══════════════════════════════════════════");
  console.log("[WEEKLY-DIAL] Starting weekly RingOut session");

  const results = {
    total: 0,
    dialed: 0,
    skipped: 0,
    failed: 0,
    rateLimited: false,
  };

  try {
    // ── Gather leads ──────────────────────────────────────────
    // 1. Exhausted leads (status 223, now inactive but still in DB)
    const exhaustedLeads = await LeadCadence.find({
      active: false,
      lastLogicsStatus: 223,
      phoneConnected: true,
      day0Connected: { $ne: true },
    }).lean();

    // 2. Active leads that are 10+ business days old
    const activeLeads = await LeadCadence.find({
      active: true,
      phoneConnected: true,
      day0Connected: { $ne: true },
    }).lean();

    const agedLeads = activeLeads.filter(
      (lead) =>
        businessDaysSinceCreation(lead.createdAt) >= WEEKLY_DIAL_MIN_AGE_DAYS,
    );

    // Combine and dedupe by phone
    const phonesSeen = new Set();
    const allLeads = [];

    for (const lead of [...exhaustedLeads, ...agedLeads]) {
      const phone = (lead.phone || "").replace(/\D/g, "");
      if (phone.length >= 10 && !phonesSeen.has(phone)) {
        phonesSeen.add(phone);
        allLeads.push(lead);
      }
    }

    results.total = allLeads.length;

    console.log(`[WEEKLY-DIAL] Exhausted (223): ${exhaustedLeads.length}`);
    console.log(
      `[WEEKLY-DIAL] Aged (${WEEKLY_DIAL_MIN_AGE_DAYS}+ days): ${agedLeads.length}`,
    );
    console.log(`[WEEKLY-DIAL] Total (deduped): ${allLeads.length}`);

    // ── Status transitions BEFORE dialing ─────────────────────

    // 1. Aged leads not yet 223 → move to 223 (Automatic Contact Ended)
    for (const lead of agedLeads) {
      if (lead.lastLogicsStatus !== STATUS_AUTO_CONTACT_ENDED && lead.active) {
        try {
          await updateCaseStatus(
            (lead.company || "wynn").toUpperCase(),
            STATUS_AUTO_CONTACT_ENDED,
            lead.phone,
          );
          await LeadCadence.updateOne(
            { _id: lead._id },
            {
              $set: {
                active: false,
                lastLogicsStatus: STATUS_AUTO_CONTACT_ENDED,
              },
            },
          );
          console.log(
            `[WEEKLY-DIAL] CaseID ${lead.caseId} — Moved to status ${STATUS_AUTO_CONTACT_ENDED} (${businessDaysSinceCreation(lead.createdAt)} biz days old)`,
          );
          results.statusChanges = (results.statusChanges || 0) + 1;
        } catch (err) {
          console.error(
            `[WEEKLY-DIAL] CaseID ${lead.caseId} — Status update failed: ${err.message}`,
          );
        }
      }
    }

    // 2. 30+ day leads → move to 57 (BAD/INACTIVE)
    // UNCOMMENT WHEN READY TO ENABLE:
    /*
    for (const lead of allLeads) {
      const ageDays = businessDaysSinceCreation(lead.createdAt);
      if (ageDays >= BAD_INACTIVE_AGE_DAYS && lead.lastLogicsStatus !== STATUS_BAD_INACTIVE) {
        try {
          await updateCaseStatus((lead.company || "wynn").toUpperCase(), STATUS_BAD_INACTIVE, lead.phone);
          await LeadCadence.updateOne(
            { _id: lead._id },
            { $set: { active: false, lastLogicsStatus: STATUS_BAD_INACTIVE } }
          );
          console.log(
            `[WEEKLY-DIAL] CaseID ${lead.caseId} — Moved to status ${STATUS_BAD_INACTIVE} BAD/INACTIVE (${ageDays} biz days old)`
          );
          // Remove from allLeads so we don't dial them
          lead._skipDial = true;
        } catch (err) {
          console.error(`[WEEKLY-DIAL] CaseID ${lead.caseId} — BAD/INACTIVE update failed: ${err.message}`);
        }
      }
    }
    */

    if (allLeads.length === 0) {
      console.log("[WEEKLY-DIAL] No leads to dial");
      console.log("[WEEKLY-DIAL] ══════════════════════════════════════════");
      return results;
    }

    // ── Dial each lead with pacing ────────────────────────────
    for (let i = 0; i < allLeads.length && i < WEEKLY_MAX_CALLS; i++) {
      const lead = allLeads[i];

      try {
        // Skip leads marked for BAD/INACTIVE (when that code is enabled)
        if (lead._skipDial) {
          results.skipped++;
          continue;
        }

        console.log(
          `[WEEKLY-DIAL] [${i + 1}/${Math.min(allLeads.length, WEEKLY_MAX_CALLS)}] ` +
            `CaseID ${lead.caseId} — ${lead.name || "Unknown"} — ${lead.phone}`,
        );

        const dialResult = await dialFn({ phone: lead.phone, name: lead.name });

        if (dialResult.rateLimited || dialResult.statusCode === 429) {
          console.log("[WEEKLY-DIAL] ⚠ Rate limited — stopping session");
          results.rateLimited = true;
          break;
        }

        if (dialResult.ok) {
          results.dialed++;

          // Update the lead record with the weekly dial
          await LeadCadence.updateOne(
            { _id: lead._id },
            {
              $inc: { callsMade: 1 },
              $set: { lastCalledAt: new Date(), lastCallResult: "unknown" },
            },
          );
        } else if (dialResult.skipped) {
          results.skipped++;
        } else {
          results.failed++;
          console.warn(
            `[WEEKLY-DIAL] CaseID ${lead.caseId} — Failed: ${dialResult.error}`,
          );
        }

        // Pace between calls
        if (i < allLeads.length - 1) {
          await new Promise((r) => setTimeout(r, WEEKLY_DIAL_PACE_MS));
        }
      } catch (err) {
        results.failed++;
        console.error(
          `[WEEKLY-DIAL] CaseID ${lead.caseId} — Error: ${err.message}`,
        );
      }
    }

    console.log(
      `[WEEKLY-DIAL] Done: ${results.dialed} dialed, ` +
        `${results.skipped} skipped, ${results.failed} failed` +
        (results.rateLimited ? " (stopped: rate limited)" : ""),
    );
  } catch (err) {
    console.error("[WEEKLY-DIAL] ✗ Fatal error:", err.message);
  }

  console.log("[WEEKLY-DIAL] ══════════════════════════════════════════");
  return results;
}

module.exports = {
  runWeeklyDial,
  WEEKLY_DIAL_MIN_AGE_DAYS,
  WEEKLY_MAX_CALLS,
};
