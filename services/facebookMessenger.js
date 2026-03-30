// services/facebookMessenger.js
// ─────────────────────────────────────────────────────────────
// Facebook Messenger qualification bot.
//
// FLOW:
//   1. Someone comments on a post → auto-reply: "Check your messages!"
//   2. Bot sends DM with qualifying questions (button taps)
//   3. After qualification → sends pre-filled link to /qualify-now
//
// QUESTION FLOW: see qualificationQuestions.js
//
// WEBHOOK EVENTS:
//   - feed → comment created → auto-reply + initiate DM
//   - messaging → message received → advance conversation
//
// PREREQUISITES:
//   - Facebook App with pages_messaging + pages_manage_metadata
//   - Webhook subscribed to: messages, feed (in addition to leadgen)
//   - Page token with send + comment permissions
// ─────────────────────────────────────────────────────────────

const axios = require("axios");
const {
  resolveCompanyFromFbPageId,
  getFbPageToken,
  getIgPageToken,
} = require("../config/companyConfig");
const {
  QUESTIONS,
  buildQualifyUrl,
  buildQuickReplies,
} = require("./qualificationQuestions");

const GRAPH_API = "https://graph.facebook.com/v21.0";

// ─── Conversation State ──────────────────────────────────────

const conversations = new Map();
const CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000;

setInterval(
  () => {
    const now = Date.now();
    for (const [psid, convo] of conversations.entries()) {
      if (now - convo.updatedAt > CONVERSATION_TTL_MS) {
        conversations.delete(psid);
      }
    }
  },
  60 * 60 * 1000,
);

function getConvo(psid) {
  return conversations.get(psid) || null;
}

function setConvo(psid, data) {
  conversations.set(psid, { ...data, updatedAt: Date.now() });
}

function deleteConvo(psid) {
  conversations.delete(psid);
}

// ─── Graph API Helpers ───────────────────────────────────────

async function sendMessage(pageToken, recipientPsid, message) {
  try {
    await axios.post(
      `${GRAPH_API}/me/messages`,
      {
        recipient: { id: recipientPsid },
        message,
        messaging_type: "RESPONSE",
      },
      { params: { access_token: pageToken }, timeout: 10000 },
    );
    return { ok: true };
  } catch (err) {
    const fbErr = err.response?.data?.error?.message || err.message;
    console.error(`[FB-MSG] Send failed to ${recipientPsid}: ${fbErr}`);
    return { ok: false, error: fbErr };
  }
}

async function replyToComment(pageToken, commentId, message) {
  try {
    await axios.post(
      `${GRAPH_API}/${commentId}/comments`,
      { message },
      { params: { access_token: pageToken }, timeout: 10000 },
    );
    console.log(`[FB-MSG] ✓ Replied to comment ${commentId}`);
    return { ok: true };
  } catch (err) {
    const fbErr = err.response?.data?.error?.message || err.message;
    console.error(`[FB-MSG] Comment reply failed: ${fbErr}`);
    return { ok: false, error: fbErr };
  }
}

async function sendPrivateReply(pageToken, commentId, message) {
  try {
    await axios.post(
      `${GRAPH_API}/${commentId}/private_replies`,
      { message },
      { params: { access_token: pageToken }, timeout: 10000 },
    );
    console.log(`[FB-MSG] ✓ Private reply sent for comment ${commentId}`);
    return { ok: true };
  } catch (err) {
    const fbErr = err.response?.data?.error?.message || err.message;
    console.warn(`[FB-MSG] Private reply failed: ${fbErr}`);
    return { ok: false, error: fbErr };
  }
}

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
  "plan",
  "solution",
  "relief",
  "plan",
  "options",
];

// ─── Conversation Engine ─────────────────────────────────────

async function startConversation(pageToken, psid, company, meta = {}) {
  const existing = getConvo(psid);
  if (existing && existing.step && !QUESTIONS[existing.step]?.terminal) {
    console.log(
      `[FB-MSG] Conversation already active for ${psid} at step ${existing.step}`,
    );
    return;
  }

  const step = "q1_tax_issue";
  const question = QUESTIONS[step];

  setConvo(psid, { step, company, answers: {}, meta, startedAt: Date.now() });

  const msg = {
    text: question.text,
    quick_replies: buildQuickReplies(question.quickReplies),
  };

  const result = await sendMessage(pageToken, psid, msg);
  if (result.ok) {
    console.log(`[FB-MSG] ✓ Started qualification for ${psid} (${company})`);
  }
}

async function advanceConversation(pageToken, psid, text, payload) {
  const convo = getConvo(psid);

  if (!convo) {
    await sendMessage(pageToken, psid, {
      text: 'Hi there! 👋 Type "start" to find out if you qualify for tax relief!',
    });
    return;
  }

  const currentStep = convo.step;
  const question = QUESTIONS[currentStep];

  if (!question || question.terminal) return;

  if (text && text.toLowerCase().trim() === "start") {
    deleteConvo(psid);
    await startConversation(pageToken, psid, convo.company, convo.meta);
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

  if (!nextStep) {
    console.warn(
      `[FB-MSG] No next step from ${currentStep} with payload ${effectivePayload}`,
    );
    return;
  }

  convo.step = nextStep;
  setConvo(psid, convo);

  const nextQuestion = QUESTIONS[nextStep];

  if (nextStep === "send_link") {
    await sendQualifyLink(pageToken, psid, convo);
    return;
  }

  if (nextQuestion.terminal) {
    await sendMessage(pageToken, psid, { text: nextQuestion.text });
    deleteConvo(psid);
    console.log(`[FB-MSG] Conversation ended for ${psid} at ${nextStep}`);
    return;
  }

  const msg = {
    text: nextQuestion.text,
    quick_replies: buildQuickReplies(nextQuestion.quickReplies),
  };

  await sendMessage(pageToken, psid, msg);
}

async function sendQualifyLink(pageToken, psid, convo) {
  const answers = convo.answers;
  const qualifyUrl = buildQualifyUrl(convo.company, answers, "messenger");
  const brandName =
    convo.company === "TAG" ? "Tax Advocate Group" : "Wynn Tax Solutions";

  const text = `Great news, ${answers.name || "there"}! 🎉 Based on what you've shared, you may qualify for tax relief programs.\n\nTap below to claim your free, no-obligation consultation with ${brandName}. Your info is pre-filled — just add your phone and email:\n\n👉 ${qualifyUrl}\n\n✓ Free consultation\n✓ No obligation\n✓ 100% confidential`;

  await sendMessage(pageToken, psid, { text });

  console.log(
    `[FB-MSG] ✓ Qualify link sent to ${psid}:`,
    JSON.stringify(answers),
  );
  console.log(
    `[FB-MSG] QUALIFIED LEAD: company=${convo.company} psid=${psid} ` +
      `name=${answers.name || "?"} debt=${answers.debtAmount || "?"} ` +
      `taxType=${answers.taxType || "?"} jurisdiction=${answers.jurisdiction || "?"} ` +
      `state=${answers.state || "?"}`,
  );

  deleteConvo(psid);
}

// ─── Webhook Handlers ────────────────────────────────────────

async function handleComment(entry, change) {
  const pageId = entry.id;
  const company = resolveCompanyFromFbPageId(pageId);
  const pageToken = getIgPageToken(company);
  console.log(
    `[IG] Using token for ${company}: ${pageToken ? pageToken.slice(0, 20) + "..." : "MISSING"}`,
  );
  if (!pageToken) {
    console.warn(`[FB-MSG] No page token for ${company} — skipping comment`);
    return;
  }

  const value = change.value || {};
  const commentId = value.comment_id;
  const senderId = value.from?.id;
  const senderName = value.from?.name || "";
  const message = value.message || "";
  const postId = value.post_id;

  if (senderId === pageId) return;
  if (value.parent_id && value.parent_id !== value.post_id) return;

  const lowerMessage = message.toLowerCase();
  const isTriggered = TRIGGER_KEYWORDS.some((kw) => lowerMessage.includes(kw));
  if (!isTriggered) {
    console.log(
      `[FB-MSG] Comment ignored (no trigger keyword): "${message.slice(0, 80)}"`,
    );
    return;
  }

  console.log(
    `[FB-MSG] Comment from ${senderName} (${senderId}) on post ${postId}: "${message.slice(0, 100)}"`,
  );

  const brand = company === "TAG" ? "taxadvocategroup" : "wynntaxsolutions";

  await replyToComment(
    pageToken,
    commentId,
    `Thanks for reaching out, ${senderName.split(" ")[0] || "there"}! 💬 Tap here to get started — just hit send when Messenger opens: m.me/${brand}?text=RELIEF`,
  );

  // 2. Private DM to start qualification
  /*
  const dmResult = await sendPrivateReply(
    pageToken,
    commentId,
    "Hi there! 👋 I saw your comment and wanted to reach out. I can help you find out if you qualify for tax relief — it only takes about 60 seconds. Ready to start?",
  );

  if (dmResult.ok) {
    console.log(`[FB-MSG] ✓ Private reply sent, awaiting user response`);
  }
    */
}

async function handleMessage(entry, messaging) {
  const pageId = entry.id;
  const company = resolveCompanyFromFbPageId(pageId);
  const pageToken = getIgPageToken(company);

  if (!pageToken) {
    console.warn(`[FB-MSG] No page token for ${company} — skipping message`);
    return;
  }

  const senderId = messaging.sender?.id;
  const recipientId = messaging.recipient?.id;

  if (messaging.message?.is_echo) return;
  if (senderId === recipientId) return;

  const text = messaging.message?.text || "";
  const payload = messaging.message?.quick_reply?.payload || "";

  console.log(
    `[FB-MSG] DM from ${senderId}: "${text.slice(0, 100)}"${payload ? ` [payload: ${payload}]` : ""}`,
  );

  const convo = getConvo(senderId);

  if (!convo) {
    const lowerText = text.toLowerCase().trim();
    if (lowerText.length > 0) {
      await startConversation(pageToken, senderId, company, {
        source: "messenger_dm",
      });
      return;
    }
  }

  await advanceConversation(pageToken, senderId, text, payload);
}

// ─── Mount onto webhook ──────────────────────────────────────

async function processFacebookWebhook(body) {
  if (body.object !== "page") return;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field === "feed" && change.value?.item === "comment") {
        try {
          await handleComment(entry, change);
        } catch (err) {
          console.error("[FB-MSG] Comment handler error:", err.message);
        }
      }
    }

    for (const event of entry.messaging || []) {
      if (event.message) {
        try {
          await handleMessage(entry, event);
        } catch (err) {
          console.error("[FB-MSG] Message handler error:", err.message);
        }
      }
    }
  }
}

// ─── Stats ───────────────────────────────────────────────────

function getMessengerStats() {
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
  processFacebookWebhook,
  getMessengerStats,
  startConversation,
  advanceConversation,
  QUESTIONS,
};
