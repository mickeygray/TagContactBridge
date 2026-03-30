// services/cadenceEngine.js
// ─────────────────────────────────────────────────────────────
// Unified cadence engine — runs every 5 minutes during
// business hours. All outreach gated by `caseAge` (stored
// integer on LeadCadence, NOT derived from createdAt).
//
//   CASE AGE:
//     Starts at 0 on lead creation. Incremented once per
//     business day at the first cadence tick of that day.
//     Single source of truth for all schedule gates.
//
//   TEXT SCHEDULE (5 total):
//     Age 0: 2 texts  (webhook sends #1 at intake, engine sends #2 ~25min later)
//     Age 1: 1 text   (3 cumulative)
//     Age 2: 1 text   (4 cumulative)
//     Age 3-4: skip
//     Age 5: 1 text   (5 cumulative — final)
//
//   RVM SCHEDULE:
//     Age 0: 2 RVMs  (~5min and ~15min after creation)
//     Age 1: 2 more  (4 cumulative, 2hr spacing)
//     Age 2-9: 1/day at noon PT (up to 12 cumulative)
//     Lifetime cap: 15
//
//   EMAIL SCHEDULE:
//     Age 0: welcome email (sent by webhook at intake)
//     Age 1: follow-up #2
//     Age 3, 5, 7, 9: follow-ups #3-6 (every other biz day)
//     After chain: 1/week until exhaustion
//
//   DIALING:
//     Handled entirely by PhoneBurner (not this engine)
//
//   DNC FLAGS:
//     smsDnc / rvmDnc — set at intake or on first failure
//     Checked before every SMS/RVM attempt
//
//   SAFETY:
//     - Min gap between RVMs (10min Day 0, 2hr Day 1+)
//     - Min gap between texts (25min Day 0, once/day Day 1+)
//     - Max 1 text per calendar day (except Day 0 which gets 2)
//     - CallRail budget: 200/hr for cadence (100 reserved for webhook+SMS)
//     - Failed texts stamp lastTextedAt to prevent retry storms
//     - day0Connected = true → stop all outreach
//     - pauseOutreachUntil → skip until date passes
//     - Fresh re-read before every counter increment
// ─────────────────────────────────────────────────────────────

const LeadCadence = require("../models/LeadCadence");
const { updateCaseStatus } = require("./logicsService");
const { checkForConnections } = require("./connectionChecker");
const {
  isStatusFresh,
  getActivePhonesOnCall,
  to10: phoneTo10,
} = require("./statusChecker");

const BUSINESS_TZ = process.env.BUSINESS_TZ || "America/Los_Angeles";
const BUSINESS_START = Number(process.env.BUSINESS_START_HOUR || 8);
const BUSINESS_END = Number(process.env.BUSINESS_END_HOUR || 18);

const ACTIVE_STATUSES = [1, 2];

/* ══════════════════════════════════════════════════════════════
   SCHEDULE TABLES
   ══════════════════════════════════════════════════════════════ */

// Text caps: caseAge → max cumulative texts allowed
// Gaps between entries = skip days (no new text)
//
//   Day 0: 2 texts in first 30min (webhook sends #1, engine sends #2)
//   Day 1: +1  (3 cumulative)
//   Day 2: +1  (4 cumulative)
//   Days 3-4: skip
//   Day 5: +1  (5 cumulative — final)
const TEXT_CAPS = [
  { minAge: 0, maxTotal: 2 }, // Day 0: webhook #1 at intake + engine #2 ~25min later
  { minAge: 1, maxTotal: 3 }, // Day 1: +1
  { minAge: 2, maxTotal: 4 }, // Day 2: +1
  // Days 3-4: no new texts
  { minAge: 5, maxTotal: 5 }, // Day 5: +1 (final)
];
const MAX_TEXTS = 5;
const MIN_TEXT_GAP_MINUTES = 25; // 25min — allows Day 0 text #2 ~30min after intake

// Per-day text allowance: Day 0 gets 2, all other days get 1
function getMaxTextsPerDay(caseAge) {
  return caseAge === 0 ? 2 : 1;
}

function getMaxTexts(caseAge) {
  let max = 0;
  for (const cap of TEXT_CAPS) {
    if (caseAge >= cap.minAge) max = cap.maxTotal;
  }
  return max;
}

/* ── CallRail Rate Limiter ────────────────────────────────────
   CallRail allows 300 API calls/hour. We track usage per hour
   and stop sending texts when approaching the cap. Leave
   headroom for webhook intake texts, SMS Intelligence, etc.
   ──────────────────────────────────────────────────────────── */
const CALLRAIL_HOURLY_CAP = 300;
const CALLRAIL_CADENCE_BUDGET = 200; // reserve 100 for webhook + SMS Intelligence
let callrailHourlyCount = 0;
let callrailHourKey = ""; // "YYYY-MM-DD-HH" — resets when hour changes

function trackCallRailCall() {
  const now = getNowPT();
  const hourKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
  if (hourKey !== callrailHourKey) {
    callrailHourKey = hourKey;
    callrailHourlyCount = 0;
  }
  callrailHourlyCount++;
  return callrailHourlyCount;
}

function canSendCallRail() {
  const now = getNowPT();
  const hourKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
  if (hourKey !== callrailHourKey) return true; // new hour
  return callrailHourlyCount < CALLRAIL_CADENCE_BUDGET;
}

// RVM caps
const MAX_RVMS_LIFETIME = 15;
const RVM_MIN_DELAY_MS = 2000; // 2s between Drop.co API calls
let rvmLastDropTime = 0;

function getMaxRvms(caseAge) {
  if (caseAge <= 0) return 2; // Day 0: 2
  if (caseAge === 1) return 4; // Day 1: 4 total
  if (caseAge <= 9) return 4 + (caseAge - 1); // Day 2=5, Day 3=6, ... Day 9=12
  return MAX_RVMS_LIFETIME; // 15
}

function getMinRvmGapMinutes(caseAge) {
  if (caseAge === 0) return 10; // Day 0: speed-to-lead, 10min gap
  return 120; // Day 1+: 2 hour gap
}

// Email schedule
const MAX_EMAILS_LIFETIME = 10;

function shouldSendEmail(lead) {
  if (!lead.email) return false;
  if (lead.emailValid === false) return false;
  const caseAge = lead.caseAge || 0;
  const sent = lead.emailsSent || 0;

  // Already emailed today
  if (
    lead.lastEmailedAt &&
    isSameCalendarDayPT(lead.lastEmailedAt, new Date())
  ) {
    return false;
  }

  // Email 1 (welcome) handled by webhook — don't re-send
  if (sent === 0) return false;

  // Email 2: Day 1
  if (sent === 1) return caseAge >= 1;

  // Emails 3-6: every other business day starting Day 3
  // sent=2→age 3, sent=3→age 5, sent=4→age 7, sent=5→age 9
  if (sent < 6) {
    const minAge = 1 + (sent - 1) * 2;
    return caseAge >= minAge;
  }

  // Weekly after chain (emails 7+)
  if (sent < MAX_EMAILS_LIFETIME) {
    if (!lead.lastEmailedAt) return true;
    return minutesSince(lead.lastEmailedAt) >= 7 * 24 * 60;
  }

  return false;
}

// Cadence exhaustion
const CADENCE_EXHAUSTED_STATUS = 223;

function isCadenceExhausted(lead) {
  return (
    (lead.textsSent || 0) >= MAX_TEXTS &&
    (lead.rvmsSent || 0) >= MAX_RVMS_LIFETIME &&
    (lead.emailsSent || 0) >= MAX_EMAILS_LIFETIME
  );
}

// Tick overlap protection
let tickRunning = false;

/* ══════════════════════════════════════════════════════════════
   TIME HELPERS
   ══════════════════════════════════════════════════════════════ */

function getNowPT() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: BUSINESS_TZ }),
  );
}

function getTodayDateStr() {
  const now = getNowPT();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getHourPT() {
  return getNowPT().getHours();
}

function isBusinessHours() {
  const now = getNowPT();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  return now.getHours() >= BUSINESS_START && now.getHours() < BUSINESS_END;
}

function minutesSince(date) {
  if (!date) return Infinity;
  return (Date.now() - new Date(date).getTime()) / (1000 * 60);
}

function isSameCalendarDayPT(dateA, dateB) {
  if (!dateA || !dateB) return false;
  const a = new Date(
    new Date(dateA).toLocaleString("en-US", { timeZone: BUSINESS_TZ }),
  );
  const b = new Date(
    new Date(dateB).toLocaleString("en-US", { timeZone: BUSINESS_TZ }),
  );
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/* ══════════════════════════════════════════════════════════════
   CASE AGE INCREMENT
   ══════════════════════════════════════════════════════════════ */

/**
 * Check if this lead's caseAge needs incrementing.
 * Increments once per business day at the first tick of that day.
 * Does NOT increment on the day of creation (stays 0 all of Day 0).
 *
 * Returns the current (possibly updated) caseAge.
 */
async function maybeIncrementAge(lead) {
  const todayStr = getTodayDateStr();
  let caseAge = lead.caseAge || 0;

  // Already updated today — no change
  if (lead.caseAgeUpdatedDate === todayStr) return caseAge;

  // Don't increment if the lead was created today
  if (isSameCalendarDayPT(lead.createdAt, new Date())) {
    // Just stamp today's date so we don't re-check every tick
    await LeadCadence.updateOne(
      { _id: lead._id },
      { $set: { caseAgeUpdatedDate: todayStr } },
    );
    return caseAge;
  }

  // New business day — increment
  caseAge++;
  await LeadCadence.updateOne(
    { _id: lead._id },
    { $set: { caseAge, caseAgeUpdatedDate: todayStr } },
  );

  return caseAge;
}

/* ══════════════════════════════════════════════════════════════
   DNC HELPERS
   ══════════════════════════════════════════════════════════════ */

function classifyRvmDncReason(errorStr) {
  const lower = (errorStr || "").toLowerCase();
  if (lower.includes("dnc")) return "national-dnc";
  if (lower.includes("area code")) return "invalid-area-code";
  return "permanent-fail";
}

function classifySmsDncReason(errorStr) {
  const lower = (errorStr || "").toLowerCase();
  if (lower.includes("opted out")) return "opted-out";
  return "invalid-phone";
}

/* ══════════════════════════════════════════════════════════════
   RVM PACING (Drop.co API)
   ══════════════════════════════════════════════════════════════ */

async function pacedRvmDrop(rvmFn, args) {
  const now = Date.now();
  const timeSinceLast = now - rvmLastDropTime;
  if (timeSinceLast < RVM_MIN_DELAY_MS) {
    await new Promise((r) => setTimeout(r, RVM_MIN_DELAY_MS - timeSinceLast));
  }
  rvmLastDropTime = Date.now();
  return rvmFn(args);
}

/* ══════════════════════════════════════════════════════════════
   RVM SEND LOGIC
   ══════════════════════════════════════════════════════════════ */

/**
 * Attempt to send an RVM for this lead.
 * Returns the action result object (for logging).
 */
async function tryRvm(lead, caseAge, actions) {
  if (!actions.dropRvm) return null;

  const rvmsSent = lead.rvmsSent || 0;
  const maxRvms = getMaxRvms(caseAge);
  if (rvmsSent >= maxRvms) return null;

  // Day 2-9: only fire at noon PT (12:00-12:04 window)
  if (caseAge >= 2 && caseAge <= 9) {
    if (getHourPT() !== 12) return null;
    // Already dropped today
    if (lead.lastRvmAt && isSameCalendarDayPT(lead.lastRvmAt, new Date())) {
      return null;
    }
  }

  // Gap check
  const minGap = getMinRvmGapMinutes(caseAge);
  if (minutesSince(lead.lastRvmAt) < minGap) return null;

  // DNC — count it but don't actually drop
  if (lead.rvmDnc) {
    console.log(
      `[CADENCE] CaseID ${lead.caseId} — RVM skipped (DNC: ${lead.rvmDncReason})`,
    );
    await LeadCadence.updateOne(
      { _id: lead._id },
      { $inc: { rvmsSent: 1 }, $set: { lastRvmAt: new Date() } },
    );
    return { type: "rvm-dnc", reason: lead.rvmDncReason };
  }

  // Fresh re-read to prevent double-fire
  const fresh = await LeadCadence.findById(lead._id, { rvmsSent: 1 }).lean();
  if ((fresh?.rvmsSent || 0) >= maxRvms) return null;

  const rvmNum = Math.min((fresh?.rvmsSent || 0) + 1, 4); // audio file caps at 4
  const rvmTotal = (fresh?.rvmsSent || 0) + 1;
  console.log(
    `[CADENCE] CaseID ${lead.caseId} — Age ${caseAge} RVM #${rvmTotal} (audio: ${rvmNum})`,
  );

  const rvmResult = await pacedRvmDrop(actions.dropRvm, {
    phone: lead.phone,
    caseId: lead.caseId,
    name: lead.name,
    source: `age${caseAge}`,
    rvmNum,
    company: lead.company,
  });

  if (rvmResult.ok) {
    const update = {
      $inc: { rvmsSent: 1 },
      $set: { lastRvmAt: new Date() },
    };
    if (rvmResult.activityToken) {
      update.$set.lastRvmActivityToken = rvmResult.activityToken;
    }
    await LeadCadence.updateOne({ _id: lead._id }, update);
    return { type: "rvm", ok: true, num: rvmTotal };
  }

  if (rvmResult.permanent) {
    const reason = classifyRvmDncReason(rvmResult.error);
    console.warn(
      `[CADENCE] CaseID ${lead.caseId} — RVM PERMANENT FAIL: ${rvmResult.error}`,
    );
    await LeadCadence.updateOne(
      { _id: lead._id },
      {
        $inc: { rvmsSent: 1 },
        $set: {
          lastRvmAt: new Date(),
          lastRvmStatus: rvmResult.error,
          rvmDnc: true,
          rvmDncReason: reason,
          dncUpdatedAt: new Date(),
        },
      },
    );
    return { type: "rvm", ok: false, permanent: true, error: rvmResult.error };
  }

  console.warn(
    `[CADENCE] CaseID ${lead.caseId} — RVM failed: ${rvmResult.error}`,
  );
  return { type: "rvm", ok: false, error: rvmResult.error };
}

/* ══════════════════════════════════════════════════════════════
   TEXT SEND LOGIC
   ══════════════════════════════════════════════════════════════ */

async function tryText(lead, caseAge, actions) {
  const textsSent = lead.textsSent || 0;
  const maxTexts = getMaxTexts(caseAge);
  if (textsSent >= maxTexts) return null;

  // ── Per-day gate: max 1 text/day (Day 0 gets 2) ──────────
  if (lead.lastTextedAt && isSameCalendarDayPT(lead.lastTextedAt, new Date())) {
    // Count how many texts were sent today
    // We approximate: if lastTextedAt is today and we've already hit
    // the daily allowance, skip. For Day 0 this allows 2; for all others, 1.
    const dailyMax = getMaxTextsPerDay(caseAge);
    // Simple check: if we already texted today, only Day 0 gets a second
    if (dailyMax <= 1) return null;
    // Day 0: allow second text if gap permits (below)
  }

  // ── Min gap between texts (25min for Day 0's two-in-30min window) ──
  if (minutesSince(lead.lastTextedAt) < MIN_TEXT_GAP_MINUTES) return null;

  // ── Global CallRail rate check ────────────────────────────
  if (!canSendCallRail()) {
    // Don't even attempt — silently skip, try next tick
    return null;
  }

  // DNC — count it but don't send
  if (lead.smsDnc) {
    console.log(
      `[CADENCE] CaseID ${lead.caseId} — Text skipped (DNC: ${lead.smsDncReason})`,
    );
    await LeadCadence.updateOne(
      { _id: lead._id },
      { $inc: { textsSent: 1 }, $set: { lastTextedAt: new Date() } },
    );
    return { type: "text-dnc", reason: lead.smsDncReason };
  }

  // Fresh re-read
  const fresh = await LeadCadence.findById(lead._id, { textsSent: 1 }).lean();
  const freshSent = fresh?.textsSent || 0;
  if (freshSent >= maxTexts) return null;
  if (freshSent !== textsSent) {
    console.log(
      `[CADENCE] CaseID ${lead.caseId} — Text skipped: count changed (${textsSent} → ${freshSent})`,
    );
    return null;
  }

  const textNum = freshSent + 1;
  console.log(
    `[CADENCE] CaseID ${lead.caseId} — Age ${caseAge} Text #${textNum}`,
  );

  // Track the API call BEFORE sending
  trackCallRailCall();

  const textResult = await actions.sendText(
    lead.phone,
    lead.name,
    textNum,
    lead.company,
  );

  if (textResult.ok) {
    await LeadCadence.updateOne(
      { _id: lead._id },
      { $inc: { textsSent: 1 }, $set: { lastTextedAt: new Date() } },
    );
    return { type: "text", ok: true, num: textNum };
  }

  console.warn(
    `[CADENCE] CaseID ${lead.caseId} — Text #${textNum} failed: ${textResult.error}`,
  );

  // ── ALWAYS update lastTextedAt on failure to prevent retry storm ──
  // The text wasn't delivered but we stamp the time so the gap check
  // blocks retries for 25min (Day 0) or until tomorrow (Day 1+).
  await LeadCadence.updateOne(
    { _id: lead._id },
    { $set: { lastTextedAt: new Date() } },
  );

  // Set DNC on permanent text failures
  const errLower = (textResult.error || "").toLowerCase();
  if (
    errLower.includes("opted out") ||
    errLower.includes("phone number is invalid")
  ) {
    const reason = classifySmsDncReason(textResult.error);
    await LeadCadence.updateOne(
      { _id: lead._id },
      {
        $set: {
          phoneIsCell: false,
          phoneCanText: false,
          smsDnc: true,
          smsDncReason: reason,
          dncUpdatedAt: new Date(),
        },
      },
    );
    console.log(`[CADENCE] CaseID ${lead.caseId} — SMS DNC set: ${reason}`);
  }

  // If rate limited, log it so we know
  if (errLower.includes("rate limit")) {
    console.warn(
      `[CADENCE] ⚠ CallRail rate limited — ${callrailHourlyCount} calls this hour, pausing texts for remaining leads`,
    );
    // Spike the counter so canSendCallRail() blocks all remaining leads this tick
    callrailHourlyCount = CALLRAIL_CADENCE_BUDGET;
  }

  return { type: "text", ok: false, num: textNum, error: textResult.error };
}

/* ══════════════════════════════════════════════════════════════
   EMAIL SEND LOGIC
   ══════════════════════════════════════════════════════════════ */

async function tryEmail(lead, caseAge, actions) {
  if (!actions.sendFollowUpEmail) return null;
  if (!shouldSendEmail(lead)) return null;

  // Fresh re-read
  const fresh = await LeadCadence.findById(lead._id, { emailsSent: 1 }).lean();
  const freshSent = fresh?.emailsSent || 0;
  if (freshSent !== (lead.emailsSent || 0)) {
    console.log(
      `[CADENCE] CaseID ${lead.caseId} — Email skipped: count changed`,
    );
    return null;
  }

  const emailIndex = freshSent + 1;
  console.log(
    `[CADENCE] CaseID ${lead.caseId} — Age ${caseAge} Email #${emailIndex}`,
  );

  try {
    const emailResult = await actions.sendFollowUpEmail(
      lead.email,
      lead.name,
      emailIndex,
      lead.company,
    );

    if (emailResult.ok) {
      await LeadCadence.updateOne(
        { _id: lead._id },
        { $inc: { emailsSent: 1 }, $set: { lastEmailedAt: new Date() } },
      );
      return { type: "email", ok: true, num: emailIndex };
    }

    console.warn(
      `[CADENCE] CaseID ${lead.caseId} — Email #${emailIndex} failed: ${emailResult.error}`,
    );
    return {
      type: "email",
      ok: false,
      num: emailIndex,
      error: emailResult.error,
    };
  } catch (err) {
    console.warn(
      `[CADENCE] CaseID ${lead.caseId} — Email #${emailIndex} error: ${err.message}`,
    );
    return { type: "email", ok: false, num: emailIndex, error: err.message };
  }
}

/* ══════════════════════════════════════════════════════════════
   MAIN CADENCE TICK
   ══════════════════════════════════════════════════════════════ */

/**
 * Run one cadence cycle. Called every 5 minutes.
 *
 * @param {object} actions:
 *   {
 *     sendText(phone, name, textNum, company) → {ok},
 *     sendFollowUpEmail(email, name, emailIndex, company) → {ok},
 *     dropRvm({ phone, caseId, name, source, rvmNum, company }) → {ok, activityToken},
 *     rcPlatform — RingCentral SDK platform instance
 *   }
 */
async function runCadenceTick(actions) {
  if (!isBusinessHours()) {
    return { skipped: true, reason: "Outside business hours" };
  }

  if (tickRunning) {
    console.log(
      "[CADENCE] ⚠ Previous tick still running — skipping this cycle",
    );
    return { skipped: true, reason: "Previous tick still running" };
  }

  tickRunning = true;

  try {
    // ── Connection check ───────────────────────────────────────
    let connectionResults = null;
    if (actions.rcPlatform) {
      try {
        connectionResults = await checkForConnections(actions.rcPlatform);
      } catch (err) {
        console.error("[CADENCE] Connection check error:", err.message);
      }
    }

    // ── Active calls ───────────────────────────────────────────
    const phonesOnCall = await getActivePhonesOnCall(actions.rcPlatform);

    const leads = await LeadCadence.find({ active: true }).lean();
    const todayStr = getTodayDateStr();

    console.log(
      `[CADENCE] ══ Tick ══ ${leads.length} active lead(s) at ${todayStr} ${getHourPT()}:${String(getNowPT().getMinutes()).padStart(2, "0")} PT`,
    );

    // Diagnostics
    const ageBuckets = {};
    for (const lead of leads) {
      const age = lead.caseAge || 0;
      const bucket = age <= 1 ? `Day${age}` : age <= 9 ? "Day2-9" : "Day10+";
      ageBuckets[bucket] = (ageBuckets[bucket] || 0) + 1;
    }
    console.log(
      `[CADENCE] Age breakdown: ${Object.entries(ageBuckets)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")}`,
    );

    const results = [];
    let rvmsDropped = 0,
      textsSent = 0,
      emailsSent = 0,
      deactivated = 0,
      aged = 0;

    for (const lead of leads) {
      const result = { caseId: lead.caseId, name: lead.name, actions: [] };

      try {
        // ── 1. AGE INCREMENT ───────────────────────────────────
        const caseAge = await maybeIncrementAge(lead);
        if (caseAge > (lead.caseAge || 0)) {
          aged++;
          result.actions.push({
            type: "age-increment",
            from: lead.caseAge || 0,
            to: caseAge,
          });
        }

        // ── 2. SKIP CHECKS ────────────────────────────────────

        // Freshness gate
        if (!isStatusFresh(lead)) {
          const lastCheck = lead.lastLogicsCheckAt
            ? `${Math.round((Date.now() - new Date(lead.lastLogicsCheckAt).getTime()) / 60000)}min ago`
            : "never";
          console.log(
            `[CADENCE] CaseID ${lead.caseId} — STALE (last checked: ${lastCheck}), skipping`,
          );
          result.actions.push({ type: "status-stale", lastCheck });
          results.push(result);
          continue;
        }

        // Active call
        const leadPhone10 = phoneTo10(lead.phone);
        if (leadPhone10 && phonesOnCall.has(leadPhone10)) {
          result.actions.push({ type: "on-active-call" });
          results.push(result);
          continue;
        }

        // Connected — stop all outreach
        if (lead.day0Connected) {
          results.push(result);
          continue;
        }

        // Paused (worked — 5+ min call)
        if (
          lead.pauseOutreachUntil &&
          new Date(lead.pauseOutreachUntil) > new Date()
        ) {
          result.actions.push({
            type: "paused-worked",
            until: lead.pauseOutreachUntil,
          });
          results.push(result);
          continue;
        }

        // ── 3. RVM ─────────────────────────────────────────────
        const rvmAction = await tryRvm(lead, caseAge, actions);
        if (rvmAction) {
          result.actions.push(rvmAction);
          if (rvmAction.ok) rvmsDropped++;
        }

        // ── 4. TEXT ────────────────────────────────────────────
        const textAction = await tryText(lead, caseAge, actions);
        if (textAction) {
          result.actions.push(textAction);
          if (textAction.ok) textsSent++;
        }

        // ── 5. EMAIL ───────────────────────────────────────────
        const emailAction = await tryEmail(lead, caseAge, actions);
        if (emailAction) {
          result.actions.push(emailAction);
          if (emailAction.ok) emailsSent++;
        }

        // ── 6. EXHAUSTION CHECK ────────────────────────────────
        const finalLead = await LeadCadence.findById(lead._id).lean();
        if (
          finalLead &&
          !finalLead.day0Connected &&
          isCadenceExhausted(finalLead)
        ) {
          console.log(
            `[CADENCE] CaseID ${lead.caseId} — CADENCE EXHAUSTED ` +
              `(texts: ${finalLead.textsSent}/${MAX_TEXTS}, ` +
              `rvms: ${finalLead.rvmsSent}/${MAX_RVMS_LIFETIME}, ` +
              `emails: ${finalLead.emailsSent}/${MAX_EMAILS_LIFETIME})`,
          );

          try {
            const domain = (finalLead.company || "wynn").toUpperCase();
            await updateCaseStatus(
              domain,
              CADENCE_EXHAUSTED_STATUS,
              finalLead.phone,
            );
            console.log(
              `[CADENCE] CaseID ${lead.caseId} — ✓ Logics updated to status ${CADENCE_EXHAUSTED_STATUS}`,
            );
          } catch (err) {
            console.error(
              `[CADENCE] CaseID ${lead.caseId} — ✗ Logics status update failed: ${err.message}`,
            );
          }

          await LeadCadence.updateOne(
            { _id: lead._id },
            {
              $set: {
                active: false,
                lastLogicsStatus: CADENCE_EXHAUSTED_STATUS,
              },
            },
          );
          result.actions.push({
            type: "cadence-exhausted",
            status: CADENCE_EXHAUSTED_STATUS,
          });
          deactivated++;
        }
      } catch (err) {
        console.error(`[CADENCE] CaseID ${lead.caseId} — Error:`, err.message);
        result.actions.push({ type: "error", error: err.message });
      }

      results.push(result);
      await new Promise((r) => setTimeout(r, 200)); // Lead-to-lead pacing
    }

    console.log(
      `[CADENCE] ══ Done ══ ${results.length} leads | ` +
        `${aged} aged | ${rvmsDropped} RVMs | ${textsSent} texts | ` +
        `${emailsSent} emails | ${deactivated} deactivated | ` +
        `CR: ${callrailHourlyCount}/${CALLRAIL_CADENCE_BUDGET} this hour`,
    );

    return {
      skipped: false,
      processed: results.length,
      aged,
      rvmsDropped,
      textsSent,
      emailsSent,
      deactivated,
      connectionResults,
      results,
    };
  } finally {
    tickRunning = false;
  }
}

/* ══════════════════════════════════════════════════════════════
   EXPORTS
   ══════════════════════════════════════════════════════════════ */

module.exports = {
  runCadenceTick,
  pacedRvmDrop,
  isBusinessHours,
  getTodayDateStr,
  getMaxTexts,
  getMaxTextsPerDay,
  getMaxRvms,
  shouldSendEmail,
  isCadenceExhausted,
  maybeIncrementAge,
  canSendCallRail,
  ACTIVE_STATUSES,
  TEXT_CAPS,
  MAX_TEXTS,
  MAX_RVMS_LIFETIME,
  MAX_EMAILS_LIFETIME,
  CADENCE_EXHAUSTED_STATUS,
  CALLRAIL_HOURLY_CAP,
  CALLRAIL_CADENCE_BUDGET,
};
