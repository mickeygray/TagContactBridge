// shared/services/aiService.js
// Unified AI wrapper — all bridges use this instead of direct API calls.
// One place for rate limiting, cost tracking, model swaps, fallbacks.

const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Claude completion — used for scoring, analysis, content generation, SMS responses.
 *
 * Two calling patterns:
 *   1. Simple: { system, prompt } — single user message
 *   2. Conversation: { system, messages } — multi-turn history (for SMS threads)
 *      messages format: [{ role: "user"|"assistant", content: "..." }, ...]
 */
async function claudeComplete({ system, prompt, messages, maxTokens = 1024, model = "claude-sonnet-4-20250514" }) {
  // Build messages array — either from explicit messages or a single prompt
  let msgArray;
  if (messages && messages.length > 0) {
    msgArray = messages;
  } else if (prompt) {
    msgArray = [{ role: "user", content: prompt }];
  } else {
    throw new Error("claudeComplete requires either `prompt` or `messages`");
  }

  // Claude requires alternating user/assistant roles starting with user.
  // Clean up any consecutive same-role messages by merging them.
  const cleaned = [];
  for (const msg of msgArray) {
    const last = cleaned[cleaned.length - 1];
    if (last && last.role === msg.role) {
      last.content += "\n" + msg.content;
    } else {
      cleaned.push({ role: msg.role, content: msg.content });
    }
  }

  // Ensure first message is from user (Claude requirement)
  if (cleaned.length > 0 && cleaned[0].role !== "user") {
    cleaned.unshift({ role: "user", content: "(conversation start)" });
  }

  const response = await claude.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: cleaned,
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
