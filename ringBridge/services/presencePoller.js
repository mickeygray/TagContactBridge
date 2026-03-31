// ringBridge/services/presencePoller.js
// ─────────────────────────────────────────────────────────────
// Periodically polls RC presence for all agents to catch
// missed webhook events. Reconciles stale dashboard state.
//
// Problem: If RC drops a NoCall webhook (or ngrok hiccups),
// an agent stays stuck in "onCall" with a timer that keeps
// counting. This poller detects the mismatch and corrects it.
//
// Default: every 30 seconds. Only polls agents who are
// currently shown as onCall, ringing, or disposition.
// ─────────────────────────────────────────────────────────────

const Agent = require('../models/Agent');
const rcAuthService = require('./rcAuthService');
const logicsLookup = require('./logicsLookupService');
const log = require('../utils/logger');

const POLL_INTERVAL_MS = parseInt(process.env.RB_POLL_INTERVAL_MS) || 30000;
const STALE_THRESHOLD_MS = parseInt(process.env.RB_STALE_THRESHOLD_MS) || 120000; // 2 min

let pollTimer = null;
let isPolling = false;

function start() {
  const { isAuthenticated } = rcAuthService.getAuthStatus();
  if (!isAuthenticated) {
    log.warn('[Poller] RC not authenticated — presence polling disabled');
    return;
  }

  log.info(`[Poller] Starting presence poll every ${POLL_INTERVAL_MS / 1000}s (stale threshold: ${STALE_THRESHOLD_MS / 1000}s)`);

  pollTimer = setInterval(async () => {
    if (isPolling) return; // skip if previous poll still running
    isPolling = true;
    try {
      await pollActiveAgents();
    } catch (err) {
      log.warn(`[Poller] Error: ${err.message}`);
    }
    isPolling = false;
  }, POLL_INTERVAL_MS);
}

function stop() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    log.info('[Poller] Stopped');
  }
}

async function pollActiveAgents() {
  // Only poll agents who might be stale — active states
  const activeStates = ['onCall', 'ringing', 'disposition'];
  const agents = await Agent.find({ status: { $in: activeStates } });

  if (agents.length === 0) return; // nothing to check

  for (const agent of agents) {
    try {
      const presence = await rcAuthService.getPresence(agent.extensionId);
      if (!presence) continue;

      const rcTelephony = presence.telephonyStatus || 'NoCall';
      const rcPresence = presence.presenceStatus || 'Available';
      const activeCalls = presence.activeCalls || [];

      // Detect mismatch
      const mismatch = detectMismatch(agent, rcTelephony, rcPresence, activeCalls);

      if (mismatch) {
        log.pipe('POLL-FIX', agent.name, mismatch.reason);
        await reconcileAgent(agent, rcTelephony, rcPresence, activeCalls, mismatch);
      }
    } catch (err) {
      // Don't log every poll failure — rate limits happen
      if (!err.message?.includes('Rate limited')) {
        log.warn(`[Poller] Failed for ${agent.name}: ${err.message}`);
      }
    }

    // Small delay between agents to avoid rate limits
    await sleep(500);
  }
}

/**
 * Detect if dashboard state doesn't match RC reality
 */
function detectMismatch(agent, rcTelephony, rcPresence, activeCalls) {
  const now = Date.now();
  const sinceLastEvent = now - (agent.lastEventReceived?.getTime() || 0);
  const sinceStatusChange = now - (agent.lastStatusChange?.getTime() || 0);

  // Agent shows onCall but RC says NoCall — missed the hangup event
  if (agent.status === 'onCall' && rcTelephony === 'NoCall') {
    return {
      type: 'stuck_oncall',
      reason: `Shows onCall but RC says NoCall (stale ${Math.round(sinceLastEvent / 1000)}s) — missed NoCall webhook`,
    };
  }

  // Agent shows ringing but RC says NoCall — missed the end-ring event
  if (agent.status === 'ringing' && rcTelephony === 'NoCall') {
    return {
      type: 'stuck_ringing',
      reason: `Shows ringing but RC says NoCall (stale ${Math.round(sinceLastEvent / 1000)}s) — missed transition`,
    };
  }

  // Agent in disposition for too long with no webhook — auto-clear
  if (agent.status === 'disposition' && sinceStatusChange > STALE_THRESHOLD_MS && rcTelephony === 'NoCall') {
    return {
      type: 'stuck_disposition',
      reason: `Stuck in disposition for ${Math.round(sinceStatusChange / 1000)}s, RC says NoCall — auto-clearing`,
    };
  }

  // Agent shows onCall but RC says they're on a DIFFERENT call
  // (they hung up and started a new call, we missed the NoCall in between)
  if (agent.status === 'onCall' && rcTelephony === 'CallConnected' && activeCalls.length > 0) {
    const rcSession = activeCalls[0]?.sessionId;
    if (agent.currentCall?.sessionId && rcSession && rcSession !== agent.currentCall.sessionId) {
      return {
        type: 'session_mismatch',
        reason: `Dashboard session ${agent.currentCall.sessionId} but RC on session ${rcSession} — missed hangup + new call`,
      };
    }
  }

  return null; // all good
}

/**
 * Fix the agent state to match RC reality
 */
async function reconcileAgent(agent, rcTelephony, rcPresence, activeCalls, mismatch) {
  const { broadcastSSE } = require('../engine/stateEngine');
  const previousStatus = agent.status;
  const previousCall = agent.currentCall ? { ...agent.currentCall.toObject?.() || agent.currentCall } : null;

  switch (mismatch.type) {
    case 'stuck_oncall':
    case 'stuck_ringing': {
      // End the phantom call
      agent.status = 'available';
      agent.lastStatusChange = new Date();
      agent.currentCall = {};
      await agent.save();

      // Also close the ContactActivity if open
      logicsLookup.onCallEnd(agent, previousCall || {}).catch(err =>
        log.warn(`[Poller] ContactActivity close failed: ${err.message}`)
      );
      break;
    }

    case 'stuck_disposition': {
      agent.status = 'available';
      agent.lastStatusChange = new Date();
      agent.currentCall = {};
      await agent.save();
      break;
    }

    case 'session_mismatch': {
      // Close old call, start new one
      logicsLookup.onCallEnd(agent, previousCall || {}).catch(() => {});

      const activeCall = activeCalls[0];
      agent.status = 'onCall';
      agent.activePlatform = 'EX';
      agent.lastStatusChange = new Date();
      agent.currentCall = {
        sessionId: activeCall.sessionId,
        telephonySessionId: activeCall.telephonySessionId,
        direction: activeCall.direction,
        from: activeCall.from,
        fromName: activeCall.fromName,
        to: activeCall.to,
        startTime: activeCall.startTime ? new Date(activeCall.startTime) : new Date(),
      };
      await agent.save();

      logicsLookup.onCallStart(agent, activeCall).catch(() => {});
      break;
    }
  }

  // Broadcast corrected state
  broadcastSSE('agentUpdate', {
    extensionId: agent.extensionId,
    name: agent.name,
    company: agent.company,
    status: agent.status,
    previousStatus,
    exTelephonyStatus: rcTelephony,
    exPresenceStatus: rcPresence,
    currentCall: agent.currentCall,
    lastStatusChange: agent.lastStatusChange,
    lastEventReceived: agent.lastEventReceived,
    dailyStats: agent.dailyStats,
  });

  log.pipeOk('POLL-FIX', agent.name, `${previousStatus} → ${agent.status}`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { start, stop, pollActiveAgents };
