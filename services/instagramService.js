// services/instagramService.js
// ─────────────────────────────────────────────────────────────
// Instagram comment auto-reply and DM qualification bot.
//
// FLOW:
//   1. User comments on a post with a trigger keyword
//      → Bot replies publicly with CTA to DM
//      → No auto-DM (Instagram API restriction)
//   2. User DMs the page (any message)
//      → Bot runs Q1-Q6 qualification flow
//      → Sends pre-filled qualify-now link on completion
//
// QUESTION FLOW: see qualificationQuestions.js
//
// WEBHOOK EVENTS (come through existing /fb/webhook):
//   - object: "instagram" + changes[].field === "comments"
//   - object: "instagram" + entry[].messaging[]
//
// PREREQUISITES:
//   - Instagram app approved for instagram_manage_comments + instagram_manage_messages
//   - Webhook configured inside Instagram product (not generic Webhooks product)
//   - Pages subscribed: POST {PAGE_ID}/subscribed_apps?subscribed_fields=feed,messages,messaging_postbacks
//   - Page tokens in .env: WYNN_IG_PAGE_TOKEN, TAG_IG_PAGE_TOKEN
//   - Instagram account IDs mapped in companyConfig.resolveCompanyFromFbPageId
// ─────────────────────────────────────────────────────────────

const axios = require("axios");
const {
  resolveCompanyFromFbPageId,
  getIgPageToken,
} = require("../config/companyConfig");
const {
  QUESTIONS,
  buildQualifyUrl,
  buildQuickReplies,
} = require("./qualificationQuestions");

const GRAPH_API = "https://graph.facebook.com/v21.0";

// ─── Trigger Keywords ────────────────────────────────────────

const TRIGGER_KEYWORDS = [
  "relief",
  "help",
  "owe",
  "irs",
  "tax",
  "debt",
  "garnish",
  "levy",
  "lien",
  "qualify",
  "solution",
  "info",
];

// ─── Conversation State ──────────────────────────────────────

const conversations = new Map();
const CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000;

setInterval(
  () => {
    const now = Date.now();
    for (const [igsid, convo] of conversations.entries()) {
      if (now - convo.updatedAt > CONVERSATION_TTL_MS) {
        conversations.delete(igsid);
      }
    }
  },
  60 * 60 * 1000,
);

function getConvo(igsid) {
  return conversations.get(igsid) || null;
}

function setConvo(igsid, data) {
  conversations.set(igsid, { ...data, updatedAt: Date.now() });
}

function deleteConvo(igsid) {
  conversations.delete(igsid);
}

// ─── Graph API Helpers ───────────────────────────────────────

async function replyToComment(pageToken, commentId, message) {
  try {
    await axios.post(
      `${GRAPH_API}/${commentId}/replies`,
      { message },
      {
        headers: {
          Authorization: `Bearer ${pageToken}`,
        },
        timeout: 10000,
      },
    );
    console.log(`[IG] ✓ Replied to comment ${commentId}`);
    return { ok: true };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error(`[IG] Comment reply failed: ${msg}`);
    return { ok: false, error: msg };
  }
}

async function sendDM(pageToken, recipientIgsid, message) {
  try {
    await axios.post(
      `${GRAPH_API}/me/messages`,
      {
        recipient: { id: recipientIgsid },
        message: { text: message },
        messaging_type: "RESPONSE",
      },
      { params: { access_token: pageToken }, timeout: 10000 },
    );
    console.log(`[IG] ✓ DM sent to ${recipientIgsid}`);
    return { ok: true };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error(`[IG] DM failed to ${recipientIgsid}: ${msg}`);
    return { ok: false, error: msg };
  }
}

// ─── Keyword Detection ───────────────────────────────────────

function detectKeyword(text) {
  const lower = (text || "").toLowerCase();
  return TRIGGER_KEYWORDS.find((kw) => lower.includes(kw)) || null;
}

// ─── Qualification Flow ──────────────────────────────────────

async function startConversation(pageToken, igsid, company) {
  const existing = getConvo(igsid);
  if (existing && existing.step && !QUESTIONS[existing.step]?.terminal) {
    console.log(
      `[IG] Conversation already active for ${igsid} at step ${existing.step}`,
    );
    return;
  }

  const step = "q1_tax_issue";
  const question = QUESTIONS[step];

  setConvo(igsid, { step, company, answers: {}, startedAt: Date.now() });

  await sendDM(pageToken, igsid, question.text);
  console.log(`[IG] ✓ Started qualification for ${igsid} (${company})`);
}

async function advanceConversation(pageToken, igsid, text, payload) {
  const convo = getConvo(igsid);

  if (!convo) {
    await startConversation(pageToken, igsid, "WYNN");
    return;
  }

  const currentStep = convo.step;
  const question = QUESTIONS[currentStep];

  if (!question || question.terminal) return;

  if (text && text.toLowerCase().trim() === "start") {
    deleteConvo(igsid);
    await startConversation(pageToken, igsid, convo.company);
    return;
  }

  if (question.storeAs) {
    let value;
    if (question.forceValue) {
      value = question.forceValue;
    } else if (question.valueMap && payload) {
      value = question.valueMap[payload] || payload;
    } else if (question.freeText) {
      value = (text || "").trim();
    } else {
      value = payload || text || "";
    }
    convo.answers[question.storeAs] = value;
  }

  const effectivePayload = payload || text?.toUpperCase()?.trim() || "";
  const nextStep = question.next(effectivePayload);

  if (!nextStep) return;

  convo.step = nextStep;
  setConvo(igsid, convo);

  const nextQuestion = QUESTIONS[nextStep];

  if (nextStep === "send_link") {
    await sendQualifyLink(pageToken, igsid, convo);
    return;
  }

  if (nextQuestion.terminal) {
    await sendDM(pageToken, igsid, nextQuestion.text);
    deleteConvo(igsid);
    console.log(`[IG] Conversation ended for ${igsid} at ${nextStep}`);
    return;
  }

  await sendDM(pageToken, igsid, nextQuestion.text);
}

async function sendQualifyLink(pageToken, igsid, convo) {
  const answers = convo.answers;
  const qualifyUrl = buildQualifyUrl(convo.company, answers, "instagram");
  const brand =
    convo.company === "TAG" ? "Tax Advocate Group" : "Wynn Tax Solutions";

  const text = `Great news, ${answers.name || "there"}! 🎉 Based on what you've shared, you may qualify for tax relief.\n\nTap below for your free consultation with ${brand}:\n\n👉 ${qualifyUrl}\n\n✓ Free consultation\n✓ No obligation\n✓ 100% confidential`;

  await sendDM(pageToken, igsid, text);

  console.log(
    `[IG] ✓ Qualify link sent to ${igsid}: name=${answers.name || "?"} ` +
      `debt=${answers.debtAmount || "?"} taxType=${answers.taxType || "?"} ` +
      `jurisdiction=${answers.jurisdiction || "?"} state=${answers.state || "?"}`,
  );

  deleteConvo(igsid);
}

// ─── Handle Instagram Comment ────────────────────────────────

async function handleInstagramComment(entry, change) {
  try {
    const pageId = entry.id;
    const company = resolveCompanyFromFbPageId(pageId);
    const pageToken = getIgPageToken(company);

    if (!pageToken) {
      console.warn(`[IG] No page token for ${company} — skipping comment`);
      return;
    }

    const value = change.value || {};
    const commentId = value.id;
    const senderId = value.from?.id;
    const senderName = value.from?.name || "";
    const text = value.text || "";
    const mediaId = value.media?.id;

    if (!senderId || senderId === pageId) return;

    const keyword = detectKeyword(text);
    if (!keyword) {
      console.log(`[IG] Comment ignored (no keyword): "${text.slice(0, 80)}"`);
      return;
    }

    console.log(
      `[IG] Comment from ${senderName} (${senderId}) on media ${mediaId}: "${text.slice(0, 100)}" [keyword: ${keyword}] (${company})`,
    );

    const firstName = senderName.split(" ")[0] || "there";
    const brand =
      company === "TAG" ? "Tax Advocate Group" : "Wynn Tax Solutions";

    // Public reply only — Instagram API does not support proactive DMs to commenters
    const igHandle =
      company === "TAG" ? "taxadvocategroup" : "wynntaxsolutions";

    await replyToComment(
      pageToken,
      commentId,
      `Thanks for reaching out, ${firstName}! 💬  Send us a DM @wynntaxsolutions to get started with your free consultation.`,
    );

    console.log(
      `[IG] ✓ Public reply sent to comment from ${senderName} (${company})`,
    );
  } catch (err) {
    console.error("[IG] handleInstagramComment error:", err.message);
  }
}

// ─── Handle Instagram DM ─────────────────────────────────────

async function handleInstagramMessage(entry, messaging) {
  try {
    const pageId = entry.id;
    const company = resolveCompanyFromFbPageId(pageId);
    const pageToken = getIgPageToken(company);

    if (!pageToken) {
      console.warn(`[IG] No page token for ${company} — skipping DM`);
      return;
    }

    const senderId = messaging.sender?.id;

    if (messaging.message?.is_echo) return;
    if (!senderId || senderId === pageId) return;

    const text = messaging.message?.text || "";
    const payload = messaging.message?.quick_reply?.payload || "";

    console.log(
      `[IG] DM from ${senderId}: "${text.slice(0, 100)}"${payload ? ` [payload: ${payload}]` : ""} (${company})`,
    );

    const convo = getConvo(senderId);

    if (!convo) {
      await startConversation(pageToken, senderId, company);
      return;
    }

    await advanceConversation(pageToken, senderId, text, payload);
  } catch (err) {
    console.error("[IG] handleInstagramMessage error:", err.message);
  }
}

// ─── Main Webhook Processor ───────────────────────────────────

async function processInstagramWebhook(body) {
  if (body.object !== "instagram") return;
  console.log(`[IG] Processing webhook — ${body.entry?.length || 0} entries`);

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field === "comments") {
        try {
          await handleInstagramComment(entry, change);
        } catch (err) {
          console.error("[IG] Comment handler error:", err.message);
        }
      }
    }

    for (const event of entry.messaging || []) {
      if (event.message) {
        try {
          await handleInstagramMessage(entry, event);
        } catch (err) {
          console.error("[IG] Message handler error:", err.message);
        }
      }
    }
  }
}

// ─── Stats ───────────────────────────────────────────────────

function getInstagramStats() {
  const active = conversations.size;
  const steps = {};
  for (const [, convo] of conversations) {
    const step = convo.step || "unknown";
    steps[step] = (steps[step] || 0) + 1;
  }
  return { activeConversations: active, byStep: steps };
}

// ─── Exports ─────────────────────────────────────────────────

module.exports = {
  processInstagramWebhook,
  handleInstagramComment,
  handleInstagramMessage,
  getInstagramStats,
};
