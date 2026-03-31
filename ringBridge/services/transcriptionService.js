// ringBridge/services/transcriptionService.js
// ─────────────────────────────────────────────────────────────
// Downloads RingEX call recordings for outbound agent calls,
// transcribes via OpenAI Whisper, and scores via Claude API.
// Designed for vendor lead quality reporting.
// ─────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const os = require("os");
const log = require("../utils/logger");
const rcAuthService = require("./rcAuthService");
const ContactActivity = require("../models/ContactActivity");

// ─── Config ──────────────────────────────────────────────────
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const RECORDING_DELAY_MS = parseInt(process.env.RB_RECORDING_DELAY_MS) || 60000;
const RECORDING_MAX_RETRIES =
  parseInt(process.env.RB_RECORDING_MAX_RETRIES) || 6;
const RECORDING_RETRY_INTERVAL_MS = 30000;

const TEMP_DIR = path.join(os.tmpdir(), "ringbridge-recordings");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// ─── Main pipeline ───────────────────────────────────────────

async function processOutboundRecording(activityId) {
  const activity = await ContactActivity.findById(activityId);
  if (!activity) return;

  const ph = activity.phoneFormatted || activity.phone || "?";
  const agent = activity.agentName || "?";

  // Guards
  if (activity.direction !== "Outbound") {
    log.pipeSkip("REC-GUARD", agent, `${ph} — not outbound`);
    return;
  }
  if (!activity.phone) {
    log.pipeSkip("REC-GUARD", agent, `${ph} — no phone number`);
    return;
  }
  if (!OPENAI_API_KEY) {
    log.pipeFail(
      "REC-GUARD",
      agent,
      `${ph} — OPENAI_API_KEY not set, skipping`,
    );
    activity.transcription = { status: "skipped", error: "No OPENAI_API_KEY" };
    await activity.save();
    return;
  }

  log.pipe("REC-PIPELINE", agent, `${ph} — starting transcription pipeline`);

  try {
    activity.transcription = { status: "processing" };
    await activity.save();

    // Step 1: Wait for recording
    log.pipe(
      "REC-WAIT",
      agent,
      `${ph} — waiting ${RECORDING_DELAY_MS / 1000}s for RC to process recording...`,
    );
    await sleep(RECORDING_DELAY_MS);

    // Step 2: Find recording in call log
    log.pipe(
      "REC-SEARCH",
      agent,
      `${ph} — searching RC call log (session: ${activity.callSessionId || "?"})...`,
    );
    const recording = await findRecording(activity);
    if (!recording) {
      log.pipeFail(
        "REC-SEARCH",
        agent,
        `${ph} — recording NOT FOUND after ${RECORDING_MAX_RETRIES} attempts`,
      );
      activity.transcription = {
        status: "no_recording",
        error: "Recording not found in RC call log",
      };
      await activity.save();
      return;
    }
    log.pipeOk(
      "REC-SEARCH",
      agent,
      `${ph} — found recording (${recording.duration}s, id: ${recording.id})`,
    );

    // Step 3: Download audio
    log.pipe("REC-DOWNLOAD", agent, `${ph} — downloading audio...`);
    const audioPath = await downloadRecording(recording.contentUri, activityId);
    if (!audioPath) {
      log.pipeFail("REC-DOWNLOAD", agent, `${ph} — download failed`);
      activity.transcription = {
        status: "download_failed",
        error: "Could not download recording",
      };
      await activity.save();
      return;
    }
    const fileSize = (fs.statSync(audioPath).size / 1024 / 1024).toFixed(2);
    log.pipeOk(
      "REC-DOWNLOAD",
      agent,
      `${ph} — ${fileSize}MB saved to ${path.basename(audioPath)}`,
    );

    // Step 4: Transcribe with Whisper
    log.pipe(
      "WHISPER",
      agent,
      `${ph} — sending ${fileSize}MB to OpenAI Whisper...`,
    );
    const whisperStart = Date.now();
    const transcript = await transcribeWithWhisper(audioPath);
    const whisperMs = Date.now() - whisperStart;

    // Clean up temp file
    try {
      fs.unlinkSync(audioPath);
    } catch {
      /* ignore */
    }

    if (!transcript) {
      log.pipeFail("WHISPER", agent, `${ph} — returned empty (${whisperMs}ms)`);
      activity.transcription = {
        status: "transcription_failed",
        error: "Whisper returned empty",
      };
      await activity.save();
      return;
    }
    log.pipeOk(
      "WHISPER",
      agent,
      `${ph} — ${transcript.length} chars in ${whisperMs}ms`,
    );

    // Step 5: Score with Claude
    let scoring = null;
    if (ANTHROPIC_API_KEY) {
      log.pipe("CLAUDE-QC", agent, `${ph} — scoring with Claude Sonnet...`);
      const claudeStart = Date.now();
      scoring = await scoreWithClaude(transcript, activity);
      const claudeMs = Date.now() - claudeStart;
      if (scoring) {
        log.pipeOk(
          "CLAUDE-QC",
          agent,
          `${ph} — score: ${scoring.overall}/10, verdict: ${scoring.lead_verdict} (${claudeMs}ms)`,
        );
        if (scoring.red_flags?.length > 0) {
          log.pipe(
            "CLAUDE-QC",
            agent,
            `${ph} — red flags: ${scoring.red_flags.join(", ")}`,
          );
        }
      } else {
        log.pipeFail(
          "CLAUDE-QC",
          agent,
          `${ph} — scoring returned null (${claudeMs}ms)`,
        );
      }
    } else {
      log.pipeSkip(
        "CLAUDE-QC",
        agent,
        `${ph} — ANTHROPIC_API_KEY not set, skipping scoring`,
      );
    }

    // Step 6: Save everything
    activity.transcription = {
      status: "completed",
      text: transcript,
      recordingDuration: recording.duration,
      recordingUri: recording.contentUri,
      transcribedAt: new Date(),
    };
    if (scoring) {
      activity.callScore = scoring;
    }
    await activity.save();

    log.pipeOk(
      "REC-PIPELINE",
      agent,
      `${ph} — COMPLETE | transcript: ${transcript.length} chars | score: ${scoring?.overall || "N/A"}/10 | verdict: ${scoring?.lead_verdict || "N/A"}`,
    );

    // SSE broadcast
    try {
      const { broadcastSSE } = require("../engine/stateEngine");
      broadcastSSE("transcriptionComplete", {
        _id: activity._id,
        phone: activity.phone,
        phoneFormatted: activity.phoneFormatted,
        agentName: activity.agentName,
        transcriptionStatus: "completed",
        callScore: scoring,
        transcriptPreview: transcript.slice(0, 200),
      });
    } catch {
      /* best-effort */
    }
  } catch (err) {
    log.pipeFail("REC-PIPELINE", agent, `${ph} — FATAL: ${err.message}`);
    activity.transcription = { status: "error", error: err.message };
    await activity.save();
  }
}

// ─── Find recording in RC call log ───────────────────────────

async function findRecording(activity) {
  const platform = rcAuthService.getPlatform();
  if (!platform) {
    log.pipeFail("REC-SEARCH", "", "RC not authenticated");
    return null;
  }

  const ph = activity.phoneFormatted || activity.phone || "?";
  const agent = activity.agentName || "?";
  const agentLabel = `${agent} ${ph}`;

  for (let attempt = 0; attempt < RECORDING_MAX_RETRIES; attempt++) {
    try {
      // Extension-level call-log does NOT support sessionId as a query param
      // (RC rejects it when combined with type, direction, or dateFrom).
      // Instead: query by time window + direction + type, match sessionId client-side.
      // This is the pattern RC developer support recommends.
      const params = {
        direction: "Outbound",
        type: "Voice",
        perPage: 10,
        view: "Detailed",
      };

      if (activity.callStartTime) {
        params.dateFrom = new Date(
          activity.callStartTime.getTime() - 30 * 60000,
        ).toISOString();
      }

      log.pipe(
        "REC-SEARCH",
        agent,
        `${ph} — querying call log (attempt ${attempt + 1}/${RECORDING_MAX_RETRIES}, will match sessionId: ${activity.callSessionId || "none"} client-side)`,
      );

      const resp = await rcAuthService.apiCall(
        "get",
        `/restapi/v1.0/account/~/extension/${activity.extensionId}/call-log`,
        params,
      );

      // ─── Verbose diagnostic logging ───────────────────────
      if (!resp?.ok) {
        const rawStatus = resp?.status || resp?.statusCode || "unknown";
        const rawError = resp?.error || resp?.message || "";
        const rawData = resp?.data
          ? JSON.stringify(resp.data).slice(0, 500)
          : "no data";
        log.pipeFail(
          "REC-SEARCH",
          agent,
          `${ph} — API returned ok:false (attempt ${attempt + 1}) | status: ${rawStatus} | error: ${rawError} | data: ${rawData}`,
        );

        if (attempt < RECORDING_MAX_RETRIES - 1) {
          await sleep(RECORDING_RETRY_INTERVAL_MS);
        }
        continue;
      }

      const records = resp.data?.records || [];
      const totalRecords = resp.data?.paging?.totalElements ?? records.length;

      log.pipe(
        "REC-SEARCH",
        agent,
        `${ph} — API ok, ${records.length} records returned (total: ${totalRecords})`,
      );

      // Log each record's details
      for (const r of records) {
        const hasRecording = !!r.recording;
        const recId = r.recording?.id || "none";
        const rSessionId = r.sessionId || "none";
        const rTo = r.to?.phoneNumber || r.to?.name || "?";
        const rDuration = r.duration || 0;
        const sessionMatch =
          rSessionId === activity.callSessionId ? "✓ MATCH" : "✗ mismatch";
        log.pipe(
          "REC-SEARCH",
          agent,
          `  record: session=${rSessionId} (${sessionMatch}) to=${rTo} dur=${rDuration}s recording=${hasRecording ? `YES id:${recId}` : "NO — not yet attached"}`,
        );
      }

      // Try to match by session ID
      if (activity.callSessionId) {
        // Session match WITH recording — success
        const matchWithRec = records.find(
          (r) => r.sessionId === activity.callSessionId && r.recording,
        );
        if (matchWithRec?.recording) {
          log.pipeOk(
            "REC-SEARCH",
            agent,
            `${ph} — ✓ FOUND recording (session match) id:${matchWithRec.recording.id}`,
          );
          return {
            contentUri: matchWithRec.recording.contentUri,
            duration: matchWithRec.duration,
            id: matchWithRec.recording.id,
          };
        }

        // Session match WITHOUT recording — RC still processing
        const matchNoRec = records.find(
          (r) => r.sessionId === activity.callSessionId && !r.recording,
        );
        if (matchNoRec) {
          log.pipe(
            "REC-SEARCH",
            agent,
            `${ph} — session match EXISTS but recording NOT YET ATTACHED (attempt ${attempt + 1}) — RC still processing`,
          );
        } else if (records.length === 0) {
          log.pipe(
            "REC-SEARCH",
            agent,
            `${ph} — zero records returned — call log entry not synced yet (attempt ${attempt + 1})`,
          );
        }
      }

      // Fallback: match by phone number
      if (activity.phone) {
        const phoneDigits = activity.phone.replace(/\D/g, "");
        for (const r of records) {
          if (!r.recording) continue;
          const toDigits = (r.to?.phoneNumber || "").replace(/\D/g, "");
          if (
            toDigits.endsWith(phoneDigits) ||
            phoneDigits.endsWith(toDigits.slice(-10))
          ) {
            log.pipeOk(
              "REC-SEARCH",
              agent,
              `${ph} — ✓ FOUND recording (phone fallback) id:${r.recording.id}`,
            );
            return {
              contentUri: r.recording.contentUri,
              duration: r.duration,
              id: r.recording.id,
            };
          }
        }
      }

      // No match yet — retry
      if (attempt < RECORDING_MAX_RETRIES - 1) {
        log.pipe(
          "REC-SEARCH",
          agent,
          `${ph} — no recording yet, waiting ${RECORDING_RETRY_INTERVAL_MS / 1000}s before retry...`,
        );
        await sleep(RECORDING_RETRY_INTERVAL_MS);
      }
    } catch (err) {
      log.pipeFail(
        "REC-SEARCH",
        agent,
        `${ph} — EXCEPTION (attempt ${attempt + 1}): ${err.message}`,
      );
      if (err.response) {
        log.pipeFail(
          "REC-SEARCH",
          agent,
          `  HTTP ${err.response.status} — ${JSON.stringify(err.response.data || "").slice(0, 300)}`,
        );
      }
      if (attempt < RECORDING_MAX_RETRIES - 1) {
        await sleep(RECORDING_RETRY_INTERVAL_MS);
      }
    }
  }

  return null;
}

// ─── Download recording ──────────────────────────────────────

async function downloadRecording(contentUri, activityId) {
  try {
    const token = await rcAuthService.getAccessToken();
    if (!token) {
      log.pipeFail("REC-DOWNLOAD", "", "No RC access token available");
      return null;
    }

    const axios = require("axios");
    const resp = await axios.get(contentUri, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: "arraybuffer",
      timeout: 60000,
      maxRedirects: 5,
    });

    const ct = resp.headers["content-type"] || "";
    const ext = ct.includes("mpeg")
      ? ".mp3"
      : ct.includes("wav")
        ? ".wav"
        : ".mp3";
    const filePath = path.join(TEMP_DIR, `${activityId}${ext}`);
    fs.writeFileSync(filePath, resp.data);

    return filePath;
  } catch (err) {
    log.pipeFail(
      "REC-DOWNLOAD",
      "",
      `HTTP error: ${err.response?.status || "?"} — ${err.message}`,
    );
    return null;
  }
}

// ─── Whisper transcription ───────────────────────────────────

async function transcribeWithWhisper(audioPath) {
  try {
    const FormData = require("form-data");
    const axios = require("axios");

    const form = new FormData();
    form.append("file", fs.createReadStream(audioPath));
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");

    const resp = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        timeout: 120000,
        maxContentLength: Infinity,
      },
    );

    const data = resp.data;
    if (data.segments && data.segments.length > 0) {
      return data.segments.map((s) => s.text.trim()).join(" ");
    }
    return data.text || "";
  } catch (err) {
    log.pipeFail(
      "WHISPER",
      "",
      `API error: ${err.response?.data?.error?.message || err.message}`,
    );
    return null;
  }
}

// ─── Claude scoring ──────────────────────────────────────────

async function scoreWithClaude(transcript, activity) {
  try {
    const axios = require("axios");

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

Agent: ${activity.agentName || "Unknown"}
Company: ${activity.company || "Unknown"}
Phone: ${activity.phoneFormatted || activity.phone || "Unknown"}
Duration: ${activity.durationSeconds || 0} seconds
${activity.caseMatch?.caseId ? `Logics Case: ${activity.caseMatch.domain} #${activity.caseMatch.caseId} — ${activity.caseMatch.name}` : "No existing case in Logics"}

TRANSCRIPT:
${transcript.slice(0, 12000)}`;

    const resp = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: userMessage }],
        system: systemPrompt,
      },
      {
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );

    const text = resp.data?.content?.[0]?.text || "";
    const clean = text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const score = JSON.parse(clean);
    return score;
  } catch (err) {
    log.pipeFail(
      "CLAUDE-QC",
      "",
      `API error: ${err.response?.data?.error?.message || err.message}`,
    );
    return null;
  }
}

// ─── Utility ─────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryTranscription(activityId) {
  const activity = await ContactActivity.findById(activityId);
  if (!activity) throw new Error("Activity not found");
  if (activity.direction !== "Outbound")
    throw new Error("Only outbound calls are transcribed");

  const ph = activity.phoneFormatted || activity.phone || "?";
  log.pipe(
    "REC-RETRY",
    activity.agentName || "?",
    `${ph} — manual retry triggered`,
  );

  activity.transcription = { status: "retrying" };
  activity.callScore = undefined;
  await activity.save();

  processOutboundRecording(activityId).catch((err) =>
    log.pipeFail(
      "REC-RETRY",
      activity.agentName || "?",
      `${ph}: ${err.message}`,
    ),
  );

  return { ok: true, message: "Transcription retry started" };
}

module.exports = {
  processOutboundRecording,
  retryTranscription,
  scoreWithClaude,
};
