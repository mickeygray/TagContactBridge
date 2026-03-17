// scripts/phoneValidationBackfill.js
// ─────────────────────────────────────────────────────────────
// ONE-TIME: Re-validate phone numbers for all active leads
// and update DNC flags, phoneIsCell, phoneCanText, etc.
//
// USAGE:
//   node scripts/phoneValidationBackfill.js              Run all
//   node scripts/phoneValidationBackfill.js --dry-run    Preview only
//   node scripts/phoneValidationBackfill.js --missing    Only leads with no validation data
//   node scripts/phoneValidationBackfill.js --limit=50   Process N leads
//   node scripts/phoneValidationBackfill.js --company=TAG Only one brand
// ─────────────────────────────────────────────────────────────

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const LeadCadence = require("../models/LeadCadence");
const { validateLead } = require("../services/validationService");

// ─── Parse CLI flags ─────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const MISSING_ONLY = args.includes("--missing");
const companyFlag = args.find((a) => a.startsWith("--company="));
const limitFlag = args.find((a) => a.startsWith("--limit="));
const COMPANY_FILTER = companyFlag
  ? companyFlag.split("=")[1].toUpperCase()
  : null;
const LIMIT = limitFlag ? parseInt(limitFlag.split("=")[1]) : 0;

// Pace: 200ms between API calls to avoid rate limits
const PACE_MS = 200;

// ─── Main ────────────────────────────────────────────────────

async function main() {
  await connectDB();

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Phone Validation Backfill");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Mode:       ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(
    `  Scope:      ${MISSING_ONLY ? "Missing validation only" : "All active leads"}`,
  );
  console.log(`  Company:    ${COMPANY_FILTER || "ALL"}`);
  console.log(`  Limit:      ${LIMIT || "none"}`);
  console.log("");

  // Build query
  const query = { active: true };
  if (COMPANY_FILTER) query.company = COMPANY_FILTER;
  if (MISSING_ONLY) {
    query.$or = [
      { phoneIsCell: { $exists: false } },
      { phoneIsCell: null },
      { "validationDetails.phoneStatus": { $exists: false } },
    ];
  }

  // Must have a phone to validate
  query.phone = { $exists: true, $nin: [null, ""] };

  let leads = await LeadCadence.find(query).sort({ createdAt: -1 }).lean();

  if (LIMIT > 0) leads = leads.slice(0, LIMIT);

  console.log(`  Found ${leads.length} leads to validate\n`);

  if (!leads.length) {
    console.log("  Nothing to do!");
    await mongoose.disconnect();
    process.exit(0);
  }

  const stats = {
    validated: 0,
    failed: 0,
    skipped: 0,
    updated: 0,
    smsDncSet: 0,
    rvmDncSet: 0,
    cellphones: 0,
    landlines: 0,
    invalid: 0,
  };

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const prefix = `[${i + 1}/${leads.length}]`;
    const label = `Case:${lead.caseId} ${(lead.name || "").padEnd(25)} ${lead.phone}`;

    if (!lead.phone || lead.phone.length < 10) {
      console.log(`${prefix} SKIP ${label} — bad phone`);
      stats.skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`${prefix} WOULD validate ${label}`);
      stats.validated++;
      continue;
    }

    try {
      const validation = await validateLead({
        phone: lead.phone,
        email: lead.email,
      });

      stats.validated++;

      const isCell = validation.phoneIsCell || false;
      const canText = validation.phoneCanText || false;
      const canCall = validation.phoneCanCall || false;
      const phoneValid = validation.phoneValid || false;
      const onDNC = validation.phone?.onNationalDNC || false;
      const isLitigator = validation.phone?.isLitigator || false;

      if (isCell) stats.cellphones++;
      else if (phoneValid) stats.landlines++;
      else stats.invalid++;

      // Build update
      const update = {
        $set: {
          phoneIsCell: isCell,
          phoneConnected: phoneValid,
          validationDetails: {
            phoneStatus: validation.phone?.status || "unknown",
            phoneCanCall: canCall,
            phoneCanText: canText,
            phoneDNC: onDNC,
            phoneLitigator: isLitigator,
            emailResult: validation.emailResult || "unknown",
            emailFlags: validation.email?.flags || [],
            revalidatedAt: new Date(),
          },
        },
      };

      // Set SMS DNC if not a cell or can't text
      if (!canText || !isCell) {
        const reason = !isCell ? "landline" : "invalid-phone";
        update.$set.smsDnc = true;
        update.$set.smsDncReason = reason;
        update.$set.dncUpdatedAt = new Date();
        stats.smsDncSet++;
      } else if (
        lead.smsDnc &&
        (lead.smsDncReason === "landline" ||
          lead.smsDncReason === "invalid-phone")
      ) {
        // Clear DNC if they were flagged as landline but now validate as cell
        update.$set.smsDnc = false;
        update.$set.smsDncReason = null;
        update.$set.dncUpdatedAt = new Date();
      }

      // Set RVM DNC if on national DNC list
      if (onDNC && !lead.rvmDnc) {
        update.$set.rvmDnc = true;
        update.$set.rvmDncReason = "national-dnc";
        update.$set.dncUpdatedAt = new Date();
        stats.rvmDncSet++;
      }

      // Email validation
      if (validation.emailCanSend !== undefined) {
        update.$set.emailValid = validation.emailCanSend;
      }

      await LeadCadence.updateOne({ _id: lead._id }, update);
      stats.updated++;

      const flags = [
        isCell ? "cell" : "landline",
        canText ? "txt✓" : "txt✗",
        onDNC ? "DNC" : "",
        isLitigator ? "LITIG" : "",
      ]
        .filter(Boolean)
        .join(" ");

      console.log(`${prefix} ✓ ${label} → ${flags}`);
    } catch (err) {
      console.log(`${prefix} ✗ ${label} — ${err.message}`);
      stats.failed++;
    }

    await new Promise((r) => setTimeout(r, PACE_MS));
  }

  // ── Summary ────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  VALIDATION BACKFILL COMPLETE");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Total:       ${leads.length}`);
  console.log(`  Validated:   ${stats.validated}`);
  console.log(`  Updated:     ${stats.updated}`);
  console.log(`  Failed:      ${stats.failed}`);
  console.log(`  Skipped:     ${stats.skipped}`);
  console.log("");
  console.log(`  Cell phones: ${stats.cellphones}`);
  console.log(`  Landlines:   ${stats.landlines}`);
  console.log(`  Invalid:     ${stats.invalid}`);
  console.log(`  SMS DNC set: ${stats.smsDncSet}`);
  console.log(`  RVM DNC set: ${stats.rvmDncSet}`);
  console.log("═══════════════════════════════════════════════════════════");

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
