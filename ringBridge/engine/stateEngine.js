const Agent = require('../models/Agent');
const EventLog = require('../models/EventLog');
const log = require('../utils/logger');
const logicsLookup = require('../services/logicsLookupService');

// SSE clients for real-time dashboard updates
const sseClients = new Set();

function addSSEClient(res) {
  sseClients.add(res);
  res.on('close', () => sseClients.delete(res));
}

function broadcastSSE(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(payload); } catch (e) { sseClients.delete(client); }
  }
}

/**
 * Process a presence event from RingEX webhook
 */
async function processPresenceEvent(event) {
  const { extensionId, telephonyStatus, presenceStatus, activeCalls } = event.body || {};

  if (!extensionId) {
    log.warn('Received presence event with no extensionId');
    return;
  }

  const extId = extensionId.toString();
  const agent = await Agent.findOne({ extensionId: extId });

  if (!agent) {
    log.warn(`Received event for unknown extension ${extId} — ignoring`);
    return;
  }

  agent.checkDailyReset();

  const previousStatus = agent.status;
  const previousTelephony = agent.exTelephonyStatus;

  // Update raw EX state
  agent.exTelephonyStatus = telephonyStatus || agent.exTelephonyStatus;
  agent.exPresenceStatus = presenceStatus || agent.exPresenceStatus;
  agent.lastEventReceived = new Date();

  // Extract active call details
  const activeCall = activeCalls?.[0] || null;
  // Snapshot current call before state machine may clear it (needed for enrichment on NoCall)
  const previousCall = agent.currentCall ? { ...agent.currentCall.toObject?.() || agent.currentCall } : null;

  // State machine logic
  let newStatus = agent.status;

  switch (telephonyStatus) {
    case 'Ringing':
      newStatus = 'ringing';
      if (activeCall) {
        agent.currentCall = {
          sessionId: activeCall.sessionId,
          telephonySessionId: activeCall.telephonySessionId,
          direction: activeCall.direction,
          from: activeCall.from,
          fromName: activeCall.fromName,
          to: activeCall.to,
          startTime: activeCall.startTime ? new Date(activeCall.startTime) : new Date()
        };
      }
      break;

    case 'CallConnected':
      newStatus = 'onCall';
      agent.activePlatform = 'EX';
      if (activeCall && !agent.currentCall?.sessionId) {
        agent.currentCall = {
          sessionId: activeCall.sessionId,
          telephonySessionId: activeCall.telephonySessionId,
          direction: activeCall.direction,
          from: activeCall.from,
          fromName: activeCall.fromName,
          to: activeCall.to,
          startTime: activeCall.startTime ? new Date(activeCall.startTime) : new Date()
        };
      }
      // Increment call counter on connect
      if (previousStatus !== 'onCall') {
        agent.dailyStats.totalCalls += 1;
      }
      break;

    case 'NoCall':
      // Only transition if they were actually on a call
      if (['onCall', 'ringing'].includes(agent.status)) {
        newStatus = 'disposition';
        // Clear call details but keep for logging
        agent.currentCall = {};
      }
      // If they were already available/away/offline, NoCall is just confirmation
      break;

    default:
      // Unknown telephony status — log but don't change state
      if (telephonyStatus) {
        log.warn(`Unknown telephonyStatus: ${telephonyStatus} for ext ${extId}`);
      }
      break;
  }

  // Handle presence-only updates (no telephony change)
  if (!telephonyStatus && presenceStatus) {
    switch (presenceStatus) {
      case 'Available':
        if (agent.status === 'offline' || agent.status === 'away') {
          newStatus = 'available';
        }
        break;
      case 'DoNotDisturb':
        newStatus = 'away';
        break;
      case 'Offline':
        newStatus = 'offline';
        agent.activePlatform = 'none';
        break;
    }
  }

  // Apply state change
  if (newStatus !== previousStatus) {
    agent.status = newStatus;
    agent.lastStatusChange = new Date();

    log.event(extId, `${agent.name}: ${previousStatus} → ${newStatus} (tel: ${previousTelephony} → ${telephonyStatus || 'unchanged'})`);
  }

  await agent.save();

  // Log the event
  const eventLog = new EventLog({
    extensionId: extId,
    agentName: agent.name,
    eventType: telephonyStatus ? (telephonyStatus === 'NoCall' ? 'call_end' : 'call_start') : 'presence_change',
    previousStatus,
    newStatus: agent.status,
    source: 'EX_webhook',
    rawPayload: event.body,
    callDetails: activeCall ? {
      direction: activeCall.direction,
      from: activeCall.from,
      fromName: activeCall.fromName,
      to: activeCall.to,
      sessionId: activeCall.sessionId,
      telephonySessionId: activeCall.telephonySessionId
    } : undefined
  });
  await eventLog.save();

  // Broadcast to SSE clients for real-time dashboard
  broadcastSSE('agentUpdate', {
    extensionId: extId,
    name: agent.name,
    company: agent.company,
    status: agent.status,
    previousStatus,
    exTelephonyStatus: agent.exTelephonyStatus,
    exPresenceStatus: agent.exPresenceStatus,
    currentCall: agent.currentCall,
    lastStatusChange: agent.lastStatusChange,
    lastEventReceived: agent.lastEventReceived,
    dailyStats: agent.dailyStats
  });

  // ─── Contact Activity Enrichment ─────────────────────────
  // Fire-and-forget: don't block webhook processing
  if (telephonyStatus === 'CallConnected' && previousStatus !== 'onCall') {
    logicsLookup.onCallStart(agent, activeCall).catch(err =>
      log.warn(`ContactActivity call start failed: ${err.message}`)
    );
  }
  if (telephonyStatus === 'NoCall' && ['onCall', 'ringing'].includes(previousStatus)) {
    logicsLookup.onCallEnd(agent, previousCall || activeCall).catch(err =>
      log.warn(`ContactActivity call end failed: ${err.message}`)
    );
  }

  return { previousStatus, newStatus: agent.status, agent };
}

/**
 * Process a disposition from the agent widget
 */
async function processDisposition(extensionId, type) {
  const agent = await Agent.findOne({ extensionId: extensionId.toString() });
  if (!agent) throw new Error(`Unknown extension: ${extensionId}`);

  agent.checkDailyReset();

  const previousStatus = agent.status;

  // Log disposition
  if (type === 'good') agent.dailyStats.goodCalls += 1;
  if (type === 'bad') agent.dailyStats.badCalls += 1;

  // Transition to available
  agent.status = 'available';
  agent.lastStatusChange = new Date();
  agent.currentCall = {};

  await agent.save();

  // Log it
  const eventLog = new EventLog({
    extensionId: extensionId.toString(),
    agentName: agent.name,
    eventType: 'disposition',
    previousStatus,
    newStatus: 'available',
    source: 'widget',
    rawPayload: { dispositionType: type }
  });
  await eventLog.save();

  log.event(extensionId, `${agent.name}: disposition (${type}) → available`);

  // Update ContactActivity with disposition
  logicsLookup.onDisposition(extensionId, type).catch(err =>
    log.warn(`ContactActivity disposition update failed: ${err.message}`)
  );

  broadcastSSE('agentUpdate', {
    extensionId: extensionId.toString(),
    name: agent.name,
    company: agent.company,
    status: 'available',
    previousStatus,
    exTelephonyStatus: agent.exTelephonyStatus,
    exPresenceStatus: agent.exPresenceStatus,
    currentCall: {},
    lastStatusChange: agent.lastStatusChange,
    lastEventReceived: agent.lastEventReceived,
    dailyStats: agent.dailyStats
  });

  return agent;
}

/**
 * Manual status toggle from widget
 */
async function toggleStatus(extensionId, targetStatus) {
  const agent = await Agent.findOne({ extensionId: extensionId.toString() });
  if (!agent) throw new Error(`Unknown extension: ${extensionId}`);

  const previousStatus = agent.status;
  agent.status = targetStatus;
  agent.lastStatusChange = new Date();
  await agent.save();

  const eventLog = new EventLog({
    extensionId: extensionId.toString(),
    agentName: agent.name,
    eventType: 'manual_toggle',
    previousStatus,
    newStatus: targetStatus,
    source: 'widget'
  });
  await eventLog.save();

  log.event(extensionId, `${agent.name}: manual toggle ${previousStatus} → ${targetStatus}`);

  broadcastSSE('agentUpdate', {
    extensionId: extensionId.toString(),
    name: agent.name,
    company: agent.company,
    status: targetStatus,
    previousStatus,
    exTelephonyStatus: agent.exTelephonyStatus,
    exPresenceStatus: agent.exPresenceStatus,
    currentCall: agent.currentCall,
    lastStatusChange: agent.lastStatusChange,
    lastEventReceived: agent.lastEventReceived,
    dailyStats: agent.dailyStats
  });

  return agent;
}

/**
 * Get all agents current state (for dashboard)
 */
async function getAllAgentStates() {
  const agents = await Agent.find({}).sort({ company: 1, name: 1 });
  return agents.map(a => ({
    extensionId: a.extensionId,
    name: a.name,
    company: a.company,
    status: a.status,
    exTelephonyStatus: a.exTelephonyStatus,
    exPresenceStatus: a.exPresenceStatus,
    currentCall: a.currentCall,
    activePlatform: a.activePlatform,
    lastStatusChange: a.lastStatusChange,
    lastEventReceived: a.lastEventReceived,
    dailyStats: a.dailyStats,
    hasWebhook: !!a.webhookSubscriptionId
  }));
}

module.exports = {
  processPresenceEvent,
  processDisposition,
  toggleStatus,
  getAllAgentStates,
  addSSEClient,
  broadcastSSE
};
