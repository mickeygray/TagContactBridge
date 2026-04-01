// ringBridge/services/logicsLookupService.js
// ─────────────────────────────────────────────────────────────
// Enriches ContactActivity records with Logics case data.
// Uses the parent's logicsService.findCaseByPhone() with a
// TTL cache to avoid hammering the API for repeat callers.
// ─────────────────────────────────────────────────────────────

const ContactActivity = require('../models/ContactActivity');
const log = require('../utils/logger');

// Lazy-load transcription service to avoid circular deps
let transcriptionService = null;
function getTranscriptionService() {
  if (!transcriptionService) {
    try {
      transcriptionService = require('./transcriptionService');
    } catch (err) {
      log.warn(`Transcription service not available: ${err.message}`);
    }
  }
  return transcriptionService;
}

// Require parent's logics service (two dirs up from ringBridge/services/)
let findCaseByPhone;
try {
  ({ findCaseByPhone } = require('../../shared/services/logicsService'));
  log.success('Logics service loaded for enrichment');
} catch (err) {
  log.warn(`Logics service not available: ${err.message} — enrichment disabled`);
  findCaseByPhone = null;
}

// ─── TTL Cache ──────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000;
const phoneCache = new Map();

function getCached(phone) {
  const entry = phoneCache.get(phone);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    phoneCache.delete(phone);
    return null;
  }
  return entry.data;
}

function setCache(phone, data) {
  phoneCache.set(phone, { data, timestamp: Date.now() });
  if (phoneCache.size > 500) {
    const now = Date.now();
    for (const [key, val] of phoneCache) {
      if (now - val.timestamp > CACHE_TTL_MS) phoneCache.delete(key);
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────
function extractPhone(activeCall, direction) {
  if (!activeCall) return null;
  const raw = direction === 'Inbound' ? activeCall.from : activeCall.to;
  if (!raw) return null;
  return raw.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');
}

function formatPhone(digits) {
  if (!digits || digits.length !== 10) return digits || '';
  return `(${digits.slice(0, 3)})${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// ─── Create ContactActivity on call start ───────────────────
async function onCallStart(agent, activeCall) {
  if (!activeCall) return null;

  const direction = activeCall.direction || 'Unknown';
  const phone = extractPhone(activeCall, direction);
  const ph = formatPhone(phone) || phone || 'no-phone';

  log.pipe('CALL-START', agent.name, `${direction} → ${ph} (session: ${activeCall.sessionId || '?'})`);

  try {
    const activity = new ContactActivity({
      extensionId: agent.extensionId,
      agentName: agent.name,
      company: agent.company,
      direction,
      phone: phone || '',
      phoneFormatted: formatPhone(phone),
      callSessionId: activeCall.sessionId,
      telephonySessionId: activeCall.telephonySessionId,
      callStartTime: activeCall.startTime ? new Date(activeCall.startTime) : new Date(),
      enrichmentStatus: phone ? 'pending' : 'unmatched',
    });
    await activity.save();
    log.pipeOk('ACTIVITY', agent.name, `Saved ${activity._id}`);

    if (phone && findCaseByPhone) {
      log.pipe('ENRICH', agent.name, `Looking up ${ph} in TAG + WYNN...`);
      enrichActivity(activity._id, phone).catch(err => {
        log.pipeFail('ENRICH', agent.name, `${ph}: ${err.message}`);
      });
    } else if (!phone) {
      log.pipeSkip('ENRICH', agent.name, 'No phone number on call event');
    } else {
      log.pipeSkip('ENRICH', agent.name, 'Logics service not loaded');
    }

    return activity;
  } catch (err) {
    log.pipeFail('ACTIVITY', agent.name, `Create failed: ${err.message}`);
    return null;
  }
}

// ─── Update ContactActivity on call end ─────────────────────
async function onCallEnd(agent, activeCall) {
  if (!activeCall?.sessionId && !activeCall?.telephonySessionId) {
    log.pipeSkip('CALL-END', agent.name, 'No session ID — cannot match activity');
    return;
  }

  try {
    const query = { extensionId: agent.extensionId, callEndTime: null };
    if (activeCall.sessionId) query.callSessionId = activeCall.sessionId;

    const activity = await ContactActivity.findOne(query).sort({ createdAt: -1 });
    if (!activity) {
      log.pipeSkip('CALL-END', agent.name, 'No open activity found for this session');
      return;
    }

    activity.callEndTime = new Date();
    if (activity.callStartTime) {
      activity.durationSeconds = Math.round((activity.callEndTime - activity.callStartTime) / 1000);
    }
    await activity.save();

    const ph = activity.phoneFormatted || activity.phone || 'no-phone';
    const dur = `${Math.floor((activity.durationSeconds || 0) / 60)}m ${(activity.durationSeconds || 0) % 60}s`;
    log.pipe('CALL-END', agent.name, `${activity.direction} ${ph} — ${dur}`);

    // Re-enrich if unmatched
    if (activity.enrichmentStatus === 'unmatched' && activity.phone && findCaseByPhone) {
      log.pipe('ENRICH-RETRY', agent.name, `${ph} was unmatched on start, retrying post-call...`);
      activity.enrichmentStatus = 'retried';
      await activity.save();
      enrichActivity(activity._id, activity.phone, true).catch(err => {
        log.pipeFail('ENRICH-RETRY', agent.name, `${ph}: ${err.message}`);
      });
    }

    // SSE broadcast
    const { broadcastSSE } = require('../engine/stateEngine');
    broadcastSSE('contactActivity', {
      _id: activity._id, extensionId: activity.extensionId, agentName: activity.agentName,
      direction: activity.direction, phone: activity.phone, phoneFormatted: activity.phoneFormatted,
      durationSeconds: activity.durationSeconds, enrichmentStatus: activity.enrichmentStatus,
      caseMatch: activity.caseMatch, disposition: activity.disposition,
      callStartTime: activity.callStartTime, callEndTime: activity.callEndTime,
    });

    // ─── Transcription decision tree (logged at every gate) ──
    if (activity.direction !== 'Outbound') {
      log.pipeSkip('TRANSCRIBE', agent.name, `${ph} — not outbound (${activity.direction})`);
    } else if (activity.durationSeconds <= 10) {
      log.pipeSkip('TRANSCRIBE', agent.name, `${ph} — too short (${activity.durationSeconds}s < 10s)`);
    } else if (activity.caseMatch?.domain !== 'WYNN') {
      log.pipeSkip('TRANSCRIBE', agent.name, `${ph} — not WYNN lead (domain: ${activity.caseMatch?.domain || 'none'})`);
    } else {
      log.pipe('TRANSCRIBE', agent.name, `${ph} — WYNN outbound ${dur}, queueing for recording download...`);
      const ts = getTranscriptionService();
      if (ts) {
        ts.processOutboundRecording(activity._id).catch(err =>
          log.pipeFail('TRANSCRIBE', agent.name, `Pipeline error: ${err.message}`)
        );
      } else {
        log.pipeFail('TRANSCRIBE', agent.name, 'Service not loaded');
      }
    }

    return activity;
  } catch (err) {
    log.pipeFail('CALL-END', agent.name, `Error: ${err.message}`);
  }
}

// ─── Disposition ────────────────────────────────────────────
async function onDisposition(extensionId, type) {
  try {
    const activity = await ContactActivity.findOne({
      extensionId: extensionId.toString(),
    }).sort({ createdAt: -1 });

    if (activity && activity.disposition === 'none') {
      activity.disposition = type;
      await activity.save();
      log.pipe('DISPOSITION', activity.agentName || extensionId, `${activity.phoneFormatted || activity.phone || '?'} → ${type}`);
    }
  } catch (err) {
    log.pipeFail('DISPOSITION', extensionId, err.message);
  }
}

// ─── Enrichment ─────────────────────────────────────────────
async function enrichActivity(activityId, phone, isRetry = false) {
  if (!findCaseByPhone) return;

  const ph = formatPhone(phone) || phone;
  const tag = isRetry ? ' (retry)' : '';

  // Check cache
  let result = getCached(phone);
  if (result) {
    log.pipe('ENRICH', '', `${ph} — cache hit${tag}`);
  } else {
    log.pipe('ENRICH', '', `${ph} — API call to Logics FindCaseByPhone${tag}`);
    const start = Date.now();
    result = await findCaseByPhone(phone, null);
    const ms = Date.now() - start;
    log.pipe('ENRICH', '', `${ph} — Logics responded in ${ms}ms, ${result.matches?.length || 0} match(es)`);
    setCache(phone, result);
  }

  const activity = await ContactActivity.findById(activityId);
  if (!activity) return;

  activity.enrichmentAttempts += 1;
  activity.lastEnrichmentAt = new Date();

  if (result.ok && result.matches.length > 0) {
    const p = result.matches[0];
    activity.enrichmentStatus = 'matched';
    activity.caseMatch = {
      domain: p.domain, caseId: p.caseId, firstName: p.firstName, lastName: p.lastName,
      name: p.name, statusId: p.statusId, email: p.email, city: p.city, state: p.state,
      taxAmount: p.taxAmount, sourceName: p.sourceName,
      saleDate: p.saleDate ? new Date(p.saleDate) : undefined,
    };
    activity.allMatches = result.matches.map(m => ({
      domain: m.domain, caseId: m.caseId, name: m.name, statusId: m.statusId,
    }));

    const extras = result.matches.length > 1 ? ` (+${result.matches.length - 1} more)` : '';
    log.pipeOk('ENRICH', activity.agentName, `${ph} → ${p.domain} #${p.caseId} "${p.name}" status:${p.statusId} source:"${p.sourceName || '?'}"${extras}`);
  } else {
    activity.enrichmentStatus = 'unmatched';
    if (!result.ok && result.error) {
      activity.enrichmentError = result.error;
      log.pipeFail('ENRICH', activity.agentName, `${ph} — error: ${result.error}${tag}`);
    } else {
      log.pipe('ENRICH', activity.agentName, `${ph} — no case in TAG or WYNN${tag}`);
    }
  }

  await activity.save();

  const { broadcastSSE } = require('../engine/stateEngine');
  broadcastSSE('enrichmentUpdate', {
    _id: activity._id, phone: activity.phone,
    enrichmentStatus: activity.enrichmentStatus,
    caseMatch: activity.caseMatch, allMatches: activity.allMatches,
  });
}

module.exports = {
  onCallStart, onCallEnd, onDisposition, enrichActivity, extractPhone, formatPhone,
};
