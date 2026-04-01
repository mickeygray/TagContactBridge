// clientBridge/routes/templates.js
// AI-powered template generation endpoint
const express = require("express");
const router = express.Router();
const auth = require("../../shared/middleware/authMiddleware");

let claudeComplete;
try {
  ({ claudeComplete } = require("../../shared/services/aiService"));
} catch {
  claudeComplete = null;
}

const BRAND_VOICE = {
  TAG: {
    name: "Tax Advocate Group",
    phone: "800-471-9431",
    url: "taxadvocategroup.com",
    signature: "Tax Advocate Group Team",
  },
  WYNN: {
    name: "Wynn Tax Solutions",
    phone: "866-770-3749",
    url: "wynntaxsolutions.com",
    signature: "Wynn Tax Solutions Team",
  },
};

const MERGE_TOKENS = ["{name}", "{first_name}", "{last_name}", "{phone}", "{email}", "{case_number}", "{amount}", "{date}", "{schedule_url}"];

router.post("/generate", auth, async (req, res) => {
  try {
    if (!claudeComplete) {
      return res.status(503).json({ error: "AI service not available" });
    }

    const { type, purpose, brand = "TAG", tone = "professional" } = req.body;
    if (!purpose) {
      return res.status(400).json({ error: "Purpose is required" });
    }

    const brandInfo = BRAND_VOICE[brand] || BRAND_VOICE.TAG;
    const isEmail = type === "email";

    const system = `You are a content writer for ${brandInfo.name}, a tax resolution firm.
You write ${isEmail ? "marketing emails" : "SMS messages"} that are:
- TCPA and CAN-SPAM compliant
- ${tone} in tone
- Concise and action-oriented
- Using merge tokens where appropriate: ${MERGE_TOKENS.join(", ")}

Brand details:
- Company: ${brandInfo.name}
- Phone: ${brandInfo.phone}
- Website: ${brandInfo.url}

${isEmail ? "Include a subject line. Keep body under 300 words. Include an unsubscribe notice." : "Keep under 160 characters. Include company name."}

Return ONLY valid JSON with this schema:
${isEmail
  ? '{ "subject": "...", "body": "...", "tokens": ["..."] }'
  : '{ "body": "...", "tokens": ["..."] }'
}`;

    const prompt = `Create a ${type} template for: ${purpose}`;

    const text = await claudeComplete({ system, prompt, maxTokens: 1024 });
    const clean = text.replace(/```json\n?|```/g, "").trim();
    const result = JSON.parse(clean);

    res.json(result);
  } catch (err) {
    console.error("[TEMPLATE-GEN] Error:", err.message);
    res.status(500).json({ error: "Template generation failed: " + err.message });
  }
});

module.exports = router;
