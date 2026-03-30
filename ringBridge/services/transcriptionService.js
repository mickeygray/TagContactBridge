// ringBridge/services/transcriptionService.js
// ─────────────────────────────────────────────────────────────
// Downloads RingEX call recordings for outbound agent calls,
// transcribes via OpenAI Whisper, and scores via Claude API.
// Designed for vendor lead quality reporting.
// ─────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const os = require('os');
const log = require('../utils/logger');
const rcAuthService = require('./rcAuthService');
const ContactActivity = require('../models/ContactActivity');

// ─── Config ──────────────────────────────────────────────────
// Pull from parent .env
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

// How long to wait after call ends for RC to process the recording
const RECORDING_DELAY_MS = parseInt(process.env.RB_RECORDING_DELAY_MS) || 45000; // 45s default
// Max retries to find the recording in call log
const RECORDING_MAX_RETRIES = parseInt(process.env.RB_RECORDING_MAX_RETRIES) || 4;
const RECORDING_RETRY_INTERVAL_MS = 20000; // 20s between retries

// Temp dir for audio files
const TEMP_DIR = path.join(os.tmpdir(), 'ringbridge-recordings');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });


// ─── Main pipeline: called from logicsLookupService.onCallEnd ─
// Only runs for outbound calls from monitored agents.
// Fire-and-forget — don't block the webhook flow.
// ─────────────────────────────────────────────────────────────

async function processOutboundRecording(activityId) {
  const activity = await ContactActivity.findById(activityId);
  if (!activity) return;

  // Guard: only outbound
  if (activity.direction !== 'Outbound') return;

  // Guard: need a phone number for the report to be useful
  if (!activity.phone) {
    log.info(`[Transcribe] Skipping ${activityId} — no phone number`);
    return;
  }

  // Guard: check we have API keys
  if (!OPENAI_API_KEY) {
    log.warn('[Transcribe] OPENAI_API_KEY not set — skipping transcription');
    activity.transcription = { status: 'skipped', error: 'No OPENAI_API_KEY' };
    await activity.save();
    return;
  }

  try {
    activity.transcription = { status: 'processing' };
    await activity.save();

    // Step 1: Wait for recording to be available
    log.info(`[Transcribe] Waiting ${RECORDING_DELAY_MS / 1000}s for recording to land...`);
    await sleep(RECORDING_DELAY_MS);

    // Step 2: Find the recording in RC call log
    const recording = await findRecording(activity);
    if (!recording) {
      activity.transcription = { status: 'no_recording', error: 'Recording not found in RC call log' };
      await activity.save();
      log.warn(`[Transcribe] No recording found for activity ${activityId}`);
      return;
    }

    // Step 3: Download the audio
    const audioPath = await downloadRecording(recording.contentUri, activityId);
    if (!audioPath) {
      activity.transcription = { status: 'download_failed', error: 'Could not download recording' };
      await activity.save();
      return;
    }

    // Step 4: Transcribe with Whisper
    log.info(`[Transcribe] Sending to Whisper...`);
    const transcript = await transcribeWithWhisper(audioPath);

    // Step 5: Clean up temp file
    try { fs.unlinkSync(audioPath); } catch { /* ignore */ }

    if (!transcript) {
      activity.transcription = { status: 'transcription_failed', error: 'Whisper returned empty' };
      await activity.save();
      return;
    }

    // Step 6: Score with Claude (if key available)
    let scoring = null;
    if (ANTHROPIC_API_KEY) {
      log.info(`[Transcribe] Scoring with Claude...`);
      scoring = await scoreWithClaude(transcript, activity);
    }

    // Step 7: Save everything
    activity.transcription = {
      status: 'completed',
      text: transcript,
      recordingDuration: recording.duration,
      recordingUri: recording.contentUri,
      transcribedAt: new Date(),
    };

    if (scoring) {
      activity.callScore = scoring;
    }

    await activity.save();
    log.success(`[Transcribe] Completed for ${activity.phoneFormatted || activity.phone} — ${transcript.length} chars, score: ${scoring?.overall || 'N/A'}`);

    // Broadcast update via SSE
    try {
      const { broadcastSSE } = require('../engine/stateEngine');
      broadcastSSE('transcriptionComplete', {
        _id: activity._id,
        phone: activity.phone,
        phoneFormatted: activity.phoneFormatted,
        agentName: activity.agentName,
        transcriptionStatus: 'completed',
        callScore: scoring,
        transcriptPreview: transcript.slice(0, 200),
      });
    } catch { /* SSE broadcast is best-effort */ }

  } catch (err) {
    log.error(`[Transcribe] Pipeline failed for ${activityId}: ${err.message}`);
    activity.transcription = { status: 'error', error: err.message };
    await activity.save();
  }
}


// ─── Step 2: Find recording in RC call log ───────────────────

async function findRecording(activity) {
  const platform = rcAuthService.getPlatform();
  if (!platform) {
    log.warn('[Transcribe] RC not authenticated — cannot fetch recording');
    return null;
  }

  for (let attempt = 0; attempt < RECORDING_MAX_RETRIES; attempt++) {
    try {
      // Search call log for this extension around the call time
      const params = {
        direction: 'Outbound',
        type: 'Voice',
        withRecording: true,
        perPage: 10,
        view: 'Detailed',
      };

      // If we have a session ID, use it
      if (activity.callSessionId) {
        params.sessionId = activity.callSessionId;
      }

      // Time window: 30 min before call start to now
      if (activity.callStartTime) {
        const from = new Date(activity.callStartTime.getTime() - 30 * 60000);
        params.dateFrom = from.toISOString();
      }

      const resp = await rcAuthService.apiCall(
        'GET',
        `/restapi/v1.0/account/~/extension/${activity.extensionId}/call-log`,
        params
      );

      const records = resp?.records || [];

      // Try to match by session ID first
      if (activity.callSessionId) {
        const match = records.find(r => r.sessionId === activity.callSessionId && r.recording);
        if (match?.recording) {
          return {
            contentUri: match.recording.contentUri,
            duration: match.duration,
            id: match.recording.id,
          };
        }
      }

      // Fallback: match by phone number and time proximity
      if (activity.phone) {
        const phoneDigits = activity.phone.replace(/\D/g, '');
        for (const r of records) {
          if (!r.recording) continue;
          const toDigits = (r.to?.phoneNumber || '').replace(/\D/g, '');
          if (toDigits.endsWith(phoneDigits) || phoneDigits.endsWith(toDigits.slice(-10))) {
            return {
              contentUri: r.recording.contentUri,
              duration: r.duration,
              id: r.recording.id,
            };
          }
        }
      }

      // If no match yet and we have retries left, wait and try again
      if (attempt < RECORDING_MAX_RETRIES - 1) {
        log.info(`[Transcribe] Recording not found yet, retry ${attempt + 1}/${RECORDING_MAX_RETRIES}...`);
        await sleep(RECORDING_RETRY_INTERVAL_MS);
      }

    } catch (err) {
      log.warn(`[Transcribe] Call log query failed (attempt ${attempt + 1}): ${err.message}`);
      if (attempt < RECORDING_MAX_RETRIES - 1) {
        await sleep(RECORDING_RETRY_INTERVAL_MS);
      }
    }
  }

  return null;
}


// ─── Step 3: Download recording audio ────────────────────────

async function downloadRecording(contentUri, activityId) {
  try {
    const platform = rcAuthService.getPlatform();
    if (!platform) return null;

    // RC content URIs need auth token
    const token = await rcAuthService.getAccessToken();
    if (!token) return null;

    const axios = require('axios');
    const resp = await axios.get(contentUri, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'arraybuffer',
      timeout: 60000,
      maxRedirects: 5,
    });

    // Determine extension from content-type
    const ct = resp.headers['content-type'] || '';
    const ext = ct.includes('mpeg') ? '.mp3' : ct.includes('wav') ? '.wav' : '.mp3';
    const filePath = path.join(TEMP_DIR, `${activityId}${ext}`);

    fs.writeFileSync(filePath, resp.data);
    const sizeMB = (resp.data.length / 1024 / 1024).toFixed(2);
    log.info(`[Transcribe] Downloaded recording: ${sizeMB}MB → ${filePath}`);

    return filePath;
  } catch (err) {
    log.error(`[Transcribe] Download failed: ${err.message}`);
    return null;
  }
}


// ─── Step 4: Transcribe with OpenAI Whisper ──────────────────

async function transcribeWithWhisper(audioPath) {
  try {
    const FormData = require('form-data');
    const axios = require('axios');

    const form = new FormData();
    form.append('file', fs.createReadStream(audioPath));
    form.append('model', 'whisper-1');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');

    const resp = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      timeout: 120000, // 2 min for long calls
      maxContentLength: Infinity,
    });

    const data = resp.data;

    // Build a readable transcript with speaker segments
    if (data.segments && data.segments.length > 0) {
      // Whisper doesn't do speaker diarization natively,
      // but the segments give us timed chunks we can use
      return data.segments.map(s => s.text.trim()).join(' ');
    }

    return data.text || '';
  } catch (err) {
    log.error(`[Transcribe] Whisper API failed: ${err.response?.data?.error?.message || err.message}`);
    return null;
  }
}


// ─── Step 5: Score with Claude ───────────────────────────────
// Produces a structured score for vendor lead quality reporting.

async function scoreWithClaude(transcript, activity) {
  try {
    const axios = require('axios');

    const systemPrompt = `You are a call quality analyst for a tax resolution firm. You are scoring an outbound sales call where an agent called a lead that was purchased from a form vendor.

Your job is to assess the LEAD QUALITY (not the agent's performance) for vendor reporting purposes. The firm wants to know if the lead vendor is sending real, qualified prospects or garbage.

Score each dimension 1-10 and provide a brief justification. Return ONLY valid JSON, no markdown.

JSON schema:
{
  "overall": <number 1-10>,
  "dimensions": {
    "contactability": { "score": <1-10>, "note": "<brief>" },
    "legitimacy": { "score": <1-10>, "note": "<brief>" },
    "tax_issue_present": { "score": <1-10>, "note": "<brief>" },
    "interest_level": { "score": <1-10>, "note": "<brief>" },
    "qualification": { "score": <1-10>, "note": "<brief>" }
  },
  "lead_verdict": "<hot|warm|cold|dead|fake>",
  "summary": "<2-3 sentence summary for vendor report>",
  "red_flags": ["<list any red flags>"],
  "key_details": {
    "answered": <boolean>,
    "voicemail": <boolean>,
    "tax_type": "<irs|state|both|unclear|none>",
    "tax_amount_mentioned": "<string or null>",
    "employed": "<yes|no|unclear>",
    "willing_to_proceed": "<yes|no|maybe|n/a>"
  }
}

Scoring guide:
- contactability: Did someone answer? Was it the right person? (1=disconnected/wrong number, 10=answered immediately, confirmed identity)
- legitimacy: Is this a real person with a real tax issue? (1=fake/spam, 10=clearly legitimate taxpayer)
- tax_issue_present: Do they actually owe taxes? (1=no tax issue, 10=confirmed large tax debt)
- interest_level: Are they interested in getting help? (1=hostile/not interested, 10=eager to proceed)
- qualification: Overall, is this a viable prospect? (1=total waste, 10=ready to sign)`;

    const userMessage = `Score this outbound call to a vendor-supplied lead.

Agent: ${activity.agentName || 'Unknown'}
Company: ${activity.company || 'Unknown'}
Phone: ${activity.phoneFormatted || activity.phone || 'Unknown'}
Duration: ${activity.durationSeconds || 0} seconds
${activity.caseMatch?.caseId ? `Logics Case: ${activity.caseMatch.domain} #${activity.caseMatch.caseId} — ${activity.caseMatch.name}` : 'No existing case in Logics'}

TRANSCRIPT:
${transcript.slice(0, 12000)}`;

    const resp = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: userMessage }],
      system: systemPrompt,
    }, {
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    const text = resp.data?.content?.[0]?.text || '';

    // Parse JSON — strip any markdown fences
    const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const score = JSON.parse(clean);

    return score;
  } catch (err) {
    log.error(`[Transcribe] Claude scoring failed: ${err.response?.data?.error?.message || err.message}`);
    return null;
  }
}


// ─── Utility ─────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// ─── Manual transcription trigger (for dashboard retry) ──────

async function retryTranscription(activityId) {
  const activity = await ContactActivity.findById(activityId);
  if (!activity) throw new Error('Activity not found');
  if (activity.direction !== 'Outbound') throw new Error('Only outbound calls are transcribed');

  // Reset and re-run
  activity.transcription = { status: 'retrying' };
  activity.callScore = undefined;
  await activity.save();

  // Fire-and-forget
  processOutboundRecording(activityId).catch(err =>
    log.error(`[Transcribe] Retry failed for ${activityId}: ${err.message}`)
  );

  return { ok: true, message: 'Transcription retry started' };
}


module.exports = {
  processOutboundRecording,
  retryTranscription,
  scoreWithClaude,
};
