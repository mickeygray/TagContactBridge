// utils/deactivateLead.js
// ─────────────────────────────────────────────────────────────
// Unified lead deactivation — the ONLY function that should
// be called when a lead needs to be fully shut down.
//
// Handles all 4 steps:
//   1. Logics CRM → status 173 (DNC)
//   2. LeadCadence → active: false + DNC flags
//   3. PhoneBurner → remove contact
//   4. Returns summary for logging
//
// Called by:
//   - smsService (text "STOP" opt-out + manual DNC button)
//   - phoneBurnerService (calldone DNC)
//   - statusChecker (Logics status changed to non-active)
// ─────────────────────────────────────────────────────────────

const LeadCadence = require("../models/LeadCadence");
const { updateCaseStatus } = require("../services/logicsService");
const { removePbContact } = require("../services/phoneBurnerService");

/**
 * Fully deactivate a lead across all systems.
 *
 * @param {object} opts
 * @param {string} opts.phone        — 10-digit phone
 * @param {string} opts.company      — "WYNN" or "TAG"
 * @param {string} opts.reason       — why: "sms-opt-out", "manual-dnc", "pb-dnc", "logics-inactive", etc.
 * @param {boolean} opts.updateLogics — whether to push status 173 to Logics (skip if Logics triggered this)
 * @param {number}  opts.logicsStatus — status to set (default 173)
 * @param {string}  opts.caseId      — optional, for logging
 * @param {string}  opts.mongoId     — optional, if we already know the Mongo _id
 * @returns {{ ok, logics, mongo, pb }}
 */
async function deactivateLead({
  phone,
  company,
  reason = "unknown",
  updateLogics = true,
  logicsStatus = 173,
  caseId = null,
  mongoId = null,
}) {
  const result = {
    ok: true,
    reason,
    logics: { ok: false, skipped: false },
    mongo: { ok: false, count: 0 },
    pb: { ok: false, skipped: false },
  };

  const label = caseId ? `Case ${caseId}` : phone;
  console.log(`[DEACTIVATE] ── ${label} (${company}) — reason: ${reason} ──`);

  // ── 1. LOGICS → status 173 ────────────────────────────────────────────
  if (updateLogics && phone) {
    try {
      const formattedPhone =
        phone.length === 10
          ? `(${phone.slice(0, 3)})${phone.slice(3, 6)}-${phone.slice(6)}`
          : phone;
      await updateCaseStatus(company, logicsStatus, formattedPhone);
      result.logics.ok = true;
      console.log(`[DEACTIVATE] ✓ Logics → status ${logicsStatus}`);
    } catch (err) {
      console.error(`[DEACTIVATE] ✗ Logics update failed: ${err.message}`);
    }
  } else {
    result.logics.skipped = true;
    console.log(
      `[DEACTIVATE] ○ Logics skipped (${!updateLogics ? "caller handled" : "no phone"})`,
    );
  }

  // ── 2. MONGO → deactivate + DNC flags ─────────────────────────────────
  try {
    const query = mongoId
      ? { _id: mongoId }
      : { phone: phone.replace(/\D/g, ""), company };

    const mongoUpdate = {
      $set: {
        active: false,
        smsDnc: true,
        smsDncReason: reason === "sms-opt-out" ? "opted-out" : "invalid-phone",
        rvmDnc: true,
        rvmDncReason: "permanent-fail",
        dncUpdatedAt: new Date(),
        deactivatedAt: new Date(),
        deactivatedReason: reason,
      },
    };

    const mongoResult = await LeadCadence.updateMany(query, mongoUpdate);
    result.mongo.ok = true;
    result.mongo.count = mongoResult.modifiedCount;
    console.log(
      `[DEACTIVATE] ✓ Mongo: ${mongoResult.modifiedCount} record(s) deactivated`,
    );
  } catch (err) {
    console.error(`[DEACTIVATE] ✗ Mongo deactivate failed: ${err.message}`);
  }

  // ── 3. PHONEBURNER → remove contact ───────────────────────────────────
  try {
    // Find the PB contact ID from Mongo
    const leads = await LeadCadence.find(
      mongoId ? { _id: mongoId } : { phone: phone.replace(/\D/g, ""), company },
      { pbContactId: 1 },
    ).lean();

    let pbRemoved = 0;
    for (const lead of leads) {
      if (lead.pbContactId) {
        const pbResult = await removePbContact(lead.pbContactId);
        if (pbResult.success) pbRemoved++;
      }
    }

    if (leads.length === 0 || !leads.some((l) => l.pbContactId)) {
      result.pb.skipped = true;
      console.log(`[DEACTIVATE] ○ PB skipped (no pbContactId)`);
    } else {
      result.pb.ok = true;
      console.log(`[DEACTIVATE] ✓ PB: ${pbRemoved} contact(s) removed`);
    }
  } catch (err) {
    console.error(`[DEACTIVATE] ✗ PB removal failed: ${err.message}`);
  }

  console.log(
    `[DEACTIVATE] ── Done: ${label} — L:${result.logics.ok || result.logics.skipped ? "✓" : "✗"} M:${result.mongo.ok ? "✓" : "✗"} PB:${result.pb.ok || result.pb.skipped ? "✓" : "✗"} ──`,
  );

  return result;
}

module.exports = { deactivateLead };
