// shared/services/aiService.js
// Unified AI wrapper — all bridges use this instead of direct API calls.
// One place for rate limiting, cost tracking, model swaps, fallbacks.

const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Claude completion — used for scoring, analysis, content generation
 */
async function claudeComplete({ system, prompt, maxTokens = 1024, model = "claude-sonnet-4-20250514" }) {
  const response = await claude.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content?.find((b) => b.type === "text");
  if (!textBlock) {
    throw new Error(`Claude returned no text content (${response.content?.length || 0} blocks)`);
  }
  return textBlock.text;
}

/**
 * Whisper transcription — used for call recordings
 */
async function whisperTranscribe(audioBuffer, filename = "recording.wav") {
  const file = new File([audioBuffer], filename, { type: "audio/wav" });
  const response = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file,
  });
  return response.text;
}

/**
 * Claude JSON completion — returns parsed JSON
 */
async function claudeJSON({ system, prompt, maxTokens = 2048 }) {
  const text = await claudeComplete({ system, prompt, maxTokens });
  const clean = text.replace(/```json\n?|```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch (err) {
    throw new Error(`Claude returned invalid JSON: ${err.message}\nRaw response: ${text.slice(0, 500)}`);
  }
}

module.exports = { claudeComplete, claudeJSON, whisperTranscribe };
