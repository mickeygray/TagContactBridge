const express = require('express');
const router = express.Router();
const Agent = require('../models/Agent');
const EventLog = require('../models/EventLog');
const stateEngine = require('../engine/stateEngine');
const rcAuthService = require('../services/rcAuthService');
const webhookManager = require('../services/webhookManager');
const log = require('../utils/logger');

// ─── SSE Stream ──────────────────────────────────────────────────────

/**
 * GET /api/events
 * Server-Sent Events stream for real-time dashboard updates
 */
router.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Send initial state
  stateEngine.getAllAgentStates().then(agents => {
    res.write(`event: initialState\ndata: ${JSON.stringify(agents)}\n\n`);
  });

  // Register for updates
  stateEngine.addSSEClient(res);

  // Heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (e) { clearInterval(heartbeat); }
  }, 30000);

  req.on('close', () => clearInterval(heartbeat));
});

// ─── Agent Management ────────────────────────────────────────────────

/**
 * GET /api/admin/agents
 * List all agents with current state
 */
router.get('/admin/agents', async (req, res) => {
  try {
    const agents = await stateEngine.getAllAgentStates();
    res.json({ success: true, agents });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/agents
 * Add a new agent to monitor
 * Body: { extensionId, name, company, pin? }
 */
router.post('/admin/agents', async (req, res) => {
  try {
    const { extensionId, name, company, pin } = req.body;

    if (!extensionId || !name) {
      return res.status(400).json({ success: false, error: 'extensionId and name are required' });
    }

    // Check if already exists
    const existing = await Agent.findOne({ extensionId: extensionId.toString() });
    if (existing) {
      return res.status(409).json({ success: false, error: `Agent with ext ${extensionId} already exists` });
    }

    const agent = new Agent({
      extensionId: extensionId.toString(),
      name,
      company: company || 'TAG',
      pin: pin || Math.floor(1000 + Math.random() * 9000).toString()
    });
    await agent.save();

    log.success(`Added agent: ${name} (ext ${extensionId}, ${company || 'TAG'})`);

    // Try to subscribe to their presence webhook
    const { isAuthenticated } = rcAuthService.getAuthStatus();
    if (isAuthenticated) {
      await webhookManager.subscribeAgent(extensionId.toString());
    }

    res.json({
      success: true,
      agent: {
        extensionId: agent.extensionId,
        name: agent.name,
        company: agent.company,
        pin: agent.pin,
        status: agent.status
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/admin/agents/:extensionId
 * Remove an agent
 */
router.delete('/admin/agents/:extensionId', async (req, res) => {
  try {
    const agent = await Agent.findOne({ extensionId: req.params.extensionId });
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    // Unsubscribe webhook
    if (agent.webhookSubscriptionId) {
      await webhookManager.deleteSubscription(agent.webhookSubscriptionId);
    }

    await Agent.deleteOne({ extensionId: req.params.extensionId });
    log.info(`Removed agent: ${agent.name} (ext ${agent.extensionId})`);

    res.json({ success: true, removed: agent.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/agents/:extensionId/override
 * Manually override an agent's status (admin tool)
 */
router.post('/admin/agents/:extensionId/override', async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['available', 'onCall', 'ringing', 'disposition', 'away', 'offline'];
    if (!valid.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${valid.join(', ')}` });
    }

    const agent = await stateEngine.toggleStatus(req.params.extensionId, status);
    res.json({ success: true, agent: { extensionId: agent.extensionId, name: agent.name, status: agent.status } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Discovery ───────────────────────────────────────────────────────

/**
 * GET /api/admin/extensions
 * List all extensions on the RingEX account (for discovering IDs)
 */
router.get('/admin/extensions', async (req, res) => {
  try {
    const extensions = await rcAuthService.listExtensions();
    res.json({ success: true, extensions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/extensions/:extensionId/presence
 * Get live presence for an extension (direct API call)
 */
router.get('/admin/extensions/:extensionId/presence', async (req, res) => {
  try {
    const presence = await rcAuthService.getPresence(req.params.extensionId);
    if (!presence) {
      return res.status(404).json({ success: false, error: 'Could not get presence' });
    }
    res.json({ success: true, presence });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Webhooks Management ─────────────────────────────────────────────

/**
 * GET /api/admin/webhooks
 * List all active webhook subscriptions
 */
router.get('/admin/webhooks', async (req, res) => {
  try {
    const subs = await webhookManager.checkExistingSubscriptions();
    res.json({ success: true, subscriptions: subs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/webhooks/reinitialize
 * Delete all subscriptions and recreate them
 */
router.post('/admin/webhooks/reinitialize', async (req, res) => {
  try {
    await webhookManager.deleteAllSubscriptions();
    await webhookManager.initializeAll();
    res.json({ success: true, message: 'Webhooks reinitialized' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Event Log ───────────────────────────────────────────────────────

/**
 * GET /api/admin/events
 * Recent event log (for debugging)
 */
router.get('/admin/events', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const extensionId = req.query.extensionId || null;

    const query = extensionId ? { extensionId } : {};
    const events = await EventLog.find(query).sort({ timestamp: -1 }).limit(limit);

    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Widget API ──────────────────────────────────────────────────────

/**
 * GET /api/widget/status/:extensionId
 * Agent widget status check
 */
router.get('/widget/status/:extensionId', async (req, res) => {
  try {
    const agent = await Agent.findOne({ extensionId: req.params.extensionId });
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    agent.checkDailyReset();

    res.json({
      success: true,
      status: agent.status,
      name: agent.name,
      company: agent.company,
      currentCall: agent.currentCall,
      dailyStats: agent.dailyStats,
      lastStatusChange: agent.lastStatusChange
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/widget/disposition
 * Agent submits call disposition
 * Body: { extensionId, type: 'good'|'bad' }
 */
router.post('/widget/disposition', async (req, res) => {
  try {
    const { extensionId, type } = req.body;
    if (!extensionId || !['good', 'bad'].includes(type)) {
      return res.status(400).json({ success: false, error: 'extensionId and type (good/bad) required' });
    }

    const agent = await stateEngine.processDisposition(extensionId, type);
    res.json({ success: true, status: agent.status, dailyStats: agent.dailyStats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/widget/available
 * Agent manually toggles to available
 */
router.post('/widget/available', async (req, res) => {
  try {
    const { extensionId } = req.body;
    if (!extensionId) return res.status(400).json({ success: false, error: 'extensionId required' });

    const agent = await stateEngine.toggleStatus(extensionId, 'available');
    res.json({ success: true, status: agent.status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/widget/away
 * Agent manually toggles to away
 */
router.post('/widget/away', async (req, res) => {
  try {
    const { extensionId } = req.body;
    if (!extensionId) return res.status(400).json({ success: false, error: 'extensionId required' });

    const agent = await stateEngine.toggleStatus(extensionId, 'away');
    res.json({ success: true, status: agent.status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Health ──────────────────────────────────────────────────────────

/**
 * GET /api/health
 * System health check
 */
router.get('/health', async (req, res) => {
  const { isAuthenticated, sdkInitialized } = rcAuthService.getAuthStatus();
  const agents = await Agent.find({});

  res.json({
    status: 'ok',
    rcConnected: isAuthenticated,
    sdkInitialized,
    agentCount: agents.length,
    agentsWithWebhooks: agents.filter(a => a.webhookSubscriptionId).length,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
