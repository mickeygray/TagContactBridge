// scripts/pbBackfill.js
// ─────────────────────────────────────────────────────────────
// ONE-TIME MIGRATION: Reads all active leads from Mongo,
// calculates business day age, and pushes each into the
// correct PB folder:
//
//   Day 0        → HOT
//   Day 1        → DAY1
//   Day 2        → DAY2
//   Day 3-10     → DAY3_10
//   Day 10+      → DAY10_PLUS
//
// USAGE:
//   1. Clear out your PB folders manually (or leave them — duplicates update)
//   2. Run:  node scripts/pbBackfill.js
//   3. Watch the output, then start using morningRotation as normal
//
// FLAGS:
//   --dry-run     Show what would happen without pushing to PB
//   --company=TAG Only backfill a specific company (default: all)
//   --limit=50    Only process N leads (for testing)
// ─────────────────────────────────────────────────────────────

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const LeadCadence = require("../models/LeadCadence");
const {
  pushContact,
  getFolderForAge,
  businessDaysSince,
  SEATS,
} = require("../services/phoneBurnerService");

// ─── Parse CLI flags ─────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const companyFlag = args.find((a) => a.startsWith("--company="));
const limitFlag = args.find((a) => a.startsWith("--limit="));
const COMPANY_FILTER = companyFlag
  ? companyFlag.split("=")[1].toUpperCase()
  : null;
const LIMIT = limitFlag ? parseInt(limitFlag.split("=")[1]) : 0;

// ─── Main ────────────────────────────────────────────────────

async function main() {
  await connectDB();

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  PB BACKFILL — Age-Based Folder Migration");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Mode:      ${DRY_RUN ? "DRY RUN (no PB calls)" : "LIVE"}`);
  console.log(`  Company:   ${COMPANY_FILTER || "ALL"}`);
  console.log(`  Limit:     ${LIMIT || "none"}`);
  console.log("");

  // Verify folders are configured
  const folders = ["HOT", "DAY1", "DAY2", "DAY3_10", "DAY10_PLUS"];
  const missing = folders.filter((f) => !SEATS[f]?.folderId);
  if (missing.length && !DRY_RUN) {
    console.error(`✗ Missing folder IDs in .env: ${missing.join(", ")}`);
    console.error("  Set these env vars before running live:");
    missing.forEach((f) => console.error(`    PB_${f}_FOLDER_ID=`));
    process.exit(1);
  }

  // Query active leads
  const query = { active: true };
  if (COMPANY_FILTER) query.company = COMPANY_FILTER;

  let leads = await LeadCadence.find(query).sort({ createdAt: 1 }).lean();

  if (LIMIT > 0) leads = leads.slice(0, LIMIT);

  console.log(`Found ${leads.length} active leads to process\n`);

  // Tally by folder
  const tally = { HOT: 0, DAY1: 0, DAY2: 0, DAY3_10: 0, DAY10_PLUS: 0 };
  const stats = { pushed: 0, failed: 0, skipped: 0 };

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const age = businessDaysSince(lead.createdAt);
    const folder = getFolderForAge(lead.createdAt);
    tally[folder]++;

    const prefix = `[${i + 1}/${leads.length}]`;
    const label = `Case:${lead.caseId} ${(lead.name || "").padEnd(25)} Age:${age}d → ${folder}`;

    if (DRY_RUN) {
      console.log(`${prefix} ${label} (dry run)`);
      stats.pushed++;
      continue;
    }

    // Skip if no phone
    if (!lead.phone) {
      console.log(`${prefix} ${label} — SKIP (no phone)`);
      stats.skipped++;
      continue;
    }

    try {
      const result = await pushContact(
        {
          name: lead.name || "",
          phone: lead.phone,
          email: lead.email,
          caseId: lead.caseId,
          company: lead.company || "WYNN",
          source: lead.source,
          mongoId: lead._id.toString(),
          city: lead.city,
          state: lead.state,
        },
        folder,
      );

      if (result.success) {
        // Update Mongo tracking
        await LeadCadence.updateOne(
          { _id: lead._id },
          {
            $set: {
              pbPushed: true,
              pbPushedAt: new Date(),
              pbContactId: result.contactId || null,
              pbCurrentFolder: folder,
            },
          },
        );
        console.log(`${prefix} ✓ ${label} → PB:${result.contactId || "?"}`);
        stats.pushed++;
      } else {
        console.log(`${prefix} ✗ ${label} — ${result.error}`);
        stats.failed++;
      }
    } catch (err) {
      console.log(`${prefix} ✗ ${label} — ${err.message}`);
      stats.failed++;
    }

    // Rate limit: 200ms between PB API calls
    await new Promise((r) => setTimeout(r, 200));
  }

  // Summary
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  BACKFILL COMPLETE");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Total:    ${leads.length}`);
  console.log(`  Pushed:   ${stats.pushed}`);
  console.log(`  Failed:   ${stats.failed}`);
  console.log(`  Skipped:  ${stats.skipped}`);
  console.log("");
  console.log("  Folder breakdown:");
  console.log(`    HOT (Day 0):    ${tally.HOT}`);
  console.log(`    DAY1:           ${tally.DAY1}`);
  console.log(`    DAY2:           ${tally.DAY2}`);
  console.log(`    DAY3_10:        ${tally.DAY3_10}`);
  console.log(`    DAY10_PLUS:     ${tally.DAY10_PLUS}`);
  console.log("═══════════════════════════════════════════════════════════");

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
