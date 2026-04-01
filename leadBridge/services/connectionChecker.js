// services/connectionChecker.js
// ─────────────────────────────────────────────────────────────
// Polls RingCentral call log to detect lead connections.
// Called once at the top of each cadence tick.
//
// Two checks:
//
//   1. OUTBOUND RingOut results:
//      Our calls FROM 818-334-5087 TO lead phone numbers.
//      RC call log `result` field tells us exactly what happened:
//        "Accepted" / "Call connected" → lead answered → CONNECTED
//        "Voicemail"                   → went to VM → update lastCallResult
//        "Missed" / "No Answer"        → didn't pick up
//        "Busy" / "Rejected"           → line busy or rejected
//
//   2. INBOUND callbacks:
//      Calls FROM lead phone numbers TO 818-510-3402 (RVM queue).
//      If duration >= threshold → lead called back → CONNECTED
//
// On connection:
//   → day0Connected = true
//   → All outreach stops for the day
//   → Cadence resumes next day with Logics status check
//
// On voicemail:
//   → lastCallResult = "voicemail"
//   → nextOutreachType = "rvm" (triggers RVM on next action)
// ─────────────────────────────────────────────────────────────

const LeadCadence = require("../../shared/models/LeadCadence");

// Our outbound RingOut caller ID
const RINGOUT_NUMBER = (
  process.env.RING_CENTRAL_RINGOUT_CALLER || "8183345087"
).replace(/\D/g, "");

// RVM callback / inbound queue number
const RVM_QUEUE_NUMBER = (process.env.RVM_QUEUE_NUMBER || "8185103402").replace(
  /\D/g,
  "",
);

// Minimum seconds for an inbound callback to count as connected
const MIN_CALLBACK_SECONDS = 30;

// Minimum call duration (seconds) to consider lead "being worked"
// If a call lasted 5+ min and status is still 2, pause until tomorrow
const MIN_WORKED_DURATION = 300; // 5 minutes

// How far back to look (slightly over 5-min tick to avoid gaps)
const POLL_WINDOW_MINUTES = 7;

// RC call log result → our simplified result
const RESULT_MAP = {
  accepted: "answered",
  "call connected": "answered",
  voicemail: "voicemail",
  missed: "no_answer",
  "no answer": "no_answer",
  busy: "busy",
  rejected: "rejected",
  "hang up": "no_answer",
  declined: "rejected",
  "call failed": "failed",
  "call failure": "failed",
  "internal error": "failed",
  "no calling credit": "failed",
  "ip phone offline": "failed",
  "wrong number": "failed",
  blocked: "rejected",
  abandoned: "no_answer",
  stopped: "no_answer",
};

function mapRcResult(rcResult) {
  return RESULT_MAP[(rcResult || "").toLowerCase()] || "unknown";
}

/**
 * Normalize phone to 10 digits for comparison.
 */
function to10(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  if (d.length >= 10) return d.slice(-10);
  return d;
}

/**
 * Check RingCentral call log for connections and voicemail results.
 * Call this at the top of each cadence tick.
 *
 * @param {object} platform — RingCentral SDK platform instance
 * @returns {{ checked, connected, voicemails, callbacksDetected, errors }}
 */
async function checkForConnections(platform) {
  const since = new Date(Date.now() - POLL_WINDOW_MINUTES * 60 * 1000);

  console.log("[CONNECT-CHECK] ══════════════════════════════════════");
  console.log(`[CONNECT-CHECK] Polling since ${since.toISOString()}`);

  const results = {
    checked: 0,
    connected: 0,
    voicemails: 0,
    callbacksDetected: 0,
    errors: [],
  };

  try {
    // ── Get active leads for cross-reference ─────────────────
    const activeLeads = await LeadCadence.find(
      { active: true, day0Connected: { $ne: true } },
      { phone: 1, caseId: 1, _id: 1, lastCalledAt: 1 },
    ).lean();

    if (activeLeads.length === 0) {
      console.log("[CONNECT-CHECK] No active unconnected leads — skipping");
      console.log("[CONNECT-CHECK] ══════════════════════════════════════");
      return results;
    }

    // Build lookup: 10-digit phone → lead
    const phoneToLead = new Map();
    for (const lead of activeLeads) {
      const norm = to10(lead.phone);
      if (norm.length === 10) phoneToLead.set(norm, lead);
    }

    console.log(`[CONNECT-CHECK] ${phoneToLead.size} leads to check against`);

    // ── Poll RC call log ─────────────────────────────────────
    let records = [];
    try {
      const resp = await platform.get(
        "/restapi/v1.0/account/~/extension/~/call-log",
        {
          dateFrom: since.toISOString(),
          perPage: 250,
          view: "Simple",
        },
      );
      const data = await resp.json();
      records = data.records || [];
    } catch (err) {
      console.error("[CONNECT-CHECK] ✗ RC call log fetch failed:", err.message);
      results.errors.push(err.message);
      console.log("[CONNECT-CHECK] ══════════════════════════════════════");
      return results;
    }

    console.log(`[CONNECT-CHECK] ${records.length} call records found`);
    results.checked = records.length;

    const processedCaseIds = new Set();

    for (const call of records) {
      const direction = (call.direction || "").toLowerCase();
      const rcResult = call.result || "";
      const duration = call.duration || 0;
      const callTime = call.startTime || null;

      // ── OUTBOUND: Our RingOut calls ────────────────────────
      if (direction === "outbound") {
        const fromNum = to10(call.from?.phoneNumber || "");
        const toNum = to10(call.to?.phoneNumber || "");

        // Only our RingOut calls
        if (fromNum !== to10(RINGOUT_NUMBER)) continue;

        // Is the recipient one of our leads?
        if (!phoneToLead.has(toNum)) continue;

        const lead = phoneToLead.get(toNum);
        if (processedCaseIds.has(lead.caseId)) continue;

        const ourResult = mapRcResult(rcResult);

        // ── ANSWERED → check duration ─────────────────────
        if (ourResult === "answered") {
          processedCaseIds.add(lead.caseId);

          if (duration >= MIN_WORKED_DURATION) {
            // 5+ minute call — lead is being worked by a rep.
            // Pause outreach until tomorrow (skip rest of today).
            // Don't mark day0Connected permanently — they may still
            // need follow-up if status stays at 2.
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);

            console.log(
              `[CONNECT-CHECK] ☎ WORKED: CaseID ${lead.caseId} — ` +
                `RC result "${rcResult}", duration ${duration}s (${Math.round(duration / 60)}min) → pausing until tomorrow`,
            );

            await LeadCadence.updateOne(
              { _id: lead._id },
              {
                $set: {
                  lastCallResult: "answered",
                  lastCallDuration: duration,
                  lastConnectCallId: call.id || null,
                  pauseOutreachUntil: tomorrow,
                  nextOutreachType: null,
                },
              },
            );
            results.worked = (results.worked || 0) + 1;
          } else {
            // Short answered call — mark fully connected
            console.log(
              `[CONNECT-CHECK] ✓ ANSWERED: CaseID ${lead.caseId} — ` +
                `RC result "${rcResult}", duration ${duration}s`,
            );

            await LeadCadence.updateOne(
              { _id: lead._id },
              {
                $set: {
                  day0Connected: true,
                  day0ConnectedAt: new Date(callTime || Date.now()),
                  day0ConnectDuration: duration,
                  day0ConnectCallId: call.id || null,
                  lastCallResult: "answered",
                  nextOutreachType: null,
                },
              },
            );
            results.connected++;
          }
        }

        // ── VOICEMAIL → flag for RVM on next action ────────
        else if (ourResult === "voicemail") {
          processedCaseIds.add(lead.caseId);
          console.log(
            `[CONNECT-CHECK] 📩 VOICEMAIL: CaseID ${lead.caseId} — ` +
              `RC result "${rcResult}", duration ${duration}s → next action: RVM`,
          );

          await LeadCadence.updateOne(
            { _id: lead._id },
            {
              $set: {
                lastCallResult: "voicemail",
                nextOutreachType: "rvm",
              },
            },
          );
          results.voicemails++;
        }

        // ── NO ANSWER / BUSY / OTHER → update result ──────
        else if (
          ["no_answer", "busy", "rejected", "failed"].includes(ourResult)
        ) {
          // Don't mark as processed — allow another call later
          console.log(
            `[CONNECT-CHECK] ○ ${ourResult.toUpperCase()}: CaseID ${lead.caseId} — ` +
              `RC result "${rcResult}"`,
          );

          await LeadCadence.updateOne(
            { _id: lead._id },
            { $set: { lastCallResult: ourResult } },
          );
        }
      }

      // ── INBOUND: Lead calling back to RVM queue ────────────
      if (direction === "inbound") {
        const fromNum = to10(call.from?.phoneNumber || "");
        const toNum = to10(call.to?.phoneNumber || "");

        // Only calls TO our RVM queue number
        if (toNum !== to10(RVM_QUEUE_NUMBER)) continue;

        // Is the caller one of our leads?
        if (!phoneToLead.has(fromNum)) continue;

        const lead = phoneToLead.get(fromNum);
        if (processedCaseIds.has(lead.caseId)) continue;

        // Any inbound call to the queue with decent duration = connected
        if (duration >= MIN_CALLBACK_SECONDS) {
          processedCaseIds.add(lead.caseId);
          console.log(
            `[CONNECT-CHECK] ✓ CALLBACK: CaseID ${lead.caseId} — ` +
              `called ${RVM_QUEUE_NUMBER}, duration ${duration}s`,
          );

          await LeadCadence.updateOne(
            { _id: lead._id },
            {
              $set: {
                day0Connected: true,
                day0ConnectedAt: new Date(callTime || Date.now()),
                day0ConnectDuration: duration,
                day0ConnectCallId: call.id || null,
                lastCallResult: "answered",
                nextOutreachType: null,
              },
            },
          );
          results.connected++;
          results.callbacksDetected++;
        } else {
          console.log(
            `[CONNECT-CHECK] ○ SHORT CALLBACK: CaseID ${lead.caseId} — ` +
              `${duration}s (need ${MIN_CALLBACK_SECONDS}s)`,
          );
        }
      }
    }

    console.log(
      `[CONNECT-CHECK] Summary: ${results.connected} connected, ${results.worked || 0} worked (paused), ` +
        `${results.voicemails} voicemails, ${results.callbacksDetected} callbacks`,
    );
  } catch (err) {
    console.error("[CONNECT-CHECK] ✗ Error:", err.message);
    results.errors.push(err.message);
  }

  console.log("[CONNECT-CHECK] ══════════════════════════════════════");
  return results;
}

module.exports = {
  checkForConnections,
  mapRcResult,
  RESULT_MAP,
  RINGOUT_NUMBER,
  RVM_QUEUE_NUMBER,
  MIN_CALLBACK_SECONDS,
  MIN_WORKED_DURATION,
};
