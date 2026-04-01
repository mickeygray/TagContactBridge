// ringBridge/cx/services/cxEventListener.js
// ─────────────────────────────────────────────────────────────
// Long-polls the CX get-next-event endpoint for each mapped agent.
// When events arrive, routes them to the appropriate handler:
//   - AgentStateChange → log, sync back if needed
//   - CallContactEvent → track new call
//   - ContactEndEvent → trigger auto-disposition
//
// Also hooks into the EX stateEngine to sync EX → CX.
// ─────────────────────────────────────────────────────────────

const cxAuth = require("./cxAuthService");
const { syncAgentState, CxAgentMap } = require("./cxAgentBridge");
const { processCallEnd } = require("./cxDispositionService");
const log = require("../../utils/logger");

let running = false;
const activePollers = new Map(); // cxAgentId → abort controller

// ─── Start/Stop ──────────────────────────────────────────────

async function start() {
  if (!cxAuth.isConfigured()) {
    log.info("[CX-EVENTS] CX not configured — event listener disabled");
    return;
  }

  running = true;
  log.info("[CX-EVENTS] Starting event listeners for mapped agents...");

  const agents = await CxAgentMap.find().lean();
  for (const agent of agents) {
    startAgentPoller(agent.cxAgentId, agent.agentName, agent.extensionId);
  }

  log.info(`[CX-EVENTS] ${agents.length} agent poller(s) started`);
}

function stop() {
  running = false;
  for (const [agentId, controller] of activePollers) {
    controller.abort();
    log.info(`[CX-EVENTS] Stopped poller for agent ${agentId}`);
  }
  activePollers.clear();
}

// ─── Per-Agent Long Poller ───────────────────────────────────

function startAgentPoller(cxAgentId, agentName, extensionId) {
  if (activePollers.has(cxAgentId)) return; // already polling

  const controller = new AbortController();
  activePollers.set(cxAgentId, controller);

  (async () => {
    log.pipe("CX-EVENTS", agentName, `Poller started for CX agent ${cxAgentId}`);

    while (running && !controller.signal.aborted) {
      try {
        const data = await cxAuth.apiCall("get", `/agents/${cxAgentId}/get-next-event`);
        const events = data?.events || [];

        for (const event of events) {
          await handleEvent(event, { cxAgentId, agentName, extensionId });
        }
      } catch (err) {
        if (controller.signal.aborted) break;
        log.pipeFail("CX-EVENTS", agentName, `Poll error: ${err.message}`);
        // Backoff on error
        await sleep(5000);
      }
    }

    log.pipe("CX-EVENTS", agentName, "Poller stopped");
  })();
}

// ─── Event Router ────────────────────────────────────────────

async function handleEvent(event, context) {
  const { cxAgentId, agentName, extensionId } = context;

  switch (event.Type) {
    case "AgentStateChange":
      log.pipe("CX-EVENT", agentName, `State: ${event.OldState} → ${event.NewState}`);
      break;

    case "CallContactEvent":
      log.pipe("CX-EVENT", agentName, `Call: ${event.ANI || "?"} → ${event.Status} (skill: ${event.SkillName || event.SkillId})`);
      break;

    case "ContactEndEvent":
      log.pipe("CX-EVENT", agentName, `Call ended: contact ${event.ContactId}`);
      try {
        await processCallEnd({
          contactId: event.ContactId,
          agentId: cxAgentId,
          agentName,
          extensionId,
          fromAddr: event.ANI || event.FromAddr,
          skillId: event.SkillId,
          skillName: event.SkillName,
          startTime: event.StartTime,
          endTime: event.EndTime || new Date().toISOString(),
          durationSeconds: event.DurationSeconds || 0,
          isInbound: event.IsInbound,
        });
      } catch (err) {
        log.pipeFail("CX-EVENT", agentName, `Disposition failed: ${err.message}`);
      }
      break;

    default:
      // Log unknown events at debug level
      log.pipe("CX-EVENT", agentName, `${event.Type}: ${JSON.stringify(event).slice(0, 100)}`);
  }
}

// ─── EX State Hook ───────────────────────────────────────────
// Call this from stateEngine whenever an EX agent state changes.
// It syncs the state to CX via the agent bridge.

async function onExStateChange(extensionId, newState) {
  try {
    await syncAgentState(extensionId, newState);
  } catch (err) {
    log.pipeFail("CX-SYNC", extensionId, `EX→CX sync error: ${err.message}`);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { start, stop, onExStateChange };
