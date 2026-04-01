const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function claudeComplete({ system, prompt, maxTokens = 1024, model = "claude-sonnet-4-20250514" }) {
  const response = await claude.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
  });
  return response.content[0].text;
}

async function whisperTranscribe(audioBuffer, filename = "recording.wav") {
  const file = new File([audioBuffer], filename, { type: "audio/wav" });
  const response = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file,
  });
  return response.text;
}

async function claudeJSON({ system, prompt, maxTokens = 2048 }) {
  const text = await claudeComplete({ system, prompt, maxTokens });
  const clean = text.replace(/```json\n?|```/g, "").trim();
  return JSON.parse(clean);
}

module.exports = { claudeComplete, claudeJSON, whisperTranscribe };
