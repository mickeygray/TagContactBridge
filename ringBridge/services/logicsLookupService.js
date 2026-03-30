// ringBridge/services/logicsLookupService.js
// ─────────────────────────────────────────────────────────────
// Enriches ContactActivity records with Logics case data.
// Uses the parent's logicsService.findCaseByPhone() with a
// TTL cache to avoid hammering the API for repeat callers.
// ─────────────────────────────────────────────────────────────

const ContactActivity = require("../models/ContactActivity");
const log = require("../utils/logger");

// Lazy-load transcription service to avoid circular deps
let transcriptionService = null;
function getTranscriptionService() {
  if (!transcriptionService) {
    try {
      transcriptionService = require("./transcriptionService");
    } catch (err) {
      log.warn(`Transcription service not available: ${err.message}`);
    }
  }
  return transcriptionService;
}

// Require parent's logics service (two dirs up from ringBridge/services/)
let findCaseByPhone;
try {
  ({ findCaseByPhone } = require("../../services/logicsService"));
  log.success("Logics service loaded for enrichment");
} catch (err) {
  log.warn(
    `Logics service not available: ${err.message} — enrichment disabled`,
  );
  findCaseByPhone = null;
}

// ─── TTL Cache ──────────────────────────────────────────────
// Key: phone digits → { matches, timestamp }
// Avoids re-querying Logics for the same caller within TTL window
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
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
  // Evict old entries periodically
  if (phoneCache.size > 500) {
    const now = Date.now();
    for (const [key, val] of phoneCache) {
      if (now - val.timestamp > CACHE_TTL_MS) phoneCache.delete(key);
    }
  }
}

// ─── Extract phone from call event ──────────────────────────
function extractPhone(activeCall, direction) {
  if (!activeCall) return null;
  // For inbound: caller is "from", for outbound: callee is "to"
  const raw = direction === "Inbound" ? activeCall.from : activeCall.to;
  if (!raw) return null;
  return raw.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
}

function formatPhone(digits) {
  if (!digits || digits.length !== 10) return digits || "";
  return `(${digits.slice(0, 3)})${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// ─── Create ContactActivity on call start ───────────────────
async function onCallStart(agent, activeCall) {
  if (!activeCall) return null;

  const direction = activeCall.direction || "Unknown";
  const phone = extractPhone(activeCall, direction);

  try {
    const activity = new ContactActivity({
      extensionId: agent.extensionId,
      agentName: agent.name,
      company: agent.company,
      direction,
      phone: phone || "",
      phoneFormatted: formatPhone(phone),
      callSessionId: activeCall.sessionId,
      telephonySessionId: activeCall.telephonySessionId,
      callStartTime: activeCall.startTime
        ? new Date(activeCall.startTime)
        : new Date(),
      enrichmentStatus: phone ? "pending" : "unmatched",
    });
    await activity.save();

    // Fire-and-forget enrichment (don't block the webhook response)
    if (phone && findCaseByPhone) {
      enrichActivity(activity._id, phone).catch((err) => {
        log.warn(`Enrichment failed for ${phone}: ${err.message}`);
      });
    }

    return activity;
  } catch (err) {
    log.error(`Failed to create ContactActivity: ${err.message}`);
    return null;
  }
}

// ─── Update ContactActivity on call end ─────────────────────
async function onCallEnd(agent, activeCall) {
  if (!activeCall?.sessionId && !activeCall?.telephonySessionId) return;

  try {
    // Find the most recent open activity for this agent
    const query = { extensionId: agent.extensionId, callEndTime: null };
    if (activeCall.sessionId) query.callSessionId = activeCall.sessionId;

    const activity = await ContactActivity.findOne(query).sort({
      createdAt: -1,
    });
    if (!activity) return;

    activity.callEndTime = new Date();
    if (activity.callStartTime) {
      activity.durationSeconds = Math.round(
        (activity.callEndTime - activity.callStartTime) / 1000,
      );
    }
    await activity.save();

    // If enrichment was unmatched on start, retry now
    // (agent may have created the case during the call)
    if (
      activity.enrichmentStatus === "unmatched" &&
      activity.phone &&
      findCaseByPhone
    ) {
      activity.enrichmentStatus = "retried";
      await activity.save();
      enrichActivity(activity._id, activity.phone, true).catch((err) => {
        log.warn(
          `Retry enrichment failed for ${activity.phone}: ${err.message}`,
        );
      });
    }

    // Broadcast to SSE
    const { broadcastSSE } = require("../engine/stateEngine");
    broadcastSSE("contactActivity", {
      _id: activity._id,
      extensionId: activity.extensionId,
      agentName: activity.agentName,
      direction: activity.direction,
      phone: activity.phone,
      phoneFormatted: activity.phoneFormatted,
      durationSeconds: activity.durationSeconds,
      enrichmentStatus: activity.enrichmentStatus,
      caseMatch: activity.caseMatch,
      disposition: activity.disposition,
      callStartTime: activity.callStartTime,
      callEndTime: activity.callEndTime,
    });

    // ─── Trigger transcription for outbound calls ─────────
    // Fire-and-forget: recording takes ~45s to land in RC
    if (
      activity.direction === "Outbound" &&
      activity.durationSeconds > 10 &&
      activity.caseMatch?.domain === "WYNN"
    ) {
      const ts = getTranscriptionService();
      if (ts) {
        ts.processOutboundRecording(activity._id).catch((err) =>
          log.warn(
            `Transcription pipeline failed for ${activity.phone}: ${err.message}`,
          ),
        );
      }
    }

    return activity;
  } catch (err) {
    log.error(`Failed to update ContactActivity on call end: ${err.message}`);
  }
}

// ─── Update disposition on ContactActivity ──────────────────
async function onDisposition(extensionId, type) {
  try {
    // Find the most recent activity for this agent
    const activity = await ContactActivity.findOne({
      extensionId: extensionId.toString(),
    }).sort({ createdAt: -1 });

    if (activity && activity.disposition === "none") {
      activity.disposition = type;
      await activity.save();
    }
  } catch (err) {
    log.warn(`Failed to update disposition on ContactActivity: ${err.message}`);
  }
}

// ─── Enrichment logic ───────────────────────────────────────
async function enrichActivity(activityId, phone, isRetry = false) {
  if (!findCaseByPhone) return;

  // Check cache first
  let result = getCached(phone);
  if (!result) {
    result = await findCaseByPhone(phone, null); // null = search TAG + WYNN
    setCache(phone, result);
  }

  const activity = await ContactActivity.findById(activityId);
  if (!activity) return;

  activity.enrichmentAttempts += 1;
  activity.lastEnrichmentAt = new Date();

  if (result.ok && result.matches.length > 0) {
    const primary = result.matches[0];
    activity.enrichmentStatus = "matched";
    activity.caseMatch = {
      domain: primary.domain,
      caseId: primary.caseId,
      firstName: primary.firstName,
      lastName: primary.lastName,
      name: primary.name,
      statusId: primary.statusId,
      saleDate: primary.saleDate ? new Date(primary.saleDate) : undefined,
      email: primary.email,
      city: primary.city,
      state: primary.state,
      taxAmount: primary.taxAmount,
      sourceName: primary.sourceName,
    };
    activity.allMatches = result.matches.map((m) => ({
      domain: m.domain,
      caseId: m.caseId,
      name: m.name,
      statusId: m.statusId,
    }));
    log.info(
      `Enriched ${phone} → ${primary.domain} Case #${primary.caseId} (${primary.name})`,
    );
  } else {
    activity.enrichmentStatus = isRetry ? "unmatched" : "unmatched";
    if (!result.ok && result.error) {
      activity.enrichmentError = result.error;
    }
  }

  await activity.save();

  // Broadcast enrichment update via SSE
  const { broadcastSSE } = require("../engine/stateEngine");
  broadcastSSE("enrichmentUpdate", {
    _id: activity._id,
    phone: activity.phone,
    enrichmentStatus: activity.enrichmentStatus,
    caseMatch: activity.caseMatch,
    allMatches: activity.allMatches,
  });
}

module.exports = {
  onCallStart,
  onCallEnd,
  onDisposition,
  enrichActivity,
  extractPhone,
  formatPhone,
};
