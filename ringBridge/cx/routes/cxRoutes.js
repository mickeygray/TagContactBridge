// ringBridge/cx/routes/cxRoutes.js
// ─────────────────────────────────────────────────────────────
// CX API routes — agent widget controls + admin + metrics.
// Mount at /cx in ringBridge/server.js when ready.
// ─────────────────────────────────────────────────────────────

const express = require("express");
const router = express.Router();
const {
  setWidgetOverride,
  getAgentStatus,
  getAllAgentStatuses,
  mapAgent,
  unmapAgent,
} = require("../services/cxAgentBridge");
const {
  manualDisposition,
  markDnc,
  freezeProspect,
  CxContact,
} = require("../services/cxDispositionService");

// ─── Agent Widget Endpoints ──────────────────────────────────
// These are what the agent-facing widget calls.

// Get my status (agent provides their extension ID)
router.get("/agent/:extensionId/status", async (req, res) => {
  try {
    const status = await getAgentStatus(req.params.extensionId);
    if (!status) return res.status(404).json({ error: "Agent not mapped to CX" });
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Set availability (from agent widget)
// POST /cx/agent/:extensionId/available → clears override, CX goes Available
// POST /cx/agent/:extensionId/unavailable → sets override, CX goes Unavailable
router.post("/agent/:extensionId/available", async (req, res) => {
  try {
    const result = await setWidgetOverride(req.params.extensionId, null);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/agent/:extensionId/unavailable", async (req, res) => {
  try {
    const result = await setWidgetOverride(req.params.extensionId, "unavailable");
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DNC a prospect (from agent widget after call)
router.post("/agent/dnc", async (req, res) => {
  try {
    const { phone, company } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone required" });
    const result = await markDnc(phone, company || "WYNN");
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Freeze a prospect (pause outreach but keep active)
router.post("/agent/freeze", async (req, res) => {
  try {
    const { phone, company } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone required" });
    const result = await freezeProspect(phone, company || "WYNN");
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin Endpoints ─────────────────────────────────────────

// List all mapped agents with current state
router.get("/agents", async (req, res) => {
  try {
    const agents = await getAllAgentStatuses();
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Map an EX agent to a CX agent
router.post("/agents/map", async (req, res) => {
  try {
    const { extensionId, cxAgentId, agentName, skills } = req.body;
    if (!extensionId || !cxAgentId) {
      return res.status(400).json({ error: "extensionId and cxAgentId required" });
    }
    const result = await mapAgent({ extensionId, cxAgentId, agentName, skills });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unmap an agent
router.delete("/agents/:extensionId", async (req, res) => {
  try {
    await unmapAgent(req.params.extensionId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CX Call History ─────────────────────────────────────────

router.get("/contacts", async (req, res) => {
  try {
    const { startDate, endDate, agentName, limit = 50 } = req.query;
    const query = {};
    if (startDate && endDate) {
      const start = new Date(startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(endDate); end.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: start, $lte: end };
    }
    if (agentName) query.agentName = agentName;

    const contacts = await CxContact.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit), 200))
      .lean();

    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual disposition override
router.post("/contacts/:contactId/disposition", async (req, res) => {
  try {
    const { outcome, notes } = req.body;
    const result = await manualDisposition(req.params.contactId, outcome, notes);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
