// services/cadenceEngine.js
// ─────────────────────────────────────────────────────────────
// Cron-driven cadence engine.
// Processes all active LeadCadence records during business hours.
//
// Cadence rules:
//   TEXTS:  1/day for first 3 days (3 total)
//   CALLS:  Day 0-1 handled by RingOut (cadence engine).
//           Day 2+ handled by noon CallFire auto-dialer.
//           BUFFERED: 10 calls every 5 minutes to avoid morning blast.
//   EMAILS: Welcome on signup. Then every-other-day chain of 5.
//           Then 1/week until status changes.
//
// Logics status gating:
//   Status 1 or 2 → active, continue cadence
//   Anything else  → deactivate (delete from active set)
// ─────────────────────────────────────────────────────────────

const LeadCadence = require("../models/LeadCadence");
const { fetchCaseInfo } = require("./logicsService");

const BUSINESS_TZ = process.env.BUSINESS_TZ || "America/Los_Angeles";
const BUSINESS_START = Number(process.env.BUSINESS_START_HOUR || 7);
const BUSINESS_END = Number(process.env.BUSINESS_END_HOUR || 17); // 5pm

// Active Logics statuses
const ACTIVE_STATUSES = [1, 2];

// Call buffering config
const CALL_BATCH_SIZE = 10;
const CALL_BATCH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory call queue (persists across ticks within same process)
let callQueue = [];
let isProcessingQueue = false;

/* -------------------------------------------------------------------------- */
/*                          TIME HELPERS                                      */
/* -------------------------------------------------------------------------- */

function getNowPT() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: BUSINESS_TZ }),
  );
}

function getTodayDateStr() {
  const now = getNowPT();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getHourPT() {
  return getNowPT().getHours();
}

function isBusinessHours() {
  const now = getNowPT();
  const day = now.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const hour = now.getHours();
  return hour >= BUSINESS_START && hour < BUSINESS_END;
}

/**
 * Count business days (Mon-Fri) since lead creation.
 * Day 1 = creation day (or next business day if created on weekend)
 * Day 2 = next business day after Day 1
 * etc.
 */
function businessDaysSinceCreation(createdAt) {
  const created = new Date(
    new Date(createdAt).toLocaleString("en-US", { timeZone: BUSINESS_TZ }),
  );
  const now = getNowPT();

  // Strip time for date comparison
  let current = new Date(
    created.getFullYear(),
    created.getMonth(),
    created.getDate(),
  );
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // If created on weekend, move to next Monday
  const createdDay = current.getDay();
  if (createdDay === 0) current.setDate(current.getDate() + 1); // Sun -> Mon
  if (createdDay === 6) current.setDate(current.getDate() + 2); // Sat -> Mon

  // Count business days
  let businessDays = 1; // Day 1 = creation day (or first business day)

  while (current < today) {
    current.setDate(current.getDate() + 1);
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      businessDays++;
    }
  }

  return businessDays;
}

/**
 * Legacy function - kept for backwards compatibility but use businessDaysSinceCreation instead
 */
function daysSinceCreation(createdAt) {
  return businessDaysSinceCreation(createdAt);
}

/**
 * What hour (PT) was the lead created?
 */
function creationHourPT(createdAt) {
  const created = new Date(
    new Date(createdAt).toLocaleString("en-US", { timeZone: BUSINESS_TZ }),
  );
  return created.getHours();
}

/* -------------------------------------------------------------------------- */
/*                      CADENCE RULE CALCULATIONS                             */
/* -------------------------------------------------------------------------- */

/**
 * Determine if we should text this lead right now.
 * Rule: 1 text/day for first 3 business days.
 */
function shouldText(lead) {
  if (!lead.phoneIsCell) return false;
  if (lead.textsSent >= 3) return false;

  const bizDay = businessDaysSinceCreation(lead.createdAt);
  if (bizDay > 3) return false; // only business days 1, 2, 3

  // Have we already texted today?
  if (lead.lastTextedAt) {
    const lastTextDate = new Date(
      new Date(lead.lastTextedAt).toLocaleString("en-US", {
        timeZone: BUSINESS_TZ,
      }),
    );
    const todayDate = getNowPT();
    if (
      lastTextDate.getFullYear() === todayDate.getFullYear() &&
      lastTextDate.getMonth() === todayDate.getMonth() &&
      lastTextDate.getDate() === todayDate.getDate()
    ) {
      return false; // already texted today
    }
  }

  return true;
}

/**
 * Determine if we should call this lead right now.
 *
 * Rules (business days, weekends don't count):
 *   Day 1 (creation day): 3 calls
 *   Day 2: 2 calls
 *   Day 3+: 1 call per day
 *
 * Spacing: at least 2 hours between calls
 */
function shouldCall(lead, debug = false) {
  const reasons = [];

  if (!lead.phoneConnected) {
    reasons.push("phoneConnected=false");
    if (debug)
      console.log(
        `[CADENCE-DEBUG] ${lead.caseId} skip call: ${reasons.join(", ")}`,
      );
    return false;
  }

  const today = getTodayDateStr();
  const bizDay = businessDaysSinceCreation(lead.createdAt);

  // Reset callsToday if it's a new day
  let callsToday = lead.callsToday || 0;
  if (lead.callsTodayDate !== today) {
    callsToday = 0;
  }

  // Determine max calls allowed today based on business day
  let maxCallsToday;
  if (bizDay === 1) {
    maxCallsToday = 3; // Day 1: 3 calls
  } else if (bizDay === 2) {
    maxCallsToday = 2; // Day 2: 2 calls
  } else {
    maxCallsToday = 1; // Day 3+: 1 call per day
  }

  if (callsToday >= maxCallsToday) {
    reasons.push(
      `bizDay=${bizDay}, callsToday=${callsToday} >= max=${maxCallsToday}`,
    );
    if (debug)
      console.log(
        `[CADENCE-DEBUG] ${lead.caseId} skip call: ${reasons.join(", ")}`,
      );
    return false;
  }

  // Enforce 2-hour spacing between calls
  if (lead.lastCalledAt) {
    const msSinceLast = Date.now() - new Date(lead.lastCalledAt).getTime();
    const hoursSinceLast = msSinceLast / (1000 * 60 * 60);
    if (hoursSinceLast < 2) {
      reasons.push(`lastCalledAt ${hoursSinceLast.toFixed(1)}h ago (<2h)`);
      if (debug)
        console.log(
          `[CADENCE-DEBUG] ${lead.caseId} skip call: ${reasons.join(", ")}`,
        );
      return false;
    }
  }

  if (debug)
    console.log(
      `[CADENCE-DEBUG] ${lead.caseId} WILL call: bizDay=${bizDay}, callsToday=${callsToday}, max=${maxCallsToday}`,
    );
  return true;
}

/**
 * Determine if we should send a follow-up email right now.
 *
 * Chain: 5 emails, every other business day (days 2, 4, 6, 8, 10)
 * After chain: 1 email per week
 */
function shouldEmail(lead) {
  if (!lead.emailValid) return false;

  const bizDay = businessDaysSinceCreation(lead.createdAt);
  const sent = lead.emailsSent || 0;

  // Don't email on day 1 (welcome email covers that)
  if (bizDay < 2) return false;

  // Have we already emailed today?
  if (lead.lastEmailedAt) {
    const lastDate = new Date(
      new Date(lead.lastEmailedAt).toLocaleString("en-US", {
        timeZone: BUSINESS_TZ,
      }),
    );
    const todayDate = getNowPT();
    if (
      lastDate.getFullYear() === todayDate.getFullYear() &&
      lastDate.getMonth() === todayDate.getMonth() &&
      lastDate.getDate() === todayDate.getDate()
    ) {
      return false;
    }
  }

  if (sent < 5) {
    // Chain phase: every other business day starting day 2
    const expectedDay = 2 + sent * 2;
    return bizDay >= expectedDay;
  }

  // Weekly phase: 1 email per week after chain completes
  if (lead.lastEmailedAt) {
    const msSinceLast = Date.now() - new Date(lead.lastEmailedAt).getTime();
    const daysSinceLast = msSinceLast / (1000 * 60 * 60 * 24);
    return daysSinceLast >= 7;
  }

  return true;
}

/* -------------------------------------------------------------------------- */
/*                       CALL QUEUE PROCESSOR                                 */
/* -------------------------------------------------------------------------- */

/**
 * Process the call queue in batches.
 * Called after runCadenceTick queues up all eligible calls.
 */
async function processCallQueue(placeCall) {
  if (isProcessingQueue) {
    console.log("[CALL-QUEUE] Already processing — skipping");
    return;
  }

  if (callQueue.length === 0) {
    console.log("[CALL-QUEUE] Queue empty — nothing to process");
    return;
  }

  isProcessingQueue = true;
  console.log(
    `[CALL-QUEUE] ═══ Starting queue processor: ${callQueue.length} calls queued ═══`,
  );

  const today = getTodayDateStr();
  let batchNum = 0;

  while (callQueue.length > 0 && isBusinessHours()) {
    batchNum++;
    const batch = callQueue.splice(0, CALL_BATCH_SIZE);

    console.log(`[CALL-QUEUE] ── Batch ${batchNum}: ${batch.length} calls ──`);

    for (const item of batch) {
      try {
        console.log(
          `[CALL-QUEUE] Calling CaseID ${item.caseId} (${item.phone})...`,
        );

        const callResult = await placeCall({
          phone: item.phone,
          name: item.name,
        });

        // Update MongoDB
        await LeadCadence.updateOne(
          { _id: item._id },
          {
            $inc: { callsMade: 1, callsToday: 1 },
            $set: { lastCalledAt: new Date(), callsTodayDate: today },
          },
        );

        console.log(
          `[CALL-QUEUE] CaseID ${item.caseId}: ${callResult.ok ? "✓" : "✗ " + callResult.error}`,
        );

        // Small delay between individual calls in batch
        await new Promise((r) => setTimeout(r, 2000));
      } catch (err) {
        console.error(`[CALL-QUEUE] CaseID ${item.caseId} error:`, err.message);
      }
    }

    // If more calls remain, wait 5 minutes before next batch
    if (callQueue.length > 0) {
      console.log(
        `[CALL-QUEUE] ${callQueue.length} calls remaining — waiting 5 minutes...`,
      );
      await new Promise((r) => setTimeout(r, CALL_BATCH_INTERVAL_MS));

      // Re-check business hours after wait
      if (!isBusinessHours()) {
        console.log(
          `[CALL-QUEUE] Business hours ended — ${callQueue.length} calls deferred to tomorrow`,
        );
        break;
      }
    }
  }

  isProcessingQueue = false;
  console.log(`[CALL-QUEUE] ═══ Queue processor complete ═══`);
}

/**
 * Get current queue status
 */
function getQueueStatus() {
  return {
    queueLength: callQueue.length,
    isProcessing: isProcessingQueue,
  };
}

/**
 * Clear the call queue (for testing/admin)
 */
function clearCallQueue() {
  const count = callQueue.length;
  callQueue = [];
  return count;
}

/* -------------------------------------------------------------------------- */
/*                         MAIN CADENCE TICK                                  */
/* -------------------------------------------------------------------------- */

/**
 * Run one cadence cycle. Called by setInterval or cron.
 *
 * @param {object} actions - Injected action functions from webhook.js:
 *   {
 *     sendText(phone, name, textNum) → {ok, error?},
 *     placeCall(fields) → {ok, error?},
 *     sendFollowUpEmail(email, name, emailIndex) → {ok, error?}
 *   }
 */
async function runCadenceTick(actions) {
  if (!isBusinessHours()) {
    return { skipped: true, reason: "Outside business hours" };
  }

  const today = getTodayDateStr();
  const leads = await LeadCadence.find({ active: true }).lean();

  console.log(
    `[CADENCE] ══ Tick ══ ${leads.length} active lead(s) at ${today} ${getHourPT()}:00 PT`,
  );

  // ── Diagnostic summary ─────────────────────────────────────
  const dayCounts = { bizDay1: 0, bizDay2: 0, bizDay3plus: 0 };
  for (const lead of leads) {
    const bizDay = businessDaysSinceCreation(lead.createdAt);
    if (bizDay === 1) dayCounts.bizDay1++;
    else if (bizDay === 2) dayCounts.bizDay2++;
    else dayCounts.bizDay3plus++;
  }
  console.log(
    `[CADENCE] Lead age (business days): Day1=${dayCounts.bizDay1} (3 calls), Day2=${dayCounts.bizDay2} (2 calls), Day3+=${dayCounts.bizDay3plus} (1 call)`,
  );

  const results = [];
  const callsToQueue = [];

  for (const lead of leads) {
    const result = {
      caseId: lead.caseId,
      name: lead.name,
      actions: [],
    };

    try {
      // ── Check Logics status (silent unless error/deactivation) ──
      const caseInfo = await fetchCaseInfo("WYNN", lead.caseId);

      if (!caseInfo.ok) {
        // Only log failures
        console.warn(
          `[CADENCE] CaseID ${lead.caseId} — Logics fetch failed: ${caseInfo.error}`,
        );
        result.actions.push({
          type: "logics-check",
          ok: false,
          error: caseInfo.error,
        });
        results.push(result);
        continue;
      }

      const status = caseInfo.status;

      // Update last check (silent)
      await LeadCadence.updateOne(
        { _id: lead._id },
        { $set: { lastLogicsStatus: status, lastLogicsCheckAt: new Date() } },
      );

      if (!ACTIVE_STATUSES.includes(status)) {
        // Only log deactivations
        console.log(
          `[CADENCE] CaseID ${lead.caseId} — Status ${status} → deactivating`,
        );
        await LeadCadence.deleteOne({ _id: lead._id });
        result.actions.push({ type: "deactivated", status });
        results.push(result);
        continue;
      }

      // ── Reset callsToday if new day ────────────────────────
      if (lead.callsTodayDate !== today) {
        await LeadCadence.updateOne(
          { _id: lead._id },
          { $set: { callsToday: 0, callsTodayDate: today } },
        );
        lead.callsToday = 0;
        lead.callsTodayDate = today;
      }

      // ── TEXT ────────────────────────────────────────────────
      if (shouldText(lead)) {
        console.log(
          `[CADENCE] CaseID ${lead.caseId} — Sending text #${lead.textsSent + 1}`,
        );
        const textResult = await actions.sendText(
          lead.phone,
          lead.name,
          lead.textsSent + 1,
        );
        await LeadCadence.updateOne(
          { _id: lead._id },
          { $inc: { textsSent: 1 }, $set: { lastTextedAt: new Date() } },
        );
        result.actions.push({
          type: "text",
          num: lead.textsSent + 1,
          ...textResult,
        });
      }

      // ── CALL (queue instead of immediate) ──────────────────
      const willCall = shouldCall(lead, true); // Enable debug logging
      if (willCall) {
        console.log(
          `[CADENCE] CaseID ${lead.caseId} — Queuing call (today: ${(lead.callsToday || 0) + 1})`,
        );
        callsToQueue.push({
          _id: lead._id,
          caseId: lead.caseId,
          phone: lead.phone,
          name: lead.name,
          callsToday: (lead.callsToday || 0) + 1,
        });
        result.actions.push({
          type: "call-queued",
          position: callQueue.length + callsToQueue.length,
        });
      }

      // ── FOLLOW-UP EMAIL ────────────────────────────────────
      if (shouldEmail(lead)) {
        const emailIndex = lead.emailsSent + 1;
        console.log(
          `[CADENCE] CaseID ${lead.caseId} — Sending email #${emailIndex}`,
        );
        const emailResult = await actions.sendFollowUpEmail(
          lead.email,
          lead.name,
          emailIndex,
        );
        await LeadCadence.updateOne(
          { _id: lead._id },
          { $inc: { emailsSent: 1 }, $set: { lastEmailedAt: new Date() } },
        );
        result.actions.push({ type: "email", num: emailIndex, ...emailResult });
      }
    } catch (err) {
      console.error(`[CADENCE] CaseID ${lead.caseId} — Error:`, err.message);
      result.actions.push({ type: "error", error: err.message });
    }

    results.push(result);

    // Small delay between leads to avoid hammering APIs
    await new Promise((r) => setTimeout(r, 300));
  }

  // ── Add calls to queue and start processor ─────────────────
  if (callsToQueue.length > 0) {
    // Avoid duplicates: don't re-queue leads already in queue
    const existingIds = new Set(callQueue.map((c) => c._id.toString()));
    const newCalls = callsToQueue.filter(
      (c) => !existingIds.has(c._id.toString()),
    );

    callQueue.push(...newCalls);
    console.log(
      `[CADENCE] Queued ${newCalls.length} calls (${callsToQueue.length - newCalls.length} duplicates skipped). Total queue: ${callQueue.length}`,
    );

    // Start processing in background (don't await)
    processCallQueue(actions.placeCall).catch((err) =>
      console.error("[CALL-QUEUE] Processor error:", err.message),
    );
  }

  console.log(`[CADENCE] ══ Done ══ Processed ${results.length} lead(s)`);
  return {
    skipped: false,
    processed: results.length,
    callsQueued: callsToQueue.length,
    totalQueueSize: callQueue.length,
    results,
  };
}

module.exports = {
  runCadenceTick,
  isBusinessHours,
  getTodayDateStr,
  daysSinceCreation,
  shouldText,
  shouldCall,
  shouldEmail,
  getQueueStatus,
  clearCallQueue,
  processCallQueue,
  ACTIVE_STATUSES,
};
