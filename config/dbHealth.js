// config/dbHealth.js
// ─────────────────────────────────────────────────────────────
// Database health checks — runs automatically on server boot.
// Each migration checks if it's already been applied before
// doing anything. Safe to run on every restart.
//
// Two categories of work:
//   1. One-time migrations (index fixes, backfills) — run once then skip
//   2. Boot-time hygiene (fast Mongo-only cleanup, no API calls) — runs every boot
// ─────────────────────────────────────────────────────────────

const mongoose = require("mongoose");

// Cadence exhaustion thresholds
const MAX_TEXTS = 5;
const MAX_EMAILS = 5;
const MAX_RVMS = 4;
const MAX_AGE_DAYS = 60;

async function runDbHealthChecks() {
  console.log("[DB-HEALTH] Checking for pending migrations...");

  const db = mongoose.connection.db;
  if (!db) {
    console.error("[DB-HEALTH] ✗ No database connection — skipping");
    return;
  }

  const collection = db.collection("leadcadences");

  try {
    // ─────────────────────────────────────────────────────────
    // ONE-TIME MIGRATIONS
    // ─────────────────────────────────────────────────────────

    // ── Migration 1: Add company field to existing leads ─────
    const noCompany = await collection.countDocuments({
      $or: [{ company: { $exists: false } }, { company: null }],
    });
    if (noCompany > 0) {
      console.log(
        `[DB-HEALTH] Backfilling company='WYNN' on ${noCompany} leads...`,
      );
      await collection.updateMany(
        { $or: [{ company: { $exists: false } }, { company: null }] },
        { $set: { company: "WYNN" } },
      );
      console.log("[DB-HEALTH] ✓ Company field backfilled");
    }

    // ── Migration 1b: Seed lastLogicsCheckAt on leads missing it ─
    // Only seeds leads that have never been checked — the status
    // cron is responsible for keeping timestamps fresh after that.
    const noCheckDate = await collection.countDocuments({
      active: true,
      $or: [
        { lastLogicsCheckAt: { $exists: false } },
        { lastLogicsCheckAt: null },
      ],
    });
    if (noCheckDate > 0) {
      console.log(
        `[DB-HEALTH] Seeding lastLogicsCheckAt on ${noCheckDate} active leads...`,
      );
      await collection.updateMany(
        {
          active: true,
          $or: [
            { lastLogicsCheckAt: { $exists: false } },
            { lastLogicsCheckAt: null },
          ],
        },
        { $set: { lastLogicsCheckAt: new Date() } },
      );
      console.log("[DB-HEALTH] ✓ lastLogicsCheckAt seeded");
    }

    // ── Migration 2: Fix caseId unique index → compound ──────
    const indexes = await collection.indexes();
    const oldIndex = indexes.find(
      (idx) =>
        idx.key?.caseId === 1 &&
        !idx.key?.company &&
        idx.unique === true &&
        Object.keys(idx.key).length === 1,
    );
    if (oldIndex) {
      console.log(
        `[DB-HEALTH] Dropping old caseId-only unique index: ${oldIndex.name}`,
      );
      await collection.dropIndex(oldIndex.name);
      console.log("[DB-HEALTH] ✓ Old index dropped");
    }
    const compoundExists = indexes.find(
      (idx) =>
        idx.key?.caseId === 1 && idx.key?.company === 1 && idx.unique === true,
    );
    if (!compoundExists) {
      console.log("[DB-HEALTH] Creating compound index { caseId, company }...");
      await collection.createIndex(
        { caseId: 1, company: 1 },
        { unique: true, name: "caseId_company_unique" },
      );
      console.log("[DB-HEALTH] ✓ Compound unique index created");
    }

    // ── Migration 3: Delete ghost CaseID 0 record ────────────
    const ghostCount = await collection.countDocuments({ caseId: "0" });
    if (ghostCount > 0) {
      await collection.deleteMany({ caseId: "0" });
      console.log(
        `[DB-HEALTH] ✓ Deleted ${ghostCount} ghost record(s) with caseId "0"`,
      );
    }

    // ─────────────────────────────────────────────────────────
    // BOOT-TIME HYGIENE
    // Fast Mongo-only checks — no API calls.
    // All idempotent, safe to run on every restart.
    // ─────────────────────────────────────────────────────────
    console.log("[DB-HEALTH] Running boot-time hygiene checks...");

    // ── Hygiene 1: Release expired pauseOutreachUntil ────────
    // Leads paused by the connection checker whose pause date has
    // already passed — they're silently blocked without this.
    const expiredPause = await collection.countDocuments({
      active: true,
      pauseOutreachUntil: { $lt: new Date() },
    });
    if (expiredPause > 0) {
      await collection.updateMany(
        { active: true, pauseOutreachUntil: { $lt: new Date() } },
        { $set: { pauseOutreachUntil: null } },
      );
      console.log(`[DB-HEALTH] ✓ Released ${expiredPause} expired pause(s)`);
    }

    // ── Hygiene 2: Clear nextOutreachType on inactive leads ──
    // Inactive leads with stale routing state — clean up so
    // if they're ever reactivated they start fresh.
    const staleRouting = await collection.countDocuments({
      active: false,
      nextOutreachType: { $ne: null },
    });
    if (staleRouting > 0) {
      await collection.updateMany(
        { active: false, nextOutreachType: { $ne: null } },
        { $set: { nextOutreachType: null } },
      );
      console.log(
        `[DB-HEALTH] ✓ Cleared nextOutreachType on ${staleRouting} inactive lead(s)`,
      );
    }

    // ── Hygiene 3: Clear nextOutreachType on connected leads ─
    // day0Connected leads should never have outreach routing set.
    const connectedRouting = await collection.countDocuments({
      day0Connected: true,
      nextOutreachType: { $ne: null },
    });
    if (connectedRouting > 0) {
      await collection.updateMany(
        { day0Connected: true, nextOutreachType: { $ne: null } },
        { $set: { nextOutreachType: null } },
      );
      console.log(
        `[DB-HEALTH] ✓ Cleared nextOutreachType on ${connectedRouting} connected lead(s)`,
      );
    }

    // ── Hygiene 4: Deactivate leads with no phone number ─────
    // These will never reach anyone and just burn tick cycles.
    const noPhone = await collection.countDocuments({
      active: true,
      $or: [{ phone: { $exists: false } }, { phone: null }, { phone: "" }],
    });
    if (noPhone > 0) {
      await collection.updateMany(
        {
          active: true,
          $or: [{ phone: { $exists: false } }, { phone: null }, { phone: "" }],
        },
        { $set: { active: false } },
      );
      console.log(
        `[DB-HEALTH] ✓ Deactivated ${noPhone} lead(s) with no phone number`,
      );
    }

    // ── Hygiene 5: Deactivate fully exhausted leads ──────────
    // Leads that have hit all outreach maximums — nothing left
    // to send them. Deactivate so they exit the cadence cleanly.
    // Note: does NOT update Logics status — that's for the daily cron.
    const exhausted = await collection.countDocuments({
      active: true,
      textsSent: { $gte: MAX_TEXTS },
      emailsSent: { $gte: MAX_EMAILS },
      rvmsSent: { $gte: MAX_RVMS },
    });
    if (exhausted > 0) {
      await collection.updateMany(
        {
          active: true,
          textsSent: { $gte: MAX_TEXTS },
          emailsSent: { $gte: MAX_EMAILS },
          rvmsSent: { $gte: MAX_RVMS },
        },
        { $set: { active: false, nextOutreachType: null } },
      );
      console.log(
        `[DB-HEALTH] ✓ Deactivated ${exhausted} fully exhausted lead(s)`,
      );
    }

    // ── Hygiene 6: Deactivate leads over 30 days old ─────────
    // Regardless of outreach counts — if a lead has been in the
    // system for 30+ days without converting, stop contacting them.
    // Logics status update happens in the daily cron.
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);
    const aged = await collection.countDocuments({
      active: true,
      createdAt: { $lt: cutoff },
    });
    if (aged > 0) {
      await collection.updateMany(
        { active: true, createdAt: { $lt: cutoff } },
        { $set: { active: false, nextOutreachType: null } },
      );
      console.log(
        `[DB-HEALTH] ✓ Deactivated ${aged} lead(s) over ${MAX_AGE_DAYS} days old`,
      );
    }

    // ── Hygiene 7: Reset nextOutreachType=call → rvm ─────────
    // Dialing is paused — any lead waiting for a call will never
    // advance. Reset to rvm so the cadence keeps moving.
    // REMOVE THIS CHECK when dialing is re-enabled.
    const waitingForCall = await collection.countDocuments({
      active: true,
      nextOutreachType: "call",
    });
    if (waitingForCall > 0) {
      await collection.updateMany(
        { active: true, nextOutreachType: "call" },
        { $set: { nextOutreachType: "rvm" } },
      );
      console.log(
        `[DB-HEALTH] ✓ Reset ${waitingForCall} lead(s) nextOutreachType: call → rvm (dialing paused)`,
      );
    }

    console.log("[DB-HEALTH] ✓ All health checks complete");
  } catch (err) {
    console.error("[DB-HEALTH] ✗ Error:", err.message);
    // Non-fatal — server continues even if health check fails
  }
}

module.exports = { runDbHealthChecks };
