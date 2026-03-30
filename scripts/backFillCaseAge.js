// scripts/backfillCaseAge.js
// ─────────────────────────────────────────────────────────────
// One-time migration: set caseAge on all existing leads.
//
// Run ONCE after deploying the caseAge changes:
//   node scripts/backfillCaseAge.js
//
// Safe to re-run (skips leads that already have caseAge set).
// ─────────────────────────────────────────────────────────────

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const LeadCadence = require("../models/LeadCadence");

const BUSINESS_TZ = "America/Los_Angeles";

function getTodayPT() {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: BUSINESS_TZ }),
  );
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function businessDaysSince(dateStr) {
  if (!dateStr) return 0;
  const created = new Date(dateStr);
  const now = new Date();
  let current = new Date(
    created.getFullYear(),
    created.getMonth(),
    created.getDate(),
  );
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const createdDay = current.getDay();
  if (createdDay === 0) current.setDate(current.getDate() + 1);
  if (createdDay === 6) current.setDate(current.getDate() + 2);

  let days = 0;
  while (current < today) {
    current.setDate(current.getDate() + 1);
    if (current.getDay() !== 0 && current.getDay() !== 6) days++;
  }
  return days;
}

async function backfill() {
  await connectDB();

  const todayStr = getTodayPT();

  // Find leads without caseAge (or caseAge = null/undefined)
  const leads = await LeadCadence.find({
    $or: [{ caseAge: { $exists: false } }, { caseAge: null }],
  }).lean();

  console.log(`Found ${leads.length} leads without caseAge`);

  let updated = 0;
  let errors = 0;

  for (const lead of leads) {
    try {
      const age = businessDaysSince(lead.createdAt);

      await LeadCadence.updateOne(
        { _id: lead._id },
        {
          $set: {
            caseAge: age,
            caseAgeUpdatedDate: todayStr,
          },
        },
      );

      console.log(
        `  ${lead.caseId} (${lead.company}) — created ${lead.createdAt?.toISOString?.()?.slice(0, 10) || "?"} → caseAge ${age}`,
      );
      updated++;
    } catch (err) {
      console.error(`  ${lead.caseId} — ERROR: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nBackfill complete: ${updated} updated, ${errors} errors`);

  // Also fix any leads where welcomeEmailSent=true but emailsSent=0
  const emailFix = await LeadCadence.updateMany(
    { welcomeEmailSent: true, emailsSent: 0 },
    { $set: { emailsSent: 1 } },
  );
  console.log(
    `Email counter fix: ${emailFix.modifiedCount} leads had welcomeEmailSent=true but emailsSent=0`,
  );

  await mongoose.disconnect();
  console.log("Done.");
}

backfill().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
