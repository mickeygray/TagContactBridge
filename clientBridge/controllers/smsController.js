// controllers/smsController.js
const sms = require("../services/smsService");

// Inbound webhook (no auth - CallRail hits this directly)
async function inbound(req, res) {
  res.sendStatus(200);
  try {
    console.log(`[SMS-CTRL] ── Raw payload ──`);
    console.log(`[SMS-CTRL]`, JSON.stringify(req.body, null, 2));
    const { source_number, destination_number, content, company_id } = req.body;

    console.log(`[SMS-CTRL] ── Inbound webhook received ──`);
    console.log(`[SMS-CTRL]   Customer: ${source_number}`);
    console.log(`[SMS-CTRL]   Tracking: ${destination_number}`);
    console.log(
      `[SMS-CTRL]   Content: "${(content || req.body.message || "").slice(0, 80)}"`,
    );
    console.log(`[SMS-CTRL]   CallRail Company: ${company_id || "N/A"}`);

    const result = await sms.handleInbound({
      customerPhone: source_number,
      trackingNumber: destination_number,
      content: content || req.body.message || "",
      callrailCompanyId: company_id,
    });

    console.log(
      `[SMS-CTRL]   Result: ${result.ok ? "✓" : "✗"} ${result.conversationId || result.error || ""}`,
    );
  } catch (err) {
    console.error("[SMS-CTRL] Inbound error:", err.message);
  }
}
async function markDnc(req, res) {
  return res.json(await sms.markLogicsDnc(req.params.id));
}
async function listConversations(req, res) {
  try {
    const result = await sms.listConversations(req.query);
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

async function getConversation(req, res) {
  try {
    const convo = await sms.getConversation(req.params.id);
    if (!convo) return res.status(404).json({ ok: false, error: "Not found" });
    return res.json({ ok: true, conversation: convo });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

async function approveResponse(req, res) {
  return res.json(await sms.approve(req.params.id));
}

async function cancelResponse(req, res) {
  return res.json(await sms.cancel(req.params.id));
}

async function editAndSend(req, res) {
  const { content } = req.body;
  if (!content)
    return res.status(400).json({ ok: false, error: "Content required" });
  return res.json(await sms.editAndSend(req.params.id, content));
}

async function manualSend(req, res) {
  const { content } = req.body;
  if (!content)
    return res.status(400).json({ ok: false, error: "Content required" });
  return res.json(await sms.manualSend(req.params.id, content));
}

async function regenerate(req, res) {
  return res.json(await sms.regenerate(req.params.id));
}

async function sleepBot(req, res) {
  return res.json(await sms.sleep(req.params.id));
}

async function wakeBot(req, res) {
  return res.json(await sms.wake(req.params.id));
}

async function getStats(req, res) {
  try {
    return res.json({ ok: true, ...(await sms.getStats()) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

function getSettings(req, res) {
  return res.json({ ok: true, ...sms.getSettings() });
}

function updateSettings(req, res) {
  return res.json({ ok: true, ...sms.updateSettings(req.body) });
}

module.exports = {
  inbound,
  listConversations,
  getConversation,
  approveResponse,
  cancelResponse,
  editAndSend,
  manualSend,
  regenerate,
  markDnc,
  sleepBot,
  wakeBot,
  getStats,
  getSettings,
  updateSettings,
};
