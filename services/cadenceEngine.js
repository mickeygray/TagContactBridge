// services/cadenceEngine.js
// ─────────────────────────────────────────────────────────────
// Unified cadence engine — runs every 5 minutes during
// business hours and handles outreach:
//
//   DAY 0 TIMELINE:
//     ~5 min:   Email + Text 1 + RVM 1 (text & RVM offset 60s)
//     ~15 min:  RVM 2
//     ~30 min:  Text 2
//
//   TEXTS (5 total):
//     Text 1: Day 0 ~5min    (with RVM 1)
//     Text 2: Day 0 ~30min
//     Text 3: Day 1
//     Text 4: Day 3
//     Text 5: Day 7
//
//   EMAILS:
//     Welcome: Day 0 ~5min (with Text 1 + RVM 1)
//     Follow-up chain: 5 emails every-other-business-day
//     Then 1/week until status changes
//
//   DAY 2-9: NOON RVM
//     One RVM drop per day at noon PT, Mon-Fri
//
//   DAY 10+:
//     Cadence exhaustion check only — dialing handled by PhoneBurner
//
//   DNC FLAGS:
//     smsDnc / rvmDnc — set at intake or on first failure
//     Checked before every SMS/RVM attempt, skip with one-line log
//
//   SAFETY:
//     - Never RVM same lead within MIN_GAP_MINUTES
//     - day0Connected = true → stop all outreach
//     - All actions tracked in MongoDB with timestamps
//     - Dialing handled entirely by PhoneBurner (not this engine)
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
   STRATEGY CONSTANTS
   ══════════════════════════════════════════════════════════════ */

// Day 0 scheduled actions (minutes after creation)
const DAY0_ACTIONS = [
  { minute: 5, actions: ["email", "text", "rvm"] },
  { minute: 15, actions: ["rvm"] },
  { minute: 30, actions: ["text"] },
];

// Day 2-9: RVM drop once per day at noon (handled by cadence tick)
const DAY2_9_RVM_HOUR = 12; // noon PT
const DAY2_9_MAX_DAY = 9;

// Text schedule (texts 3-5 handled by time since creation)
const TEXT_SCHEDULE = [
  { textNum: 3, minMinutesSinceCreation: 24 * 60, minMinutesSinceLastText: 60 },
  {
    textNum: 4,
    minMinutesSinceCreation: 3 * 24 * 60,
    minMinutesSinceLastText: 60,
  },
  {
    textNum: 5,
    minMinutesSinceCreation: 7 * 24 * 60,
    minMinutesSinceLastText: 60,
  },
];
const MAX_TEXTS = 5;

// Global safety
const MIN_RVM_GAP_MINUTES = 10;
const MAX_RVMS_LIFETIME = 15;

// Cadence exhaustion — when ALL of these caps are hit,
// update Logics status to 223 (Automatic Contact Ended)
// and deactivate the lead.
const CADENCE_EXHAUSTED_STATUS = 223;
const MAX_EMAILS_LIFETIME = 10; // 5 chain + some weekly

// Check function: has this lead exhausted all contact channels?
function isCadenceExhausted(lead) {
  const texts = lead.textsSent || 0;
  const rvms = lead.rvmsSent || 0;
  const emails = lead.emailsSent || 0;

  // With dialing moved to PB, exhaustion is texts + rvms + emails
  return (
    texts >= MAX_TEXTS &&
    rvms >= MAX_RVMS_LIFETIME &&
    emails >= MAX_EMAILS_LIFETIME
  );
}

// RVM pacing (Drop.co)
const RVM_MIN_DELAY_MS = 2000; // 2s between RVM drops
let rvmLastDropTime = 0;

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
function getMinutePT() {
  return getNowPT().getMinutes();
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

function businessDaysSinceCreation(createdAt) {
  const created = new Date(
    new Date(createdAt).toLocaleString("en-US", { timeZone: BUSINESS_TZ }),
  );
  const now = getNowPT();
  let current = new Date(
    created.getFullYear(),
    created.getMonth(),
    created.getDate(),
  );
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const createdDay = current.getDay();
  if (createdDay === 0) current.setDate(current.getDate() + 1);
  if (createdDay === 6) current.setDate(current.getDate() + 2);
  let businessDays = 1;
  while (current < today) {
    current.setDate(current.getDate() + 1);
    if (current.getDay() !== 0 && current.getDay() !== 6) businessDays++;
  }
  return businessDays;
}

function daysSinceCreation(createdAt) {
  return businessDaysSinceCreation(createdAt);
}

/* ══════════════════════════════════════════════════════════════
   DNC REASON HELPERS
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
   DAY 0 ACTION SCHEDULER
   ══════════════════════════════════════════════════════════════ */

/**
 * Determine which Day 0 actions should fire for this lead right now.
 * Returns an array of action strings that haven't been done yet.
 */
function getDay0Actions(lead) {
  if (lead.day0Connected) return [];

  const minSinceCreation = minutesSince(lead.createdAt);
  const pendingActions = [];

  const textsSent = lead.textsSent || 0;
  const rvmsSent = lead.rvmsSent || 0;

  let expectedTexts = 0;
  let expectedRvms = 0;

  for (const milestone of DAY0_ACTIONS) {
    if (minSinceCreation < milestone.minute) break;

    for (const action of milestone.actions) {
      if (action === "text") expectedTexts++;
      if (action === "rvm") expectedRvms++;
    }
  }

  if (rvmsSent < expectedRvms) {
    pendingActions.push("rvm");
  }

  if (textsSent < expectedTexts) {
    pendingActions.push("text");
  }

  return pendingActions;
}

/**
 * Check if lead is still in Day 0 window.
 */
function isDay0(lead) {
  const minSinceCreation = minutesSince(lead.createdAt);
  const maxDay0Minute = DAY0_ACTIONS[DAY0_ACTIONS.length - 1].minute + 30; // 60min
  const day0Complete = (lead.rvmsSent || 0) >= 2;

  return minSinceCreation <= maxDay0Minute && !day0Complete;
}

/* ══════════════════════════════════════════════════════════════
   TEXT DECISION (Texts 3-5, post Day 0)
   ══════════════════════════════════════════════════════════════ */

function shouldSendText35(lead) {
  if (lead.smsDnc) return false;
  const sent = lead.textsSent || 0;
  if (sent < 2) return false; // Texts 1-2 are Day 0
  if (sent >= MAX_TEXTS) return false;

  const minSinceCreation = minutesSince(lead.createdAt);
  const minSinceLastText = minutesSince(lead.lastTextedAt);

  const scheduleIndex = sent - 2; // sent=2 → index 0 (Text 3)
  if (scheduleIndex >= TEXT_SCHEDULE.length) return false;

  const nextText = TEXT_SCHEDULE[scheduleIndex];
  return (
    minSinceCreation >= nextText.minMinutesSinceCreation &&
    minSinceLastText >= nextText.minMinutesSinceLastText
  );
}

/* ══════════════════════════════════════════════════════════════
   EMAIL DECISION
   ══════════════════════════════════════════════════════════════ */

function shouldEmail(lead) {
  if (!lead.email) return false;
  if (lead.emailValid === false) return false; // only block if explicitly invalidated
  const bizDay = businessDaysSinceCreation(lead.createdAt);
  const sent = lead.emailsSent || 0;
  if (bizDay < 2) return false;
  if (lead.lastEmailedAt && isSameCalendarDayPT(lead.lastEmailedAt, new Date()))
    return false;

  if (sent < 5) {
    const expectedDay = 2 + sent * 2;
    return bizDay >= expectedDay;
  }

  if (lead.lastEmailedAt) {
    return minutesSince(lead.lastEmailedAt) / (60 * 24) >= 7;
  }
  return true;
}

function isDay2Plus(lead) {
  return businessDaysSinceCreation(lead.createdAt) >= 2;
}

/* ══════════════════════════════════════════════════════════════
   RVM PACING
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
 *     rcPlatform — RingCentral SDK platform instance (for connection checking)
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
    // ── Check for connections BEFORE processing leads ──────────
    let connectionResults = null;
    if (actions.rcPlatform) {
      try {
        connectionResults = await checkForConnections(actions.rcPlatform);
      } catch (err) {
        console.error("[CADENCE] Connection check error:", err.message);
      }
    }

    // ── Get currently active calls ─────────────────────────────
    const phonesOnCall = await getActivePhonesOnCall(actions.rcPlatform);

    const leads = await LeadCadence.find({ active: true }).lean();
    const hour = getHourPT();
    const minute = getMinutePT();

    console.log(
      `[CADENCE] ══ Tick ══ ${leads.length} active lead(s) at ${getTodayDateStr()} ${hour}:${String(minute).padStart(2, "0")} PT`,
    );

    // Diagnostic
    let d0 = 0,
      d0catch = 0,
      d1 = 0,
      d2plus = 0,
      fresh = 0,
      stale = 0;
    for (const lead of leads) {
      if (isStatusFresh(lead)) fresh++;
      else stale++;
      if (isDay0(lead)) d0++;
      else if (
        businessDaysSinceCreation(lead.createdAt) === 1 &&
        (lead.rvmsSent || 0) < 2
      )
        d0catch++;
      else if (businessDaysSinceCreation(lead.createdAt) <= 1) d1++;
      else d2plus++;
    }
    console.log(
      `[CADENCE] Breakdown: Day0=${d0} Day0-catch=${d0catch} Day1=${d1} Day2+=${d2plus} | Fresh=${fresh} Stale=${stale}`,
    );

    const results = [];
    let rvmsDropped = 0,
      textsSent = 0,
      emailsSent = 0,
      deactivated = 0;

    for (const lead of leads) {
      const result = { caseId: lead.caseId, name: lead.name, actions: [] };

      try {
        // ── Freshness gate ─────────────────────────────────────
        if (!isStatusFresh(lead)) {
          const lastCheck = lead.lastLogicsCheckAt
            ? `${Math.round((Date.now() - new Date(lead.lastLogicsCheckAt).getTime()) / 60000)}min ago`
            : "never";
          console.log(
            `[CADENCE] CaseID ${lead.caseId} — STALE (last checked: ${lastCheck}), skipping`,
          );
          result.actions.push({
            type: "status-stale",
            lastCheck: lead.lastLogicsCheckAt || "never",
          });
          results.push(result);
          continue;
        }

        // ── Active call check ──────────────────────────────────
        const leadPhone10 = phoneTo10(lead.phone);
        if (leadPhone10 && phonesOnCall.has(leadPhone10)) {
          result.actions.push({ type: "on-active-call", phone: leadPhone10 });
          results.push(result);
          continue;
        }

        // Skip all outreach if already connected
        if (lead.day0Connected) {
          results.push(result);
          continue;
        }

        // Skip if lead was "worked" (5+ min call) — paused until tomorrow
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

        // ════════════════════════════════════════════════════════
        // DAY 0 SCHEDULED ACTIONS
        // ════════════════════════════════════════════════════════
        if (
          isDay0(lead) ||
          (businessDaysSinceCreation(lead.createdAt) === 1 &&
            (lead.rvmsSent || 0) < 2)
        ) {
          const pending = getDay0Actions(lead);

          // ── Day 0 RVM ──────────────────────────────────────
          if (pending.includes("rvm") && actions.dropRvm) {
            if (lead.rvmDnc) {
              console.log(
                `[CADENCE] CaseID ${lead.caseId} — RVM skipped (DNC: ${lead.rvmDncReason})`,
              );
              await LeadCadence.updateOne(
                { _id: lead._id },
                { $inc: { rvmsSent: 1 }, $set: { lastRvmAt: new Date() } },
              );
              result.actions.push({
                type: "rvm-dnc",
                reason: lead.rvmDncReason,
              });
            } else {
              const rvmNum = (lead.rvmsSent || 0) + 1;
              console.log(
                `[CADENCE] CaseID ${lead.caseId} — Day 0 RVM #${rvmNum}`,
              );
              const rvmResult = await pacedRvmDrop(actions.dropRvm, {
                phone: lead.phone,
                caseId: lead.caseId,
                name: lead.name,
                source: "day0",
                rvmNum,
                company: lead.company,
              });

              if (rvmResult.ok) {
                const rvmUpdate = {
                  $inc: { rvmsSent: 1 },
                  $set: { lastRvmAt: new Date() },
                };
                if (rvmResult.activityToken) {
                  rvmUpdate.$set.lastRvmActivityToken = rvmResult.activityToken;
                }
                await LeadCadence.updateOne({ _id: lead._id }, rvmUpdate);
                result.actions.push({
                  type: "rvm",
                  strategy: "day0",
                  ok: true,
                  num: rvmNum,
                });
                rvmsDropped++;
              } else if (rvmResult.permanent) {
                const rvmDncReason = classifyRvmDncReason(rvmResult.error);
                console.warn(
                  `[CADENCE] CaseID ${lead.caseId} — RVM #${rvmNum} PERMANENT FAIL: ${rvmResult.error}`,
                );
                await LeadCadence.updateOne(
                  { _id: lead._id },
                  {
                    $inc: { rvmsSent: 1 },
                    $set: {
                      lastRvmAt: new Date(),
                      lastRvmStatus: rvmResult.error,
                      rvmDnc: true,
                      rvmDncReason,
                      dncUpdatedAt: new Date(),
                    },
                  },
                );
                result.actions.push({
                  type: "rvm",
                  strategy: "day0",
                  ok: false,
                  permanent: true,
                  num: rvmNum,
                  error: rvmResult.error,
                });
              } else {
                console.warn(
                  `[CADENCE] CaseID ${lead.caseId} — RVM #${rvmNum} failed: ${rvmResult.error}`,
                );
                result.actions.push({
                  type: "rvm",
                  strategy: "day0",
                  ok: false,
                  num: rvmNum,
                  error: rvmResult.error,
                });
              }
            }
          }

          // ── Day 0 Text (offset ~60s after RVM) ─────────────
          if (pending.includes("text")) {
            if (lead.smsDnc) {
              console.log(
                `[CADENCE] CaseID ${lead.caseId} — Text skipped (DNC: ${lead.smsDncReason})`,
              );
              await LeadCadence.updateOne(
                { _id: lead._id },
                { $inc: { textsSent: 1 }, $set: { lastTextedAt: new Date() } },
              );
              result.actions.push({
                type: "text-dnc",
                reason: lead.smsDncReason,
              });
            } else {
              if (pending.includes("rvm")) {
                await new Promise((r) => setTimeout(r, 60000));
              }

              const freshLead = await LeadCadence.findById(lead._id, {
                textsSent: 1,
              }).lean();
              const freshTextsSent = freshLead?.textsSent || 0;
              const textNum = freshTextsSent + 1;

              if (freshTextsSent === (lead.textsSent || 0)) {
                console.log(
                  `[CADENCE] CaseID ${lead.caseId} — Day 0 Text #${textNum}`,
                );
                const textResult = await actions.sendText(
                  lead.phone,
                  lead.name,
                  textNum,
                  lead.company,
                );

                if (textResult.ok) {
                  await LeadCadence.updateOne(
                    { _id: lead._id },
                    {
                      $inc: { textsSent: 1 },
                      $set: { lastTextedAt: new Date() },
                    },
                  );
                  result.actions.push({
                    type: "text",
                    strategy: "day0",
                    num: textNum,
                    ok: true,
                  });
                  textsSent++;
                } else {
                  console.warn(
                    `[CADENCE] CaseID ${lead.caseId} — Text #${textNum} failed: ${textResult.error}`,
                  );
                  const errLower = (textResult.error || "").toLowerCase();
                  if (
                    errLower.includes("opted out") ||
                    errLower.includes("phone number is invalid")
                  ) {
                    const smsDncReason = classifySmsDncReason(textResult.error);
                    await LeadCadence.updateOne(
                      { _id: lead._id },
                      {
                        $set: {
                          phoneIsCell: false,
                          phoneCanText: false,
                          smsDnc: true,
                          smsDncReason,
                          dncUpdatedAt: new Date(),
                        },
                      },
                    );
                    console.log(
                      `[CADENCE] CaseID ${lead.caseId} — SMS DNC set: ${smsDncReason}`,
                    );
                  }
                  result.actions.push({
                    type: "text",
                    strategy: "day0",
                    num: textNum,
                    ok: false,
                    error: textResult.error,
                  });
                }
              } else {
                console.log(
                  `[CADENCE] CaseID ${lead.caseId} — Text skipped: textsSent changed (was ${lead.textsSent || 0}, now ${freshTextsSent})`,
                );
              }
            }
          }
        }

        // ════════════════════════════════════════════════════════
        // DAY 1: Each channel gates on its own count
        // ════════════════════════════════════════════════════════
        else if (
          businessDaysSinceCreation(lead.createdAt) === 1 &&
          (lead.rvmsSent || 0) >= 2
        ) {
          const leadRvmsSent = lead.rvmsSent || 0;
          const leadTextsSent = lead.textsSent || 0;
          const leadEmailsSent = lead.emailsSent || 0;
          const hoursSinceLastRvm = lead.lastRvmAt
            ? (Date.now() - new Date(lead.lastRvmAt).getTime()) /
              (1000 * 60 * 60)
            : 999;

          // ── RVM: send up to 4 total by end of Day 1 ─────────
          if (leadRvmsSent < 4 && actions.dropRvm && hoursSinceLastRvm >= 2) {
            const rvmNum = leadRvmsSent + 1;
            if (lead.rvmDnc) {
              console.log(
                `[CADENCE] CaseID ${lead.caseId} — Day 1 RVM #${rvmNum} skipped (DNC: ${lead.rvmDncReason})`,
              );
              await LeadCadence.updateOne(
                { _id: lead._id },
                { $inc: { rvmsSent: 1 }, $set: { lastRvmAt: new Date() } },
              );
              result.actions.push({
                type: "rvm-dnc",
                reason: lead.rvmDncReason,
              });
            } else {
              console.log(
                `[CADENCE] CaseID ${lead.caseId} — Day 1 RVM #${rvmNum}`,
              );
              const rvmResult = await pacedRvmDrop(actions.dropRvm, {
                phone: lead.phone,
                caseId: lead.caseId,
                name: lead.name,
                source: "day1",
                rvmNum: Math.min(rvmNum, 4),
                company: lead.company,
              });
              if (rvmResult.ok) {
                const rvmUpdate = {
                  $inc: { rvmsSent: 1 },
                  $set: { lastRvmAt: new Date() },
                };
                if (rvmResult.activityToken)
                  rvmUpdate.$set.lastRvmActivityToken = rvmResult.activityToken;
                await LeadCadence.updateOne({ _id: lead._id }, rvmUpdate);
                result.actions.push({
                  type: "rvm",
                  strategy: "day1",
                  ok: true,
                  num: rvmNum,
                });
                rvmsDropped++;
              } else if (rvmResult.permanent) {
                const rvmDncReason = classifyRvmDncReason(rvmResult.error);
                await LeadCadence.updateOne(
                  { _id: lead._id },
                  {
                    $inc: { rvmsSent: 1 },
                    $set: {
                      lastRvmAt: new Date(),
                      rvmDnc: true,
                      rvmDncReason,
                      dncUpdatedAt: new Date(),
                    },
                  },
                );
                result.actions.push({
                  type: "rvm",
                  strategy: "day1",
                  ok: false,
                  permanent: true,
                  num: rvmNum,
                  error: rvmResult.error,
                });
              } else {
                result.actions.push({
                  type: "rvm",
                  strategy: "day1",
                  ok: false,
                  num: rvmNum,
                  error: rvmResult.error,
                });
              }
            }
          }

          // ── Text 3: send if textsSent < 3 ───────────────────
          if (leadTextsSent < 3) {
            if (lead.smsDnc) {
              console.log(
                `[CADENCE] CaseID ${lead.caseId} — Day 1 Text #3 skipped (DNC: ${lead.smsDncReason})`,
              );
              await LeadCadence.updateOne(
                { _id: lead._id },
                { $inc: { textsSent: 1 }, $set: { lastTextedAt: new Date() } },
              );
              result.actions.push({
                type: "text-dnc",
                reason: lead.smsDncReason,
              });
            } else {
              const freshLead = await LeadCadence.findById(lead._id, {
                textsSent: 1,
              }).lean();
              const freshTextsSent = freshLead?.textsSent || 0;
              if (freshTextsSent === leadTextsSent) {
                const textNum = freshTextsSent + 1;
                console.log(
                  `[CADENCE] CaseID ${lead.caseId} — Day 1 Text #${textNum}`,
                );
                const textResult = await actions.sendText(
                  lead.phone,
                  lead.name,
                  textNum,
                  lead.company,
                );
                if (textResult.ok) {
                  await LeadCadence.updateOne(
                    { _id: lead._id },
                    {
                      $inc: { textsSent: 1 },
                      $set: { lastTextedAt: new Date() },
                    },
                  );
                  result.actions.push({
                    type: "text",
                    strategy: "day1",
                    num: textNum,
                    ok: true,
                  });
                  textsSent++;
                } else {
                  console.warn(
                    `[CADENCE] CaseID ${lead.caseId} — Text #${textNum} failed: ${textResult.error}`,
                  );
                  const errLower = (textResult.error || "").toLowerCase();
                  if (
                    errLower.includes("opted out") ||
                    errLower.includes("phone number is invalid")
                  ) {
                    await LeadCadence.updateOne(
                      { _id: lead._id },
                      {
                        $set: {
                          smsDnc: true,
                          smsDncReason: classifySmsDncReason(textResult.error),
                          dncUpdatedAt: new Date(),
                        },
                      },
                    );
                  }
                  result.actions.push({
                    type: "text",
                    strategy: "day1",
                    num: textNum,
                    ok: false,
                    error: textResult.error,
                  });
                }
              }
            }
          }

          // ── Email 2: send if emailsSent < 2 ─────────────────
          if (leadEmailsSent < 2 && lead.email && actions.sendFollowUpEmail) {
            const emailNum = leadEmailsSent + 1;
            console.log(
              `[CADENCE] CaseID ${lead.caseId} — Day 1 Email #${emailNum}`,
            );
            try {
              const emailResult = await actions.sendFollowUpEmail(
                lead.email,
                lead.name,
                emailNum,
                lead.company,
              );
              if (emailResult.ok) {
                await LeadCadence.updateOne(
                  { _id: lead._id },
                  {
                    $inc: { emailsSent: 1 },
                    $set: { lastEmailedAt: new Date() },
                  },
                );
                result.actions.push({
                  type: "email",
                  strategy: "day1",
                  num: emailNum,
                  ok: true,
                });
                emailsSent++;
              } else {
                console.warn(
                  `[CADENCE] CaseID ${lead.caseId} — Email #${emailNum} failed: ${emailResult.error}`,
                );
                result.actions.push({
                  type: "email",
                  strategy: "day1",
                  num: emailNum,
                  ok: false,
                  error: emailResult.error,
                });
              }
            } catch (emailErr) {
              console.warn(
                `[CADENCE] CaseID ${lead.caseId} — Email #${emailNum} failed: ${emailErr.message}`,
              );
              result.actions.push({
                type: "email",
                strategy: "day1",
                num: emailNum,
                ok: false,
                error: emailErr.message,
              });
            }
          }
        }

        // ════════════════════════════════════════════════════════
        // DAY 2-9: NOON RVM DROP
        // ════════════════════════════════════════════════════════
        else if (
          businessDaysSinceCreation(lead.createdAt) >= 2 &&
          businessDaysSinceCreation(lead.createdAt) <= DAY2_9_MAX_DAY
        ) {
          const hourPT = getHourPT();

          // Only fire at the noon tick (12:00-12:04 PT window)
          if (hourPT === DAY2_9_RVM_HOUR) {
            const alreadyRvmToday =
              lead.lastRvmAt && isSameCalendarDayPT(lead.lastRvmAt, new Date());

            if (!alreadyRvmToday) {
              const freshLead = await LeadCadence.findById(lead._id, {
                rvmsSent: 1,
                lastRvmAt: 1,
              }).lean();
              const freshAlreadyToday =
                freshLead?.lastRvmAt &&
                isSameCalendarDayPT(freshLead.lastRvmAt, new Date());

              if (!freshAlreadyToday) {
                if (lead.rvmDnc) {
                  console.log(
                    `[CADENCE] CaseID ${lead.caseId} — Day ${businessDaysSinceCreation(lead.createdAt)} noon RVM skipped (DNC: ${lead.rvmDncReason})`,
                  );
                  result.actions.push({
                    type: "rvm-dnc",
                    strategy: "noon-day2-9",
                    reason: lead.rvmDncReason,
                  });
                } else if (actions.dropRvm) {
                  const rvmNum = Math.min((freshLead?.rvmsSent || 0) + 1, 4);
                  console.log(
                    `[CADENCE] CaseID ${lead.caseId} — Day ${businessDaysSinceCreation(lead.createdAt)} noon RVM #${(freshLead?.rvmsSent || 0) + 1} (audio: ${rvmNum})`,
                  );

                  const rvmResult = await pacedRvmDrop(actions.dropRvm, {
                    phone: lead.phone,
                    caseId: lead.caseId,
                    name: lead.name,
                    source: `day${businessDaysSinceCreation(lead.createdAt)}-noon`,
                    rvmNum,
                    company: lead.company,
                  });

                  if (rvmResult.ok) {
                    await LeadCadence.updateOne(
                      { _id: lead._id },
                      {
                        $inc: { rvmsSent: 1 },
                        $set: {
                          lastRvmAt: new Date(),
                          lastRvmActivityToken: rvmResult.activityToken || null,
                        },
                      },
                    );
                    result.actions.push({
                      type: "rvm",
                      strategy: "noon-day2-9",
                      ok: true,
                      num: (freshLead?.rvmsSent || 0) + 1,
                    });
                    rvmsDropped++;
                  } else if (rvmResult.permanent) {
                    const rvmDncReason = classifyRvmDncReason(rvmResult.error);
                    console.warn(
                      `[CADENCE] CaseID ${lead.caseId} — Noon RVM PERMANENT FAIL: ${rvmResult.error}`,
                    );
                    await LeadCadence.updateOne(
                      { _id: lead._id },
                      {
                        $inc: { rvmsSent: 1 },
                        $set: {
                          lastRvmAt: new Date(),
                          lastRvmStatus: rvmResult.error,
                          rvmDnc: true,
                          rvmDncReason,
                          dncUpdatedAt: new Date(),
                        },
                      },
                    );
                    result.actions.push({
                      type: "rvm",
                      strategy: "noon-day2-9",
                      ok: false,
                      permanent: true,
                      error: rvmResult.error,
                    });
                  } else {
                    console.warn(
                      `[CADENCE] CaseID ${lead.caseId} — Noon RVM failed: ${rvmResult.error}`,
                    );
                    result.actions.push({
                      type: "rvm",
                      strategy: "noon-day2-9",
                      ok: false,
                      error: rvmResult.error,
                    });
                  }
                }
              }
            }
          }
        }

        // Day 10+ — no cadence actions (PB handles dialing)

        // ════════════════════════════════════════════════════════
        // TEXTS 3-5 (post Day 0)
        // ════════════════════════════════════════════════════════
        if (shouldSendText35(lead)) {
          if (lead.smsDnc) {
            console.log(
              `[CADENCE] CaseID ${lead.caseId} — Text 3-5 skipped (DNC: ${lead.smsDncReason})`,
            );
            await LeadCadence.updateOne(
              { _id: lead._id },
              { $inc: { textsSent: 1 }, $set: { lastTextedAt: new Date() } },
            );
            result.actions.push({
              type: "text-dnc",
              reason: lead.smsDncReason,
            });
          } else {
            const freshLead = await LeadCadence.findById(lead._id, {
              textsSent: 1,
            }).lean();
            const freshTextsSent = freshLead?.textsSent || 0;
            const textNum = freshTextsSent + 1;

            if (
              freshTextsSent === (lead.textsSent || 0) &&
              textNum <= MAX_TEXTS
            ) {
              console.log(`[CADENCE] CaseID ${lead.caseId} — Text #${textNum}`);
              const textResult = await actions.sendText(
                lead.phone,
                lead.name,
                textNum,
                lead.company,
              );

              if (textResult.ok) {
                await LeadCadence.updateOne(
                  { _id: lead._id },
                  {
                    $inc: { textsSent: 1 },
                    $set: { lastTextedAt: new Date() },
                  },
                );
                result.actions.push({
                  type: "text",
                  strategy: "scheduled",
                  num: textNum,
                  ok: true,
                });
                textsSent++;
              } else {
                console.warn(
                  `[CADENCE] CaseID ${lead.caseId} — Text #${textNum} failed: ${textResult.error}`,
                );
                const errLower = (textResult.error || "").toLowerCase();
                if (
                  errLower.includes("opted out") ||
                  errLower.includes("phone number is invalid")
                ) {
                  const smsDncReason = classifySmsDncReason(textResult.error);
                  await LeadCadence.updateOne(
                    { _id: lead._id },
                    {
                      $set: {
                        phoneIsCell: false,
                        phoneCanText: false,
                        smsDnc: true,
                        smsDncReason,
                        dncUpdatedAt: new Date(),
                      },
                    },
                  );
                  console.log(
                    `[CADENCE] CaseID ${lead.caseId} — SMS DNC set: ${smsDncReason}`,
                  );
                }
                result.actions.push({
                  type: "text",
                  strategy: "scheduled",
                  num: textNum,
                  ok: false,
                  error: textResult.error,
                });
              }
            } else {
              console.log(
                `[CADENCE] CaseID ${lead.caseId} — Text skipped: count changed or cap reached`,
              );
            }
          }
        }

        // ════════════════════════════════════════════════════════
        // FOLLOW-UP EMAILS
        // ════════════════════════════════════════════════════════
        if (shouldEmail(lead)) {
          const freshLead = await LeadCadence.findById(lead._id, {
            emailsSent: 1,
          }).lean();
          const freshEmailsSent = freshLead?.emailsSent || 0;
          const emailIndex = freshEmailsSent + 1;

          if (freshEmailsSent === (lead.emailsSent || 0)) {
            console.log(
              `[CADENCE] CaseID ${lead.caseId} — Email #${emailIndex}`,
            );
            const emailResult = await actions.sendFollowUpEmail(
              lead.email,
              lead.name,
              emailIndex,
              lead.company,
            );

            if (emailResult.ok) {
              await LeadCadence.updateOne(
                { _id: lead._id },
                {
                  $inc: { emailsSent: 1 },
                  $set: { lastEmailedAt: new Date() },
                },
              );
              result.actions.push({ type: "email", num: emailIndex, ok: true });
              emailsSent++;
            } else {
              console.warn(
                `[CADENCE] CaseID ${lead.caseId} — Email #${emailIndex} failed: ${emailResult.error}`,
              );
              result.actions.push({
                type: "email",
                num: emailIndex,
                ok: false,
                error: emailResult.error,
              });
            }
          } else {
            console.log(
              `[CADENCE] CaseID ${lead.caseId} — Email skipped: emailsSent changed (was ${lead.emailsSent || 0}, now ${freshEmailsSent})`,
            );
          }
        }

        // ════════════════════════════════════════════════════════
        // CADENCE EXHAUSTION CHECK
        // ════════════════════════════════════════════════════════
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
            const logicsDomain = (finalLead.company || "wynn").toUpperCase();
            await updateCaseStatus(
              logicsDomain,
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
          console.log(
            `[CADENCE] CaseID ${lead.caseId} — Deactivated (cadence exhausted)`,
          );
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
        `${rvmsDropped} RVMs | ${textsSent} texts | ` +
        `${emailsSent} emails | ${deactivated} deactivated`,
    );

    return {
      skipped: false,
      processed: results.length,
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

module.exports = {
  runCadenceTick,
  pacedRvmDrop,
  isBusinessHours,
  getTodayDateStr,
  daysSinceCreation,
  businessDaysSinceCreation,
  getDay0Actions,
  shouldSendText35,
  shouldEmail,
  isDay2Plus,
  isCadenceExhausted,
  ACTIVE_STATUSES,
  DAY0_ACTIONS,
  DAY2_9_RVM_HOUR,
  DAY2_9_MAX_DAY,
  TEXT_SCHEDULE,
  MAX_TEXTS,
  MAX_RVMS_LIFETIME,
  MAX_EMAILS_LIFETIME,
  CADENCE_EXHAUSTED_STATUS,
};
