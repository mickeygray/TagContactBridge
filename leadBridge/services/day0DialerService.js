// services/day0DialerService.js
// ─────────────────────────────────────────────────────────────
// Day 0 "Speed to Lead" Dialer
//
// Handles the critical first-contact window for new leads:
//   - 5 min after lead arrives → dial
//   - 15 min mark → dial (if no connect)
//   - 2 hour mark → dial (if no connect)
//
// Polls CallRail to check if a real conversation happened
// (duration >= 60 seconds = connected)
//
// After Day 0 window closes, regular cadence engine takes over.
// ─────────────────────────────────────────────────────────────

const axios = require("axios");
const LeadCadence = require("../../shared/models/LeadCadence");

// CallRail config
const CALLRAIL_ACCOUNT_ID = process.env.CALL_RAIL_ACCOUNT_ID;
const CALLRAIL_COMPANY_ID = process.env.CALL_RAIL_COMPANY_ID;
const CALLRAIL_KEY = process.env.CALL_RAIL_KEY;
const CALLRAIL_BASE = `https://api.callrail.com/v3/a/${CALLRAIL_ACCOUNT_ID}`;

// Day 0 schedule (minutes after creation)
const DIAL_SCHEDULE = [5, 15, 120]; // 5min, 15min, 2hr

// Minimum seconds to count as "connected" (real conversation)
const MIN_CONNECT_DURATION = 180;

// Track scheduled dials (leadId -> timeouts)
const scheduledDials = new Map();

/* -------------------------------------------------------------------------- */
/*                            CALLRAIL POLLING                                */
/* -------------------------------------------------------------------------- */

/**
 * Check CallRail for recent calls to a phone number.
 * Returns connection info if there's a call with duration >= MIN_CONNECT_DURATION
 */
async function checkCallRailForConnection(phoneNumber, sinceMinutes = 20) {
  const logPrefix = "[DAY0-CALLRAIL]";

  try {
    if (!CALLRAIL_KEY || !CALLRAIL_ACCOUNT_ID) {
      console.warn(`${logPrefix} ⚠ Missing CallRail credentials`);
      return { connected: false, error: "Missing CallRail credentials" };
    }

    const digits = (phoneNumber || "").replace(/\D/g, "");
    if (!digits || digits.length < 10) {
      console.log(`${logPrefix} ✗ Invalid phone number: ${phoneNumber}`);
      return { connected: false, error: "Invalid phone" };
    }

    // Get calls from the last N minutes
    const startDate = new Date(Date.now() - sinceMinutes * 60 * 1000);

    console.log(
      `${logPrefix} Polling for calls to ${digits} since ${startDate.toISOString()}`,
    );

    const response = await axios.get(`${CALLRAIL_BASE}/calls.json`, {
      headers: {
        Authorization: `Token token=${CALLRAIL_KEY}`,
      },
      params: {
        company_id: CALLRAIL_COMPANY_ID,
        start_date: startDate.toISOString(),
        per_page: 50,
        sort: "start_time",
        order: "desc",
      },
      timeout: 10000,
    });

    const calls = response.data.calls || [];
    console.log(`${logPrefix} Found ${calls.length} recent calls`);

    // Find calls to/from this number with sufficient duration
    for (const call of calls) {
      const callPhone = (call.customer_phone_number || "").replace(/\D/g, "");

      // Match phone (with or without leading 1)
      const isMatch =
        callPhone === digits ||
        callPhone === `1${digits}` ||
        `1${callPhone}` === digits ||
        callPhone.slice(-10) === digits.slice(-10);

      if (isMatch) {
        const duration = call.duration || 0;
        const status = call.call_type || call.status || "unknown";

        console.log(
          `${logPrefix} Found call: duration=${duration}s, status=${status}, answered=${call.answered}`,
        );

        if (duration >= MIN_CONNECT_DURATION) {
          console.log(
            `${logPrefix} ✓ CONNECTED! Call to ${digits} lasted ${duration}s (>= ${MIN_CONNECT_DURATION}s threshold)`,
          );
          return {
            connected: true,
            duration,
            callId: call.id,
            answeredAt: call.answered_at || call.start_time,
            status,
          };
        }
      }
    }

    console.log(`${logPrefix} No connected calls found for ${digits}`);
    return { connected: false };
  } catch (err) {
    const errMsg = err.response?.data?.error || err.message;
    console.error(`${logPrefix} ✗ API error: ${errMsg}`);
    return { connected: false, error: errMsg };
  }
}

/* -------------------------------------------------------------------------- */
/*                         DAY 0 DIAL SCHEDULER                               */
/* -------------------------------------------------------------------------- */

/**
 * Schedule Day 0 dials for a new lead.
 * Called immediately when a lead is saved to MongoDB.
 *
 * @param {Object} lead - The lead document from MongoDB
 * @param {Function} dialFunction - The function to place calls (dialLeadNow)
 */
function scheduleDay0Dials(lead, dialFunction) {
  const leadId = lead._id.toString();
  const caseId = lead.caseId;
  const createdAt = new Date(lead.createdAt).getTime();

  console.log(
    `[DAY0] ════════════════════════════════════════════════════════════`,
  );
  console.log(`[DAY0] Scheduling Day 0 dials for CaseID ${caseId}`);
  console.log(`[DAY0]   Lead ID: ${leadId}`);
  console.log(`[DAY0]   Phone: ${lead.phone}`);
  console.log(`[DAY0]   Created: ${new Date(createdAt).toISOString()}`);

  // Don't double-schedule
  if (scheduledDials.has(leadId)) {
    console.log(
      `[DAY0] ⚠ Lead ${caseId} already has scheduled dials — skipping`,
    );
    console.log(
      `[DAY0] ════════════════════════════════════════════════════════════`,
    );
    return;
  }

  const timeouts = [];

  for (let i = 0; i < DIAL_SCHEDULE.length; i++) {
    const dialMinutes = DIAL_SCHEDULE[i];
    const dialTime = createdAt + dialMinutes * 60 * 1000;
    const delay = dialTime - Date.now();

    if (delay > 0) {
      const timeout = setTimeout(async () => {
        await executeDay0Dial(lead, i, dialFunction);
      }, delay);

      timeouts.push(timeout);

      const delayMin = Math.round(delay / 60000);
      const delayStr =
        delayMin >= 60
          ? `${Math.floor(delayMin / 60)}h ${delayMin % 60}m`
          : `${delayMin}m`;

      console.log(
        `[DAY0]   ⏱ Dial #${i + 1} (${dialMinutes}min mark): scheduled in ${delayStr}`,
      );
    } else {
      console.log(
        `[DAY0]   ⏭ Dial #${i + 1} (${dialMinutes}min mark): time already passed`,
      );
    }
  }

  if (timeouts.length > 0) {
    scheduledDials.set(leadId, timeouts);
    console.log(
      `[DAY0] ✓ ${timeouts.length} dial(s) scheduled for CaseID ${caseId}`,
    );
  } else {
    console.log(
      `[DAY0] ⚠ No dials scheduled (all times passed) for CaseID ${caseId}`,
    );
  }

  console.log(
    `[DAY0] ════════════════════════════════════════════════════════════`,
  );
}

/**
 * Execute a Day 0 dial attempt.
 * Checks CallRail first to see if already connected.
 */
async function executeDay0Dial(lead, dialIndex, dialFunction) {
  const leadId = lead._id.toString();
  const caseId = lead.caseId;
  const dialNum = dialIndex + 1;
  const dialMark = DIAL_SCHEDULE[dialIndex];

  console.log(
    `[DAY0] ┌─────────────────────────────────────────────────────────────┐`,
  );
  console.log(
    `[DAY0] │ EXECUTING DIAL #${dialNum} (${dialMark}min mark) for CaseID ${caseId}`,
  );
  console.log(
    `[DAY0] └─────────────────────────────────────────────────────────────┘`,
  );

  try {
    // Refresh lead from DB to get latest state
    const freshLead = await LeadCadence.findById(leadId).lean();

    if (!freshLead) {
      console.log(
        `[DAY0] ✗ Lead ${caseId} no longer exists in database — canceling all dials`,
      );
      cancelDay0Dials(leadId);
      return;
    }

    if (!freshLead.active) {
      console.log(
        `[DAY0] ✗ Lead ${caseId} is no longer active — canceling all dials`,
      );
      cancelDay0Dials(leadId);
      return;
    }

    if (freshLead.day0Connected) {
      console.log(
        `[DAY0] ✓ Lead ${caseId} already marked as connected — skipping dial`,
      );
      cancelDay0Dials(leadId);
      return;
    }

    // Check CallRail for recent connection BEFORE dialing
    console.log(`[DAY0] Checking CallRail for existing connection...`);
    /*    const callCheck = await checkCallRailForConnection(freshLead.phone);

    if (callCheck.connected) {
      console.log(`[DAY0] ✓ Found existing connection in CallRail!`);
      console.log(`[DAY0]   Duration: ${callCheck.duration}s`);
      console.log(`[DAY0]   Call ID: ${callCheck.callId}`);

      await LeadCadence.updateOne(
        { _id: leadId },
        {
          $set: {
            day0Connected: true,
            day0ConnectedAt: new Date(callCheck.answeredAt || Date.now()),
            day0ConnectDuration: callCheck.duration,
            day0ConnectCallId: callCheck.callId,
          },
        },
      );

      console.log(
        `[DAY0] ✓ Marked lead as connected — canceling remaining dials`,
      );
      cancelDay0Dials(leadId);
      return;
    }
*/
    // No connection found — place the call
    console.log(`[DAY0] No existing connection — placing dial #${dialNum}...`);

    const dialResult = await dialFunction({
      phone: freshLead.phone,
      name: freshLead.name,
    });

    // Update lead with dial attempt
    const updateResult = await LeadCadence.updateOne(
      { _id: leadId },
      {
        $inc: { day0CallsMade: 1, callsMade: 1 },
        $set: { lastCalledAt: new Date() },
      },
    );

    if (dialResult.ok) {
      console.log(`[DAY0] ✓ Dial #${dialNum} placed successfully`);
      console.log(`[DAY0]   RingOut ID: ${dialResult.ringOutId || "N/A"}`);
    } else {
      console.log(`[DAY0] ✗ Dial #${dialNum} failed: ${dialResult.error}`);
    }

    console.log(
      `[DAY0]   Total Day 0 calls: ${(freshLead.day0CallsMade || 0) + 1}`,
    );
  } catch (err) {
    console.error(
      `[DAY0] ✗ Error executing dial #${dialNum} for CaseID ${caseId}:`,
      err.message,
    );
  }

  console.log(
    `[DAY0] ─────────────────────────────────────────────────────────────`,
  );
}

/**
 * Cancel all scheduled Day 0 dials for a lead.
 */
function cancelDay0Dials(leadId) {
  const id = leadId.toString();
  const timeouts = scheduledDials.get(id);

  if (timeouts) {
    timeouts.forEach((t) => clearTimeout(t));
    scheduledDials.delete(id);
    console.log(
      `[DAY0] ⏹ Canceled ${timeouts.length} scheduled dial(s) for lead ${id}`,
    );
  }
}

/**
 * Resume Day 0 dials for leads that were in progress when server restarted.
 * Call this on server startup.
 *
 * @param {Function} dialFunction - The function to place calls (dialLeadNow)
 */
async function resumeDay0Dials(dialFunction) {
  console.log(
    `[DAY0] ══════════════════════════════════════════════════════════════`,
  );
  console.log(`[DAY0] STARTUP: Checking for leads needing Day 0 dials...`);

  try {
    // Find leads created in the last 2.5 hours that haven't connected
    const windowStart = new Date(Date.now() - 150 * 60 * 1000); // 2.5hr window

    const leads = await LeadCadence.find({
      active: true,
      day0Connected: { $ne: true },
      phoneConnected: true,
      createdAt: { $gte: windowStart },
    }).lean();

    console.log(`[DAY0] Found ${leads.length} lead(s) in Day 0 window`);

    for (const lead of leads) {
      const minutesSinceCreation = Math.round(
        (Date.now() - new Date(lead.createdAt).getTime()) / 60000,
      );
      console.log(
        `[DAY0]   CaseID ${lead.caseId}: ${minutesSinceCreation}min old, ${lead.day0CallsMade || 0} Day 0 calls made`,
      );
      scheduleDay0Dials(lead, dialFunction);
    }
  } catch (err) {
    console.error(`[DAY0] ✗ Error resuming Day 0 dials:`, err.message);
  }

  console.log(
    `[DAY0] ══════════════════════════════════════════════════════════════`,
  );
}

/**
 * Get status of Day 0 dialer (for admin/debugging)
 */
function getDay0Status() {
  return {
    scheduledLeads: scheduledDials.size,
    leadIds: Array.from(scheduledDials.keys()),
    dialSchedule: DIAL_SCHEDULE,
    minConnectDuration: MIN_CONNECT_DURATION,
  };
}

/**
 * Clear all scheduled Day 0 dials (for testing/admin)
 */
function clearAllDay0Dials() {
  const count = scheduledDials.size;
  for (const [leadId, timeouts] of scheduledDials) {
    timeouts.forEach((t) => clearTimeout(t));
  }
  scheduledDials.clear();
  console.log(`[DAY0] Cleared all scheduled dials (${count} leads)`);
  return count;
}

module.exports = {
  scheduleDay0Dials,
  cancelDay0Dials,
  resumeDay0Dials,
  checkCallRailForConnection,
  getDay0Status,
  clearAllDay0Dials,
  DIAL_SCHEDULE,
  MIN_CONNECT_DURATION,
};
