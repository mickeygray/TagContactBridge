// ringBridge/cx/services/cxAgentBridge.js
// ─────────────────────────────────────────────────────────────
// Bridges EX ↔ CX agent state.
//
// Core idea: agents live on EX for inbound client calls. When
// they're not on an EX call, CX can route leads to them.
// This service polls EX state (via existing stateEngine) and
// syncs it to CX availability.
//
// EX state        → CX state
// ─────────────── → ──────────────
// OnCall/Ringing  → Unavailable (on EX call)
// DND             → Unavailable (DND)
// Available       → Available (ready for CX leads)
// Offline         → LoggedOff
//
// Agent widget overrides: if an agent manually sets themselves
// to unavailable via the widget, CX stays unavailable regardless
// of EX state.
// ─────────────────────────────────────────────────────────────

const cxAuth = require("./cxAuthService");
const log = require("../../utils/logger");
const mongoose = require("mongoose");

// ─── CX Agent Map Schema ─────────────────────────────────────
// Maps EX extension IDs to CX agent IDs + tracks state

const cxAgentMapSchema = new mongoose.Schema({
  extensionId: { type: String, required: true, unique: true, index: true },
  cxAgentId: { type: String, required: true, index: true },
  agentName: String,
  exState: { type: String, default: "Unknown" },
  cxState: { type: String, default: "LoggedOff" },
  widgetOverride: { type: String, default: null }, // "unavailable" | null
  lastSyncAt: Date,
  cxSkills: [{ skillId: Number, skillName: String, proficiency: Number }],
}, { timestamps: true });

const CxAgentMap = mongoose.models.CxAgentMap || mongoose.model("CxAgentMap", cxAgentMapSchema);

// ─── State Sync ──────────────────────────────────────────────

// Map EX telephony states to CX target states
function mapExToCx(exState, widgetOverride) {
  if (widgetOverride === "unavailable") return "Unavailable";

  switch (exState) {
    case "OnCall":
    case "Ringing":
    case "CallConnected":
      return "Unavailable"; // on EX call → don't send CX leads
    case "DoNotDisturb":
      return "Unavailable";
    case "Available":
    case "Idle":
      return "Available"; // free for CX leads
    case "Offline":
    case "Unknown":
    default:
      return "LoggedOff";
  }
}

async function syncAgentState(extensionId, exState) {
  const agent = await CxAgentMap.findOne({ extensionId });
  if (!agent) return; // agent not mapped to CX

  const targetCxState = mapExToCx(exState, agent.widgetOverride);

  // Only sync if state actually changed
  if (agent.cxState === targetCxState && agent.exState === exState) return;

  agent.exState = exState;
  const previousCx = agent.cxState;

  if (!cxAuth.isConfigured()) {
    // CX not configured — just track locally
    agent.cxState = targetCxState;
    agent.lastSyncAt = new Date();
    await agent.save();
    return;
  }

  try {
    const statePayload = { state: targetCxState };

    // If going unavailable, use a reason code
    if (targetCxState === "Unavailable") {
      const reason = agent.widgetOverride === "unavailable" ? "Manual Override" : "On EX Call";
      statePayload.outStateDescription = reason;
    }

    await cxAuth.apiCall("post", `/agents/${agent.cxAgentId}/state`, statePayload);

    agent.cxState = targetCxState;
    agent.lastSyncAt = new Date();
    await agent.save();

    if (previousCx !== targetCxState) {
      log.pipe("CX-SYNC", agent.agentName, `EX:${exState} → CX:${targetCxState}`);
    }
  } catch (err) {
    log.pipeFail("CX-SYNC", agent.agentName, `Failed: ${err.message}`);
  }
}

// ─── Widget Controls ─────────────────────────────────────────

async function setWidgetOverride(extensionId, override) {
  // override: "unavailable" | null (clear override)
  const agent = await CxAgentMap.findOne({ extensionId });
  if (!agent) throw new Error("Agent not mapped to CX");

  agent.widgetOverride = override;
  await agent.save();

  // Immediately re-sync to CX
  await syncAgentState(extensionId, agent.exState);

  return { extensionId, widgetOverride: override, cxState: agent.cxState };
}

async function getAgentStatus(extensionId) {
  const agent = await CxAgentMap.findOne({ extensionId }).lean();
  if (!agent) return null;
  return {
    extensionId: agent.extensionId,
    cxAgentId: agent.cxAgentId,
    agentName: agent.agentName,
    exState: agent.exState,
    cxState: agent.cxState,
    widgetOverride: agent.widgetOverride,
    lastSyncAt: agent.lastSyncAt,
    skills: agent.cxSkills,
  };
}

async function getAllAgentStatuses() {
  return CxAgentMap.find().sort({ agentName: 1 }).lean();
}

// ─── Agent Mapping CRUD ──────────────────────────────────────

async function mapAgent({ extensionId, cxAgentId, agentName, skills }) {
  return CxAgentMap.findOneAndUpdate(
    { extensionId },
    { cxAgentId, agentName, cxSkills: skills || [] },
    { upsert: true, new: true }
  );
}

async function unmapAgent(extensionId) {
  return CxAgentMap.deleteOne({ extensionId });
}

module.exports = {
  syncAgentState,
  setWidgetOverride,
  getAgentStatus,
  getAllAgentStatuses,
  mapAgent,
  unmapAgent,
  CxAgentMap,
};
