const express = require('express');
const router = express.Router();
const Agent = require('../models/Agent');
const EventLog = require('../models/EventLog');
const ContactActivity = require('../models/ContactActivity');
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

// ─── Contact Activity ─────────────────────────────────────────────────
// (appended after module.exports — Express doesn't care about order)

/**
 * GET /api/admin/contacts
 * List contact activity with filters
 * Query: ?extensionId=&phone=&enrichment=matched|unmatched|pending&disposition=good|bad|none&limit=50&skip=0&from=&to=
 */
router.get('/admin/contacts', async (req, res) => {
  try {
    const { extensionId, phone, enrichment, disposition, limit, skip, from, to } = req.query;
    const query = {};

    if (extensionId) query.extensionId = extensionId;
    if (phone) query.phone = { $regex: phone.replace(/\D/g, '') };
    if (enrichment) query.enrichmentStatus = enrichment;
    if (disposition) query.disposition = disposition;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }

    const total = await ContactActivity.countDocuments(query);
    const activities = await ContactActivity.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) || 50)
      .skip(parseInt(skip) || 0)
      .lean();

    res.json({ success: true, total, activities });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/contacts/csv
 * Export contact activity as CSV
 * Same filters as /admin/contacts
 */
router.get('/admin/contacts/csv', async (req, res) => {
  try {
    const { extensionId, phone, enrichment, disposition, from, to } = req.query;
    const query = {};

    if (extensionId) query.extensionId = extensionId;
    if (phone) query.phone = { $regex: phone.replace(/\D/g, '') };
    if (enrichment) query.enrichmentStatus = enrichment;
    if (disposition) query.disposition = disposition;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }

    const activities = await ContactActivity.find(query)
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean();

    // Build CSV
    const headers = [
      'Date', 'Time', 'Agent', 'Company', 'Direction', 'Phone',
      'Duration (s)', 'Disposition', 'Enrichment', 'Domain',
      'Case ID', 'Case Name', 'Status ID', 'Email', 'City',
      'State', 'Tax Amount', 'Session ID'
    ];

    const rows = activities.map(a => {
      const dt = a.callStartTime ? new Date(a.callStartTime) : new Date(a.createdAt);
      return [
        dt.toLocaleDateString('en-US'),
        dt.toLocaleTimeString('en-US'),
        a.agentName || '',
        a.company || '',
        a.direction || '',
        a.phoneFormatted || a.phone || '',
        a.durationSeconds || 0,
        a.disposition || '',
        a.enrichmentStatus || '',
        a.caseMatch?.domain || '',
        a.caseMatch?.caseId || '',
        a.caseMatch?.name || '',
        a.caseMatch?.statusId || '',
        a.caseMatch?.email || '',
        a.caseMatch?.city || '',
        a.caseMatch?.state || '',
        a.caseMatch?.taxAmount || '',
        a.callSessionId || '',
      ].map(v => {
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const filename = `contact-activity-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/contacts/:id
 * Get single contact activity detail (with all matches)
 */
router.get('/admin/contacts/:id', async (req, res) => {
  try {
    const activity = await ContactActivity.findById(req.params.id).lean();
    if (!activity) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, activity });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/contacts/:id/retry-enrichment
 * Manually retry enrichment for an activity
 */
router.post('/admin/contacts/:id/retry-enrichment', async (req, res) => {
  try {
    const activity = await ContactActivity.findById(req.params.id);
    if (!activity) return res.status(404).json({ success: false, error: 'Not found' });
    if (!activity.phone) return res.status(400).json({ success: false, error: 'No phone number' });

    const { enrichActivity } = require('../services/logicsLookupService');
    await enrichActivity(activity._id, activity.phone, true);

    const updated = await ContactActivity.findById(req.params.id).lean();
    res.json({ success: true, activity: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/contacts/stats/summary
 * Aggregated stats for the contact activity dashboard
 */
router.get('/admin/contacts/stats/summary', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayStats, totalStats] = await Promise.all([
      ContactActivity.aggregate([
        { $match: { createdAt: { $gte: today } } },
        { $group: {
          _id: null,
          total: { $sum: 1 },
          matched: { $sum: { $cond: [{ $eq: ['$enrichmentStatus', 'matched'] }, 1, 0] } },
          unmatched: { $sum: { $cond: [{ $eq: ['$enrichmentStatus', 'unmatched'] }, 1, 0] } },
          good: { $sum: { $cond: [{ $eq: ['$disposition', 'good'] }, 1, 0] } },
          bad: { $sum: { $cond: [{ $eq: ['$disposition', 'bad'] }, 1, 0] } },
          inbound: { $sum: { $cond: [{ $eq: ['$direction', 'Inbound'] }, 1, 0] } },
          outbound: { $sum: { $cond: [{ $eq: ['$direction', 'Outbound'] }, 1, 0] } },
          avgDuration: { $avg: '$durationSeconds' },
        }}
      ]),
      ContactActivity.countDocuments({}),
    ]);

    res.json({
      success: true,
      today: todayStats[0] || { total: 0, matched: 0, unmatched: 0, good: 0, bad: 0, inbound: 0, outbound: 0, avgDuration: 0 },
      allTime: { total: totalStats },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Transcription ──────────────────────────────────────────────────

/**
 * POST /api/admin/contacts/:id/retry-transcription
 * Manually retry transcription + scoring for an outbound call
 */
router.post('/admin/contacts/:id/retry-transcription', async (req, res) => {
  try {
    const { retryTranscription } = require('../services/transcriptionService');
    const result = await retryTranscription(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/contacts/:id/transcript
 * Get just the transcript text for a call (for display/export)
 */
router.get('/admin/contacts/:id/transcript', async (req, res) => {
  try {
    const activity = await ContactActivity.findById(req.params.id).lean();
    if (!activity) return res.status(404).json({ success: false, error: 'Not found' });
    if (!activity.transcription?.text) return res.status(404).json({ success: false, error: 'No transcript available' });

    // If ?format=text, return plain text
    if (req.query.format === 'text') {
      res.setHeader('Content-Type', 'text/plain');
      return res.send(activity.transcription.text);
    }

    res.json({
      success: true,
      phone: activity.phoneFormatted || activity.phone,
      agentName: activity.agentName,
      direction: activity.direction,
      duration: activity.durationSeconds,
      transcript: activity.transcription.text,
      transcribedAt: activity.transcription.transcribedAt,
      callScore: activity.callScore,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/contacts/scored
 * List scored outbound calls — the vendor quality report feed
 * Query: ?verdict=hot|warm|cold|dead|fake&minScore=&maxScore=&limit=50&skip=0
 */
router.get('/admin/contacts/scored', async (req, res) => {
  try {
    const { verdict, minScore, maxScore, limit, skip } = req.query;
    const query = {
      direction: 'Outbound',
      'transcription.status': 'completed',
      'callScore.overall': { $exists: true },
    };

    if (verdict) query['callScore.lead_verdict'] = verdict;
    if (minScore) query['callScore.overall'] = { ...query['callScore.overall'], $gte: parseInt(minScore) };
    if (maxScore) query['callScore.overall'] = { ...query['callScore.overall'], $lte: parseInt(maxScore) };

    const total = await ContactActivity.countDocuments(query);
    const activities = await ContactActivity.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) || 50)
      .skip(parseInt(skip) || 0)
      .select('agentName company phone phoneFormatted direction durationSeconds disposition enrichmentStatus caseMatch callScore transcription.status createdAt callStartTime')
      .lean();

    res.json({ success: true, total, activities });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/contacts/scored/csv
 * Export scored calls as CSV for vendor reporting
 */
router.get('/admin/contacts/scored/csv', async (req, res) => {
  try {
    const { verdict, minScore, maxScore, from, to } = req.query;
    const query = {
      direction: 'Outbound',
      'transcription.status': 'completed',
      'callScore.overall': { $exists: true },
    };

    if (verdict) query['callScore.lead_verdict'] = verdict;
    if (minScore) query['callScore.overall'] = { ...query['callScore.overall'], $gte: parseInt(minScore) };
    if (maxScore) query['callScore.overall'] = { ...query['callScore.overall'], $lte: parseInt(maxScore) };
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }

    const activities = await ContactActivity.find(query)
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean();

    const headers = [
      'Date', 'Time', 'Agent', 'Company', 'Phone', 'Duration (s)',
      'Disposition', 'Overall Score', 'Verdict',
      'Contactability', 'Legitimacy', 'Tax Issue', 'Interest', 'Qualification',
      'Answered', 'Voicemail', 'Tax Type', 'Tax Amount Mentioned',
      'Willing to Proceed', 'Red Flags', 'Summary',
      'Case Domain', 'Case ID', 'Case Name',
    ];

    const rows = activities.map(a => {
      const dt = a.callStartTime ? new Date(a.callStartTime) : new Date(a.createdAt);
      const s = a.callScore || {};
      const d = s.dimensions || {};
      const k = s.key_details || {};
      return [
        dt.toLocaleDateString('en-US'),
        dt.toLocaleTimeString('en-US'),
        a.agentName || '',
        a.company || '',
        a.phoneFormatted || a.phone || '',
        a.durationSeconds || 0,
        a.disposition || '',
        s.overall || '',
        s.lead_verdict || '',
        d.contactability?.score || '',
        d.legitimacy?.score || '',
        d.tax_issue_present?.score || '',
        d.interest_level?.score || '',
        d.qualification?.score || '',
        k.answered ?? '',
        k.voicemail ?? '',
        k.tax_type || '',
        k.tax_amount_mentioned || '',
        k.willing_to_proceed || '',
        (s.red_flags || []).join('; '),
        (s.summary || '').replace(/[\n\r]+/g, ' '),
        a.caseMatch?.domain || '',
        a.caseMatch?.caseId || '',
        a.caseMatch?.name || '',
      ].map(v => {
        const str = String(v);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const filename = `vendor-lead-scores-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
