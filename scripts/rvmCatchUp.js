// scripts/rvmCatchup.js
// ─────────────────────────────────────────────────────────────
// Send 2 RVMs to every active lead, 10 minutes apart.
//
// USAGE:
//   node scripts/rvmCatchup.js              Run it
//   node scripts/rvmCatchup.js --dry-run    Preview only
//   node scripts/rvmCatchup.js --limit=20   Test with N leads
// ─────────────────────────────────────────────────────────────

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const LeadCadence = require("../models/LeadCadence");
const { dropVoicemail } = require("../services/dropRvmService");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitFlag = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitFlag ? parseInt(limitFlag.split("=")[1]) : 0;

async function sendRound(leads, roundNum, stats) {
  console.log(
    `\n── Round ${roundNum} ──────────────────────────────────────────`,
  );

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const rvmNum = (lead.rvmsSent || 0) + 1;
    const prefix = `[${i + 1}/${leads.length}]`;
    const label = `Case:${lead.caseId} ${(lead.name || "").padEnd(20)} RVM#${rvmNum}`;

    if (DRY_RUN) {
      console.log(`${prefix} WOULD send ${label}`);
      stats.sent++;
      continue;
    }

    try {
      const result = await dropVoicemail({
        phone: lead.phone,
        caseId: lead.caseId,
        name: lead.name,
        source: `catchup-r${roundNum}`,
        rvmNum,
        company: lead.company || "WYNN",
      });

      if (result.ok) {
        const update = {
          $inc: { rvmsSent: 1 },
          $set: { lastRvmAt: new Date() },
        };
        if (result.activityToken) {
          update.$set.lastRvmActivityToken = result.activityToken;
        }
        await LeadCadence.updateOne({ _id: lead._id }, update);
        console.log(`${prefix} ✓ ${label}`);
        stats.sent++;
      } else if (result.permanent) {
        console.log(`${prefix} ✗ ${label} — PERMANENT: ${result.error}`);
        await LeadCadence.updateOne(
          { _id: lead._id },
          {
            $inc: { rvmsSent: 1 },
            $set: {
              lastRvmAt: new Date(),
              rvmDnc: true,
              rvmDncReason: "permanent-fail",
              dncUpdatedAt: new Date(),
            },
          },
        );
        stats.dnc++;
      } else {
        console.log(`${prefix} ✗ ${label} — ${result.error}`);
        stats.failed++;
      }
    } catch (err) {
      console.log(`${prefix} ✗ ${label} — ${err.message}`);
      stats.failed++;
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`  Round ${roundNum}: ${stats.sent} sent`);
}

async function main() {
  await connectDB();

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  RVM Catch-Up — 2 drops, 10 min apart");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);

  let leads = await LeadCadence.find({
    active: true,
    rvmDnc: { $ne: true },
    phone: { $exists: true, $nin: [null, ""] },
  })
    .sort({ createdAt: 1 })
    .lean();

  if (LIMIT > 0) leads = leads.slice(0, LIMIT);

  console.log(`  Leads: ${leads.length}`);
  console.log("");

  if (!leads.length) {
    console.log("  Nothing to send!");
    await mongoose.disconnect();
    process.exit(0);
  }

  // Round 1
  const stats1 = { sent: 0, failed: 0, dnc: 0 };
  await sendRound(leads, 1, stats1);

  // Wait 10 minutes
  if (!DRY_RUN && stats1.sent > 0) {
    console.log("\n  Waiting 10 minutes before Round 2...");
    await new Promise((r) => setTimeout(r, 10 * 60 * 1000));
  }

  // Re-query for round 2 (picks up updated rvmsSent, filters out new DNC)
  const round2Leads = DRY_RUN
    ? leads
    : await LeadCadence.find({
        _id: { $in: leads.map((l) => l._id) },
        active: true,
        rvmDnc: { $ne: true },
      }).lean();

  const stats2 = { sent: 0, failed: 0, dnc: 0 };
  await sendRound(round2Leads, 2, stats2);

  // Summary
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  CATCH-UP COMPLETE");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(
    `  Round 1:  ${stats1.sent} sent, ${stats1.failed} failed, ${stats1.dnc} DNC`,
  );
  console.log(
    `  Round 2:  ${stats2.sent} sent, ${stats2.failed} failed, ${stats2.dnc} DNC`,
  );
  console.log(`  Total:    ${stats1.sent + stats2.sent} RVMs dropped`);
  console.log("═══════════════════════════════════════════════════════════");

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
