// services/smsService.js
// ─────────────────────────────────────────────────────────────
// SMS Conversation Intelligence Service.
// All business logic — Mongo, AI, CallRail, auto-send timer.
// Port-agnostic but lives on port 5000 with the React app.
//
// Called by: controllers/smsController.js
// ─────────────────────────────────────────────────────────────

const axios = require("axios");
const SmsConversation = require("../models/SmsConversation");
const LeadCadence = require("../models/LeadCadence");
const { getCompanyConfig } = require("../config/companyConfig");
const { updateCaseStatus } = require("./logicsService");
const nodemailer = require("nodemailer");
const { deactivateLead } = require("../utils/deactivateLead");
// ─── Runtime Settings ────────────────────────────────────────────────────────
const HARD_STOP_KEYWORDS = ["stop", "unsubscribe", "cancel", "quit"];

function isHardStop(message) {
  const clean = (message || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s]/g, "");
  return HARD_STOP_KEYWORDS.includes(clean);
}
let autoSendEnabled = process.env.SMS_AUTO_SEND_ENABLED !== "false";
let autoSendDelayMs =
  Number(process.env.SMS_AUTO_SEND_DELAY_MS) || 5 * 60 * 1000;

// ─── Tracking Number → Company + Type ────────────────────────────────────────

function buildTrackingMap() {
  // Pull tracking numbers from companyConfig for each company
  // Prospect numbers → AI responds
  // Client numbers → alert only, no AI
  const { COMPANIES } = require("../config/companyConfig");
  const map = {};

  for (const [key, cfg] of Object.entries(COMPANIES)) {
    // Prospect tracking numbers (AI auto-respond)
    const prospectNumbers = (cfg.callrailTrackingNumber || "")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);

    for (const num of prospectNumbers) {
      const digits = num.replace(/\D/g, "");
      if (digits) map[digits] = { company: key, type: "prospect" };
      if (digits.startsWith("1") && digits.length === 11) {
        map[digits.slice(1)] = { company: key, type: "prospect" };
      }
    }

    // Client tracking numbers (alert only, no AI)
    const clientNumbers = (cfg.clientContactPhone || "")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);

    for (const num of clientNumbers) {
      const digits = num.replace(/\D/g, "");
      if (digits) map[digits] = { company: key, type: "client" };
      if (digits.startsWith("1") && digits.length === 11) {
        map[digits.slice(1)] = { company: key, type: "client" };
      }
    }
  }

  console.log("[SMS-SVC] Tracking map:", map);
  return map;
}

let TRACKING_NUMBER_MAP = {};

function resolveCompany(trackingNumber) {
  const d = (trackingNumber || "").replace(/\D/g, "");
  const match =
    TRACKING_NUMBER_MAP[d] ||
    TRACKING_NUMBER_MAP[d.replace(/^1/, "")] ||
    TRACKING_NUMBER_MAP["1" + d] ||
    null;
  return match; // { company: "TAG", type: "prospect" | "client" } or null
}

// ─── Client Phones (alert only, no auto-respond) ────────────────────────────

const CLIENT_PHONES = new Set();

function loadClientPhones() {
  const phones = (process.env.SMS_CLIENT_PHONES || "")
    .split(",")
    .filter(Boolean);
  for (const p of phones) CLIENT_PHONES.add(p.replace(/\D/g, ""));
  if (phones.length)
    console.log(`[SMS-SVC] Loaded ${phones.length} client phones`);
}

function isClientPhone(phone) {
  return CLIENT_PHONES.has((phone || "").replace(/\D/g, ""));
}

function addClientPhone(phone) {
  CLIENT_PHONES.add((phone || "").replace(/\D/g, ""));
}

// ─── Business Hours ──────────────────────────────────────────────────────────

function isBusinessHours() {
  const ct = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }),
  );
  return (
    ct.getDay() >= 1 &&
    ct.getDay() <= 5 &&
    ct.getHours() >= 7 &&
    ct.getHours() < 17
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// AI RESPONSE GENERATION
// ═════════════════════════════════════════════════════════════════════════════

function buildSystemPrompt(company, leadInfo) {
  const config = getCompanyConfig(company);

  const companyBlock =
    company === "TAG"
      ? `You are a professional SMS representative for Tax Advocate Group (TAG).
Phone: ${config.tollFreePhone}
Schedule: ${config.scheduleUrl}
Services: Tax relief, tax resolution, tax negotiation, IRS representation, offer in compromise, penalty abatement, wage garnishment relief, bank levy release, lien removal, unfiled tax returns, audit defense, state tax relief.`
      : `You are a professional SMS representative for Wynn Tax Solutions.
Phone: ${config.localPhone || config.tollFreePhone}
Schedule: ${config.scheduleUrl}
Services: Tax relief, tax resolution, IRS representation, offer in compromise, installment agreements, penalty abatement, wage garnishment relief, unfiled tax returns, audit defense.`;

  const leadBlock = leadInfo
    ? `\nCONTACT INFO:\n  Name: ${leadInfo.name || "Unknown"}\n  Email: ${leadInfo.email || "N/A"}\n  Case ID: ${leadInfo.caseId || "N/A"}\n  Source: ${leadInfo.source || "N/A"}\n  State: ${leadInfo.state || "N/A"}`
    : "\nNo prior contact information available for this person.";

  return `${companyBlock}

TONE & VOICE:
- Professional and courteous at all times. This is tax resolution — people are often stressed, confused, or skeptical.
- Formal but approachable. Use complete sentences. No slang, no emojis, no exclamation points.
- Concise. Every message should be 1-3 sentences. This is SMS, not email.
- Use the contact's first name when known.
- Never mention you are AI, automated, or a bot. You represent the firm.

GOAL:
Your primary objective is to schedule a consultation call. Guide the conversation toward booking a time or confirming a callback.

RESPONDING TO COMMON MESSAGES:

Pricing / cost questions:
  "Every tax situation is unique. We offer a free consultation to evaluate your case and discuss options. Would you like to schedule a call?"

Case status questions:
  "I'll have your case team review and follow up with you directly. Is there a preferred time for them to call?"

Scheduling requests:
  Provide the scheduling link: ${config.scheduleUrl}

General tax questions:
  Provide a brief, accurate answer and pivot to scheduling. "That's a great question. [1 sentence answer]. Our team can walk you through how this applies to your situation — would you like to schedule a call?"

Skepticism / "is this legit":
  "Absolutely. [Company name] is a licensed tax resolution firm. We've helped thousands of clients resolve their tax issues with the IRS. We'd be happy to discuss your situation in a free consultation."

"Who is this" / "How did you get my number":
  "This is [Company name]. You recently inquired about tax resolution assistance. We're following up to see if you'd like to schedule a free consultation."

Urgency / distress (garnishment, levy, seizure):
  "I understand this is stressful. Our team handles these situations regularly and can review your options. Let me have someone call you — is now a good time, or would you prefer to schedule?"

OPT-OUT DETECTION:
People do not always type "STOP." You must recognize when someone is declining further contact regardless of how they phrase it. Examples include:
  - "I already have a service"
  - "I don't need help"
  - "Not interested"
  - "Please don't text me"
  - "Remove me"
  - "I'm good"
  - "Already working with someone"
  - "No thanks"
  - "Leave me alone"
  - "Wrong number"
  - "I didn't request this"
  - Any variation expressing they do not want to be contacted

When you detect an opt-out intent, you MUST:
1. Begin your response with exactly [OPT-OUT] (including brackets)
2. Follow with a professional closing: "Understood. We've removed you from our contact list. If a tax issue arises in the future, please don't hesitate to reach out to us at ${config.tollFreePhone}. We wish you the best."
3. Do NOT try to re-engage, counter-sell, or ask follow-up questions.

When someone explicitly types STOP, UNSUBSCRIBE, CANCEL, or QUIT:
  Respond with: "[OPT-OUT] You've been unsubscribed from messages. If you need assistance in the future, you can reach us at ${config.tollFreePhone}."

HARD RULES:
- Never make promises about outcomes, savings, or dollar amounts
- Never provide specific legal or tax advice
- Never reference IRS procedures by section number
- Never argue with or pressure a contact
- Never send more than 3 sentences in a single message
- Never use emojis, exclamation points, or casual language
- If the message is completely unintelligible or appears to be spam, respond: "I'm sorry, I didn't understand your message. Could you clarify how we can help you?"
${leadBlock}`;
}

async function generateResponse(
  company,
  customerPhone,
  inboundMessage,
  existingMessages,
) {
  console.log(
    `[SMS-AI] ── Generating response for ${customerPhone} (${company}) ──`,
  );

  // Build history from existing messages or fetch from Mongo
  let history;
  if (existingMessages) {
    history = existingMessages.slice(-10).map((m) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.editedContent || m.content,
    }));
    console.log(
      `[SMS-AI] History: ${history.length} messages from conversation`,
    );
  } else {
    const convo = await SmsConversation.findOne({
      customerPhone: customerPhone.replace(/\D/g, ""),
      company,
    }).lean();
    history = (convo?.messages || []).slice(-10).map((m) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.editedContent || m.content,
    }));
    console.log(
      `[SMS-AI] History: ${history.length} messages from Mongo lookup`,
    );
  }

  // Lead lookup
  const lead = await LeadCadence.findOne({
    phone: customerPhone.replace(/\D/g, ""),
    company,
    active: true,
  }).lean();

  if (lead) {
    console.log(
      `[SMS-AI] Lead found: ${lead.name || "unnamed"} | Case: ${lead.caseId || "N/A"} | Source: ${lead.source || "N/A"}`,
    );
  } else {
    console.log(
      `[SMS-AI] No active lead found for ${customerPhone} (${company})`,
    );
  }

  const systemPrompt = buildSystemPrompt(company, lead);
  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: inboundMessage },
  ];

  console.log(
    `[SMS-AI] Sending to OpenAI: ${messages.length} messages (model: ${process.env.SMS_AI_MODEL || "gpt-4o-mini"})`,
  );

  try {
    const OpenAI = require("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    if (!process.env.OPENAI_API_KEY) {
      console.error("[SMS-AI] ✗ OPENAI_API_KEY not set in .env");
      return {
        ok: false,
        response: null,
        error: "OPENAI_API_KEY missing",
        leadInfo: lead,
      };
    }

    const resp = await openai.chat.completions.create({
      model: process.env.SMS_AI_MODEL || "gpt-5-mini",
      messages,
      max_tokens: 200,
      temperature: 0.7,
    });

    const text = resp.choices?.[0]?.message?.content?.trim() || "";
    const tokens = resp.usage;
    console.log(`[SMS-AI] ✓ Response: "${text}"`);
    if (tokens) {
      console.log(
        `[SMS-AI] Tokens: prompt=${tokens.prompt_tokens} completion=${tokens.completion_tokens} total=${tokens.total_tokens}`,
      );
    }
    return { ok: true, response: text, leadInfo: lead };
  } catch (err) {
    console.error("[SMS-AI] ✗ OpenAI error:", err.message);
    if (err.response?.data) {
      console.error(
        "[SMS-AI] ✗ OpenAI detail:",
        JSON.stringify(err.response.data),
      );
    }
    return { ok: false, response: null, error: err.message, leadInfo: lead };
  }
}
async function markLogicsDnc(conversationId) {
  const convo = await SmsConversation.findById(conversationId);
  if (!convo) return { ok: false, error: "Not found" };

  const phone = convo.customerPhone;
  const company = convo.company;

  console.log(`[SMS-SVC] Manual DNC: ${phone} (${company})`);

  // Full deactivation: Logics 173 + Mongo + PB removal
  const result = await deactivateLead({
    phone,
    company,
    reason: "manual-dnc",
    updateLogics: true,
  });

  convo.logicsDncSent = true;
  convo.logicsDncAt = new Date();
  convo.contactType = "opt-out";
  convo.botSleeping = true;
  convo.autoRespondEnabled = false;
  convo.autoSendAt = null;
  await convo.save();

  return { ok: result.ok };
}
// ═════════════════════════════════════════════════════════════════════════════
// SEND VIA CALLRAIL
// ═════════════════════════════════════════════════════════════════════════════

async function sendViaCallRail(convo, content) {
  const config = getCompanyConfig(convo.company);
  if (!config.callrailAccountId || !config.callrailKey) {
    throw new Error(`CallRail not configured for ${convo.company}`);
  }

  console.log(`[SMS-CR] Sending via CallRail (${convo.company}):`);
  console.log(`[SMS-CR]   To: ${convo.customerPhone}`);
  console.log(`[SMS-CR]   From: ${convo.trackingNumber}`);
  console.log(
    `[SMS-CR]   Content: "${content.slice(0, 80)}${content.length > 80 ? "..." : ""}"`,
  );
  console.log(
    `[SMS-CR]   Account: ${config.callrailAccountId} | Company: ${config.callrailCompanyId}`,
  );

  try {
    await axios.post(
      `https://api.callrail.com/v3/a/${config.callrailAccountId}/text-messages.json`,
      {
        customer_phone_number: convo.customerPhone,
        tracking_number: convo.trackingNumber,
        content,
        company_id: config.callrailCompanyId,
      },
      {
        headers: {
          Authorization: `Token token=${config.callrailKey}`,
          "Content-Type": "application/json",
        },
      },
    );
    console.log(`[SMS-CR] ✓ Delivered to ${convo.customerPhone}`);
  } catch (err) {
    console.error(
      `[SMS-CR] ✗ Failed: ${err.response?.status || "?"} ${err.response?.data?.error || err.message}`,
    );
    throw err;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ALERT EMAIL
// ═════════════════════════════════════════════════════════════════════════════

async function sendAlert(convo, inboundText, proposedResponse, company) {
  try {
    const config = getCompanyConfig(company);
    const transport = nodemailer.createTransport({
      host: process.env.SENDGRID_GATEWAY || "smtp.sendgrid.net",
      port: Number(process.env.SENDGRID_PORT) || 587,
      secure: false,
      auth: {
        user: "apikey",
        pass: config.sendgridApiKey || process.env.WYNN_API_KEY,
      },
    });

    const brandName =
      company === "TAG" ? "Tax Advocate Group" : "Wynn Tax Solutions";
    const toEmail = config.toEmail || config.fromEmail;
    const label = convo.leadName || convo.customerPhone;
    const emoji =
      convo.contactType === "opt-out"
        ? "⛔"
        : convo.contactType === "client"
          ? "🔵"
          : "🟡";
    const autoLine =
      convo.contactType === "opt-out"
        ? "⛔ OPT-OUT — Lead deactivated, bot sleeping. Review and approve goodbye message."
        : convo.autoSendAt
          ? `⏱ Auto-send at ${convo.autoSendAt.toLocaleString("en-US", { timeZone: "America/Chicago" })} CT`
          : "⏸ Manual review — no auto-send";

    const subject = `${emoji} [${company}] SMS from ${label} ${convo.caseId ? `| Case #${convo.caseId}` : ""}`;

    const text = `
${emoji} INBOUND SMS · ${brandName}
${"═".repeat(52)}

  From:      ${convo.customerPhone}
  Name:      ${convo.leadName || "Unknown"}
  Type:      ${convo.contactType.toUpperCase()}
  Case:      ${convo.caseId || "N/A"}

${"─".repeat(52)}
THEIR MESSAGE:

  "${inboundText}"

${"─".repeat(52)}
PROPOSED RESPONSE:

  "${proposedResponse || "No response generated"}"

${"─".repeat(52)}
STATUS: ${autoLine}
${"═".repeat(52)}
`.trim();

    await transport.sendMail({
      from: `${brandName} SMS <${config.fromEmail}>`,
      to: toEmail,
      subject,
      text,
    });

    convo.alertSent = true;
    await convo.save();
    console.log(`[SMS-SVC] ✓ Alert sent for ${convo.customerPhone}`);
  } catch (err) {
    console.error("[SMS-SVC] Alert failed:", err.message);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// CLIENT INBOUND — alert only, no AI, no auto-respond
// ═════════════════════════════════════════════════════════════════════════════

const CLIENT_ALERT_EMAIL =
  process.env.CLIENT_SMS_ALERT_EMAIL || "as@taxadvocategroup.com";

async function handleClientInbound({
  phone,
  tracking,
  content,
  company,
  callrailCompanyId,
}) {
  console.log(`[SMS-SVC] ══════════════════════════════════════════════`);
  console.log(`[SMS-SVC] 🔵 CLIENT INBOUND`);
  console.log(`[SMS-SVC]   Phone: ${phone}`);
  console.log(`[SMS-SVC]   Tracking: ${tracking}`);
  console.log(`[SMS-SVC]   Company: ${company}`);
  console.log(`[SMS-SVC]   Message: "${content}"`);
  console.log(`[SMS-SVC]   Action: Alert only → ${CLIENT_ALERT_EMAIL}`);
  console.log(`[SMS-SVC] ══════════════════════════════════════════════`);

  const config = getCompanyConfig(company);

  // Find or create conversation
  let convo = await SmsConversation.findOne({ customerPhone: phone, company });
  if (!convo) {
    convo = new SmsConversation({
      customerPhone: phone,
      trackingNumber: tracking,
      company,
      companyId: callrailCompanyId || "",
      contactType: "client",
      autoRespondEnabled: false,
      botSleeping: true,
      messages: [],
    });
  }

  // Record inbound
  convo.messages.push({
    direction: "inbound",
    content,
    status: "received",
    timestamp: new Date(),
  });
  convo.totalInbound += 1;
  convo.lastInboundAt = new Date();
  convo.responseStatus = "idle"; // no proposed response
  await convo.save();

  // Send alert to client services team
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SENDGRID_GATEWAY || "smtp.sendgrid.net",
      port: Number(process.env.SENDGRID_PORT) || 587,
      secure: false,
      auth: {
        user: "apikey",
        pass: config.sendgridApiKey || process.env.WYNN_API_KEY,
      },
    });

    const brandName =
      company === "TAG" ? "Tax Advocate Group" : "Wynn Tax Solutions";

    const subject = `🔵 [${company}] Client SMS from ${phone}`;
    const text = `
🔵 CLIENT TEXT MESSAGE · ${brandName}
${"═".repeat(52)}

  From:      ${phone}
  Company:   ${brandName}
  Tracking:  ${tracking}
  Time:      ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })} CT

${"─".repeat(52)}
MESSAGE:

  "${content}"

${"─".repeat(52)}
This is a client response. No automated reply will be sent.
Please respond manually via CallRail or the dashboard.
${"═".repeat(52)}
`.trim();

    await transport.sendMail({
      from: `${brandName} <${config.fromEmail}>`,
      to: CLIENT_ALERT_EMAIL,
      subject,
      text,
    });

    convo.alertSent = true;
    await convo.save();
    console.log(`[SMS-SVC] 🔵 Client alert sent to ${CLIENT_ALERT_EMAIL}`);
  } catch (err) {
    console.error("[SMS-SVC] Client alert email failed:", err.message);
  }

  return {
    ok: true,
    conversationId: convo._id,
    company,
    contactType: "client",
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CORE: HANDLE INBOUND SMS
// ═════════════════════════════════════════════════════════════════════════════

async function handleInbound({
  customerPhone,
  trackingNumber,
  content,
  callrailCompanyId,
}) {
  const phone = (customerPhone || "").replace(/\D/g, "");
  const tracking = (trackingNumber || "").replace(/\D/g, "");
  if (!phone || !content)
    return { ok: false, error: "Missing phone or content" };

  const resolved = resolveCompany(trackingNumber);
  const company = resolved?.company || "WYNN";
  const trackingType = resolved?.type || "prospect";

  console.log(`[SMS-SVC] ══════════════════════════════════════════════`);
  console.log(`[SMS-SVC] 📨 INBOUND SMS`);
  console.log(`[SMS-SVC]   From: ${phone}`);
  console.log(`[SMS-SVC]   To: ${tracking}`);
  console.log(`[SMS-SVC]   Company: ${company}`);
  console.log(`[SMS-SVC]   Tracking type: ${trackingType}`);
  console.log(`[SMS-SVC]   Message: "${content}"`);
  console.log(
    `[SMS-SVC]   Resolved: ${resolved ? JSON.stringify(resolved) : "NONE — defaulting to WYNN/prospect"}`,
  );

  // ── Client tracking number → alert only, no AI ────────────────────────
  if (trackingType === "client") {
    console.log(`[SMS-SVC]   Routing → CLIENT handler`);
    return handleClientInbound({
      phone,
      tracking,
      content,
      company,
      callrailCompanyId,
    });
  }

  // ── Prospect tracking number → full AI flow ───────────────────────────
  console.log(`[SMS-SVC]   Routing → PROSPECT handler (AI flow)`);
  const contactType = isClientPhone(phone) ? "client" : "prospect";
  console.log(
    `[SMS-SVC]   Contact type: ${contactType}${isClientPhone(phone) ? " (phone in client list)" : ""}`,
  );

  // Find or create conversation
  let convo = await SmsConversation.findOne({ customerPhone: phone, company });
  const isNew = !convo;
  if (!convo) {
    const lead = await LeadCadence.findOne({
      phone,
      company,
      active: true,
    }).lean();
    console.log(
      `[SMS-SVC]   New conversation | Lead: ${lead ? lead.name + " (Case " + lead.caseId + ")" : "not found"}`,
    );
    convo = new SmsConversation({
      customerPhone: phone,
      trackingNumber: tracking,
      company,
      companyId: callrailCompanyId || "",
      caseId: lead?.caseId || null,
      leadName: lead?.name || "",
      leadEmail: lead?.email || "",
      contactType,
      messages: [],
    });
  } else {
    console.log(
      `[SMS-SVC]   Existing conversation: ${convo._id} | Messages: ${convo.messages.length} | Status: ${convo.responseStatus}`,
    );
  }

  if (convo.botSleeping) {
    console.log("[SMS-SVC] Bot sleeping — waking");
    convo.botSleeping = false;
  }

  // Record inbound
  convo.messages.push({
    direction: "inbound",
    content,
    status: "received",
    timestamp: new Date(),
  });
  convo.totalInbound += 1;
  convo.lastInboundAt = new Date();

  // Generate AI response
  const ai = await generateResponse(company, phone, content, convo.messages);

  // Check for opt-out signal from AI
  if (ai.ok && ai.response) {
    // ── Classify opt-out type ────────────────────────────────
    const hardStop = isHardStop(content);
    const aiOptOut = ai.response.startsWith("[OPT-OUT]");

    if (aiOptOut) {
      ai.response = ai.response.replace("[OPT-OUT]", "").trim();
    }

    // Populate lead info on conversation
    if (ai.leadInfo) {
      convo.leadName = ai.leadInfo.name || convo.leadName;
      convo.leadEmail = ai.leadInfo.email || convo.leadEmail;
      convo.caseId = ai.leadInfo.caseId || convo.caseId;
    }

    convo.proposedResponse = ai.response;

    if (hardStop) {
      // ═══════════════════════════════════════════════════════
      // HARD STOP — TCPA keyword (STOP, UNSUBSCRIBE, etc.)
      // Full deactivation: Logics 173 + Mongo + PB removal
      // ═══════════════════════════════════════════════════════
      console.log(
        `[SMS-SVC] 🛑 HARD STOP: "${content}" from ${phone} (${company})`,
      );

      convo.responseStatus = "pending";
      convo.autoSendAt = null;
      convo.autoRespondEnabled = false;
      convo.botSleeping = true;
      convo.contactType = "opt-out";

      convo.messages.push({
        direction: "outbound",
        content: ai.response,
        aiGenerated: true,
        status: "pending",
        timestamp: new Date(),
      });

      // Full deactivation
      await deactivateLead({
        phone,
        company,
        reason: "sms-opt-out",
        updateLogics: true,
      }).catch((err) =>
        console.error("[SMS-SVC] Deactivation error:", err.message),
      );

      console.log(
        `[SMS-SVC] 🛑 Lead fully deactivated — awaiting goodbye approval`,
      );
    } else if (aiOptOut) {
      // ═══════════════════════════════════════════════════════
      // SOFT DECLINE — AI detected opt-out intent
      // ("not interested", "already have a service", etc.)
      // Just sleep the bot — do NOT deactivate the lead.
      // A rep can still call them via PhoneBurner.
      // ═══════════════════════════════════════════════════════
      console.log(
        `[SMS-SVC] 💤 SOFT DECLINE: AI flagged opt-out for ${phone} (${company})`,
      );
      console.log(`[SMS-SVC]   Their message: "${content}"`);
      console.log(
        `[SMS-SVC]   Action: Sleep bot only — lead stays active in Logics + PB`,
      );

      convo.responseStatus = "pending";
      convo.autoSendAt = null;
      convo.autoRespondEnabled = false;
      convo.botSleeping = true;
      // NOTE: contactType stays as-is (prospect/client) — NOT set to "opt-out"

      convo.messages.push({
        direction: "outbound",
        content: ai.response,
        aiGenerated: true,
        status: "pending",
        timestamp: new Date(),
      });

      // Set SMS DNC only (stop automated texts) but leave lead active
      await LeadCadence.updateMany(
        { phone, company, active: true },
        {
          $set: {
            smsDnc: true,
            smsDncReason: "opted-out",
            dncUpdatedAt: new Date(),
          },
        },
      ).catch((err) =>
        console.error("[SMS-SVC] SMS DNC flag error:", err.message),
      );

      console.log(
        `[SMS-SVC] 💤 Bot sleeping, smsDnc set — awaiting goodbye approval`,
      );
    } else {
      // ═══════════════════════════════════════════════════════
      // NORMAL RESPONSE — apply auto-send timer
      // ═══════════════════════════════════════════════════════
      const canAuto =
        autoSendEnabled &&
        autoSendDelayMs > 0 &&
        isBusinessHours() &&
        contactType !== "client" &&
        convo.autoRespondEnabled;

      convo.responseStatus = "pending";
      convo.autoSendAt = canAuto
        ? new Date(Date.now() + autoSendDelayMs)
        : null;

      const reasons = [];
      if (!autoSendEnabled) reasons.push("auto-send disabled");
      if (autoSendDelayMs === 0) reasons.push("delay=0");
      if (!isBusinessHours()) reasons.push("outside hours");
      if (contactType === "client") reasons.push("client phone");
      if (!convo.autoRespondEnabled) reasons.push("convo paused");

      if (canAuto) {
        console.log(
          `[SMS-SVC] ⏱ Auto-send in ${autoSendDelayMs / 1000}s → ${convo.autoSendAt.toISOString()}`,
        );
      } else {
        console.log(`[SMS-SVC] ⏸ Manual only — ${reasons.join(", ")}`);
      }

      console.log(`[SMS-SVC] Proposed: "${ai.response}"`);

      convo.messages.push({
        direction: "outbound",
        content: ai.response,
        aiGenerated: true,
        status: "pending",
        timestamp: new Date(),
      });
    }
  } else {
    convo.responseStatus = "idle";
    console.log(`[SMS-SVC] No AI response generated — status set to idle`);
  }

  await convo.save();
  console.log(`[SMS-SVC] ✓ Conversation saved: ${convo._id}`);
  console.log(
    `[SMS-SVC]   Messages: ${convo.messages.length} | Status: ${convo.responseStatus} | Auto-send: ${convo.autoSendAt || "none"}`,
  );

  console.log(`[SMS-SVC] Sending alert email...`);
  await sendAlert(convo, content, ai.response, company);

  console.log(`[SMS-SVC] ══════════════════════════════════════════════`);
  return { ok: true, conversationId: convo._id, company, contactType };
}

// ═════════════════════════════════════════════════════════════════════════════
// DASHBOARD ACTIONS
// ═════════════════════════════════════════════════════════════════════════════

async function sendPending(conversationId, overrideContent) {
  console.log(
    `[SMS-SVC] sendPending: ${conversationId}${overrideContent ? " (edited)" : ""}`,
  );
  const convo = await SmsConversation.findById(conversationId);
  if (!convo) {
    console.log("[SMS-SVC] sendPending: not found");
    return { ok: false, error: "Not found" };
  }
  if (convo.responseStatus === "sent") {
    console.log("[SMS-SVC] sendPending: already sent");
    return { ok: false, error: "Already sent" };
  }

  const content = overrideContent || convo.proposedResponse;
  if (!content) {
    console.log("[SMS-SVC] sendPending: no content");
    return { ok: false, error: "No content" };
  }

  try {
    await sendViaCallRail(convo, content);

    convo.responseStatus = "sent";
    convo.autoSendAt = null;
    convo.totalOutbound += 1;
    convo.lastOutboundAt = new Date();

    const msg = [...convo.messages]
      .reverse()
      .find((m) => m.direction === "outbound" && m.status === "pending");
    if (msg) {
      msg.status = "sent";
      msg.sentAt = new Date();
      if (overrideContent) msg.editedContent = overrideContent;
    }

    await convo.save();
    console.log(`[SMS-SVC] ✓ Sent to ${convo.customerPhone}`);
    return { ok: true };
  } catch (err) {
    console.error(
      `[SMS-SVC] ✗ Send failed for ${convo.customerPhone}:`,
      err.message,
    );
    return { ok: false, error: err.message };
  }
}

async function approve(conversationId) {
  console.log(`[SMS-SVC] Approve: ${conversationId}`);
  return sendPending(conversationId);
}

async function cancel(conversationId) {
  console.log(`[SMS-SVC] Cancel: ${conversationId}`);
  const convo = await SmsConversation.findById(conversationId);
  if (!convo) return { ok: false, error: "Not found" };

  convo.responseStatus = "cancelled";
  convo.autoSendAt = null;
  const msg = [...convo.messages]
    .reverse()
    .find((m) => m.direction === "outbound" && m.status === "pending");
  if (msg) msg.status = "cancelled";

  await convo.save();
  console.log(`[SMS-SVC] ✓ Cancelled for ${convo.customerPhone}`);
  return { ok: true };
}

async function editAndSend(conversationId, newContent) {
  console.log(
    `[SMS-SVC] EditAndSend: ${conversationId} → "${newContent.slice(0, 60)}..."`,
  );
  return sendPending(conversationId, newContent);
}

async function manualSend(conversationId, content) {
  console.log(
    `[SMS-SVC] ManualSend: ${conversationId} → "${content.slice(0, 60)}..."`,
  );
  const convo = await SmsConversation.findById(conversationId);
  if (!convo) {
    console.log("[SMS-SVC] ManualSend: not found");
    return { ok: false, error: "Not found" };
  }

  await sendViaCallRail(convo, content);

  convo.messages.push({
    direction: "outbound",
    content,
    aiGenerated: false,
    status: "sent",
    sentAt: new Date(),
    timestamp: new Date(),
  });
  convo.totalOutbound += 1;
  convo.lastOutboundAt = new Date();
  convo.responseStatus = "idle";
  convo.autoSendAt = null;
  await convo.save();

  console.log(`[SMS-SVC] ✓ Manual sent to ${convo.customerPhone}`);
  return { ok: true };
}

async function regenerate(conversationId) {
  console.log(`[SMS-SVC] Regenerate: ${conversationId}`);
  const convo = await SmsConversation.findById(conversationId);
  if (!convo) return { ok: false, error: "Not found" };

  const lastIn = [...convo.messages]
    .reverse()
    .find((m) => m.direction === "inbound");
  if (!lastIn) {
    console.log("[SMS-SVC] Regenerate: no inbound to respond to");
    return { ok: false, error: "No inbound to respond to" };
  }

  console.log(`[SMS-SVC] Regenerating for "${lastIn.content.slice(0, 60)}..."`);
  const ai = await generateResponse(
    convo.company,
    convo.customerPhone,
    lastIn.content,
    convo.messages,
  );
  if (!ai.ok) {
    console.log(`[SMS-SVC] Regenerate failed: ${ai.error}`);
    return { ok: false, error: ai.error };
  }

  // Cancel old pending
  const old = [...convo.messages]
    .reverse()
    .find((m) => m.direction === "outbound" && m.status === "pending");
  if (old) {
    old.status = "cancelled";
    console.log("[SMS-SVC] Old pending cancelled");
  }

  convo.proposedResponse = ai.response;
  convo.responseStatus = "pending";
  convo.messages.push({
    direction: "outbound",
    content: ai.response,
    aiGenerated: true,
    status: "pending",
    timestamp: new Date(),
  });

  if (
    autoSendEnabled &&
    isBusinessHours() &&
    convo.autoRespondEnabled &&
    autoSendDelayMs > 0
  ) {
    convo.autoSendAt = new Date(Date.now() + autoSendDelayMs);
    console.log(
      `[SMS-SVC] Auto-send rescheduled at ${convo.autoSendAt.toISOString()}`,
    );
  }

  await convo.save();
  console.log(`[SMS-SVC] ✓ Regenerated: "${ai.response.slice(0, 60)}..."`);
  return { ok: true, response: ai.response };
}

async function sleep(conversationId) {
  console.log(`[SMS-SVC] Sleep: ${conversationId}`);
  const convo = await SmsConversation.findById(conversationId);
  if (!convo) return { ok: false, error: "Not found" };
  convo.botSleeping = true;
  convo.autoSendAt = null;
  convo.responseStatus = "cancelled";
  await convo.save();
  console.log(`[SMS-SVC] ✓ Bot sleeping for ${convo.customerPhone}`);
  return { ok: true };
}

async function wake(conversationId) {
  console.log(`[SMS-SVC] Wake: ${conversationId}`);
  const convo = await SmsConversation.findById(conversationId);
  if (!convo) return { ok: false, error: "Not found" };
  convo.botSleeping = false;
  await convo.save();
  console.log(`[SMS-SVC] ✓ Bot awake for ${convo.customerPhone}`);
  return { ok: true };
}

// ═════════════════════════════════════════════════════════════════════════════
// QUERY HELPERS
// ═════════════════════════════════════════════════════════════════════════════

async function listConversations({
  status,
  company,
  contactType,
  search,
  page = 1,
  limit = 20,
}) {
  const filter = {};
  if (status && status !== "all") filter.responseStatus = status;
  if (company && company !== "all") filter.company = company.toUpperCase();
  if (contactType && contactType !== "all") filter.contactType = contactType;
  if (search) {
    const regex = new RegExp(search, "i");
    filter.$or = [
      { customerPhone: regex },
      { leadName: regex },
      { leadEmail: regex },
    ];
  }

  const total = await SmsConversation.countDocuments(filter);
  const conversations = await SmsConversation.find(filter)
    .sort({ lastInboundAt: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .lean();

  // Slim for list view
  const slim = conversations.map((c) => ({
    ...c,
    messages: c.messages.slice(-2),
    messageCount: c.messages?.length || 0,
  }));

  return {
    conversations: slim,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
  };
}

async function getConversation(id) {
  return SmsConversation.findById(id).lean();
}

async function getStats() {
  const today = new Date(new Date().setHours(0, 0, 0, 0));
  const [pending, total, todayInbound, todaySent] = await Promise.all([
    SmsConversation.countDocuments({ responseStatus: "pending" }),
    SmsConversation.countDocuments(),
    SmsConversation.countDocuments({ lastInboundAt: { $gte: today } }),
    SmsConversation.countDocuments({
      responseStatus: "sent",
      lastOutboundAt: { $gte: today },
    }),
  ]);

  return {
    pending,
    total,
    todayInbound,
    todaySent,
    businessHours: isBusinessHours(),
    autoSendEnabled,
    autoSendDelayMs,
    autoSendDelaySeconds: autoSendDelayMs / 1000,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═════════════════════════════════════════════════════════════════════════════

function getSettings() {
  return {
    autoSendEnabled,
    autoSendDelayMs,
    autoSendDelaySeconds: autoSendDelayMs / 1000,
    businessHours: isBusinessHours(),
    clientPhonesCount: CLIENT_PHONES.size,
    trackingNumbers: { ...TRACKING_NUMBER_MAP },
  };
}

function updateSettings({
  autoSendDelayMs: newDelay,
  autoSendEnabled: enabled,
}) {
  if (newDelay !== undefined) {
    autoSendDelayMs = Math.max(0, Number(newDelay));
    console.log(`[SMS-SVC] Delay: ${autoSendDelayMs / 1000}s`);
  }
  if (enabled !== undefined) {
    autoSendEnabled = !!enabled;
    console.log(`[SMS-SVC] Auto-send: ${autoSendEnabled}`);
  }
  return getSettings();
}

// ═════════════════════════════════════════════════════════════════════════════
// AUTO-SEND LOOP (polls every 15s for expired timers)
// ═════════════════════════════════════════════════════════════════════════════

let autoSendInterval = null;

function startAutoSendLoop() {
  TRACKING_NUMBER_MAP = buildTrackingMap();
  loadClientPhones();

  console.log("[SMS-SVC] ═══════════════════════════════════════════════");
  console.log("[SMS-SVC] SMS Intelligence Service Started");
  console.log(
    `[SMS-SVC]   Auto-send: ${autoSendEnabled ? "ENABLED" : "DISABLED"}`,
  );
  console.log(`[SMS-SVC]   Delay: ${autoSendDelayMs / 1000}s`);
  console.log(
    `[SMS-SVC]   Business hours: ${isBusinessHours() ? "YES" : "NO"}`,
  );
  console.log(
    `[SMS-SVC]   Tracking numbers: ${Object.keys(TRACKING_NUMBER_MAP).length} mapped`,
  );
  console.log(
    `[SMS-SVC]   OpenAI key: ${process.env.OPENAI_API_KEY ? "✓ set" : "✗ MISSING"}`,
  );
  console.log(
    `[SMS-SVC]   AI model: ${process.env.SMS_AI_MODEL || "gpt-4o-mini"}`,
  );
  console.log(
    `[SMS-SVC]   Client alert email: ${process.env.CLIENT_SMS_ALERT_EMAIL || "as@taxadvocategroup.com"}`,
  );
  console.log("[SMS-SVC] ═══════════════════════════════════════════════");

  autoSendInterval = setInterval(async () => {
    if (!autoSendEnabled) return;
    if (!isBusinessHours()) return;

    try {
      const now = new Date();
      const pending = await SmsConversation.find({
        responseStatus: "pending",
        autoSendAt: { $ne: null, $lte: now },
        botSleeping: { $ne: true },
      });

      if (pending.length) {
        console.log(
          `[SMS-AUTO] ── ${pending.length} pending response(s) past timer ──`,
        );
      }

      for (const convo of pending) {
        if (!convo.proposedResponse) {
          console.log(
            `[SMS-AUTO] ${convo.customerPhone}: no proposed response — setting idle`,
          );
          convo.responseStatus = "idle";
          await convo.save();
          continue;
        }
        console.log(
          `[SMS-AUTO] ⏱ Timer elapsed for ${convo.customerPhone} (${convo.company}) — auto-sending`,
        );
        console.log(
          `[SMS-AUTO]   Response: "${convo.proposedResponse.slice(0, 60)}..."`,
        );
        const result = await sendPending(convo._id);
        console.log(
          `[SMS-AUTO]   Result: ${result.ok ? "✓ sent" : "✗ " + result.error}`,
        );
      }
    } catch (err) {
      console.error("[SMS-AUTO] Loop error:", err.message);
    }
  }, 15 * 1000);

  console.log("[SMS-SVC] ✓ Auto-send loop started (15s poll)");
}

function stopAutoSendLoop() {
  if (autoSendInterval) clearInterval(autoSendInterval);
}

// ═════════════════════════════════════════════════════════════════════════════

module.exports = {
  // Inbound
  handleInbound,
  // Actions
  approve,
  cancel,
  markLogicsDnc,
  editAndSend,
  manualSend,
  regenerate,
  sleep,
  wake,
  // Queries
  listConversations,
  getConversation,
  getStats,
  // Settings
  getSettings,
  updateSettings,
  // Auto-send
  startAutoSendLoop,
  stopAutoSendLoop,
  // Client management
  addClientPhone,
  isClientPhone,
  // Company resolution
  resolveCompany,
};
