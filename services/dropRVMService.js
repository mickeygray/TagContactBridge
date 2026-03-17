// services/dropRvmService.js
// ─────────────────────────────────────────────────────────────
// Drop.co Ringless Voicemail (RVM) integration
//
// Endpoints used:
//   POST /VMDropCreate        — Create a campaign (one-time setup)
//   POST /Delivery            — Drop a voicemail to a phone number
//   POST /VMDropStatus        — Check status of a specific drop
//   POST /VMDropStats         — Get campaign-level stats
//   POST /BalanceCheck        — Check account balance
//
// Webhook:
//   Drop.co posts delivery status to our webhook URL
//   Configure in Drop.co portal under Customer Profile
// ─────────────────────────────────────────────────────────────

const axios = require("axios");
const { getCompanyConfig } = require("../config/companyConfig");

const DROP_API_BASE = "https://customerapi.drop.co";

// Default audio fallback
const DROP_DEFAULT_AUDIO_URL = process.env.DROP_RVM_AUDIO_URL || "";

// Audio base URL
const RVM_AUDIO_BASE =
  process.env.RVM_AUDIO_BASE_URL || "https://tag-webhook.ngrok.app/audio";

// Audio file names — same across companies, different directories
// audio/WYNN/rvm-1-intro.wav vs audio/TAG/rvm-1-intro.wav
const RVM_FILENAMES = {
  1: "rvm-1-intro.wav",
  2: "rvm-2-qualify.wav",
  3: "rvm-3-followup.wav",
  4: "rvm-4-urgency.wav",
};

/* -------------------------------------------------------------------------- */
/*                            HELPERS                                         */
/* -------------------------------------------------------------------------- */

/**
 * Get the audio URL for a given RVM sequence number and company.
 * @param {number} rvmNum
 * @param {string} [company="WYNN"]
 */
function getAudioForRvmNum(rvmNum, company) {
  const dir = (company || "WYNN").toUpperCase();
  const filename = RVM_FILENAMES[rvmNum] || RVM_FILENAMES[1] || "";
  if (!filename) return DROP_DEFAULT_AUDIO_URL || "";
  return `${RVM_AUDIO_BASE}/${dir}/${filename}`;
}

/**
 * Get the campaign token for a company from companyConfig.
 * @param {string} [company="WYNN"]
 */
function getCampaignToken(company) {
  return getCompanyConfig(company).dropCampaignToken || "";
}

/**
 * Get the transfer number for a company from companyConfig.
 * @param {string} [company="WYNN"]
 */
function getTransferNumber(company) {
  return getCompanyConfig(company).dropTransferNumber || "";
}

/* -------------------------------------------------------------------------- */
/*                          CAMPAIGN MANAGEMENT                               */
/* -------------------------------------------------------------------------- */

/**
 * Create a new VMDrop campaign.
 * Only needs to be called once — save the CampaignToken for future drops.
 *
 * @param {string} name      - Campaign name
 * @param {string} audioUrl  - Public URL to audio file (≤60s)
 * @param {string} [company="WYNN"]
 * @returns {{ ok, campaignToken, campaignId, error }}
 */
async function createCampaign(name, audioUrl, company = "WYNN") {
  console.log("[DROP-RVM] ══════════════════════════════════════════");
  console.log("[DROP-RVM] Creating campaign:", name);

  const config = getCompanyConfig(company);
  const apiKey = config.dropApiKey;
  const transferNumber = config.dropTransferNumber || "";

  if (!apiKey) {
    console.error("[DROP-RVM] ✗ Missing dropApiKey for", company);
    return { ok: false, error: `Missing dropApiKey for ${company}` };
  }

  try {
    const params = new URLSearchParams({
      ApiKey: apiKey,
      VMDropName: name,
      VMDropFileUrl: audioUrl,
      EnableMissedCall: "true",
      CallbackForwardingType: "1", // Immediate transfer
      TransferNumber: transferNumber,
    });

    const resp = await axios.post(
      `${DROP_API_BASE}/VMDropCreate?${params.toString()}`,
      null,
      { timeout: 15000 },
    );

    const data = resp.data;
    console.log("[DROP-RVM] Response:", JSON.stringify(data, null, 2));

    if (data.ApiStatusCode === 200 || data.CampaignToken) {
      console.log("[DROP-RVM] ✓ Campaign created");
      console.log("[DROP-RVM]   Token:", data.CampaignToken);
      console.log("[DROP-RVM]   ID:", data.CampaignId);
      console.log("[DROP-RVM] ══════════════════════════════════════════");
      return {
        ok: true,
        campaignToken: data.CampaignToken,
        campaignId: data.CampaignId,
        campaignName: data.CampaignName,
        data,
      };
    }

    console.error("[DROP-RVM] ✗ Unexpected response:", data.ApiStatusMessage);
    return { ok: false, error: data.ApiStatusMessage || "Unknown error" };
  } catch (err) {
    const errMsg = err.response?.data?.ApiStatusMessage || err.message;
    console.error("[DROP-RVM] ✗ Create failed:", errMsg);
    return { ok: false, error: errMsg };
  }
}

/* -------------------------------------------------------------------------- */
/*                           DROP A VOICEMAIL                                 */
/* -------------------------------------------------------------------------- */

/**
 * Drop a ringless voicemail to a phone number.
 *
 * @param {object} opts
 * @param {string} opts.phone      — 10-digit US phone number
 * @param {string} opts.caseId     — CaseID for tracking (stored in C1)
 * @param {string} opts.name       — Lead name (stored in C2)
 * @param {string} opts.source     — Source identifier (stored in C3)
 * @param {number} [opts.rvmNum]   — RVM sequence number (1-4), auto-selects audio
 * @param {string} [opts.audioUrl] — Override audio URL (takes priority over rvmNum)
 * @param {string} [opts.company="WYNN"] — Company key for audio/campaign selection
 * @returns {{ ok, activityToken, error }}
 */
async function dropVoicemail({
  phone,
  caseId,
  name,
  source,
  rvmNum,
  audioUrl,
  company,
}) {
  const selectedAudio = audioUrl || getAudioForRvmNum(rvmNum || 1, company);
  const campaignToken = getCampaignToken(company);
  const config = getCompanyConfig(company);
  const apiKey = config.dropApiKey;

  console.log("[DROP-RVM] ──────────────────────────────────────────");
  console.log("[DROP-RVM] Dropping RVM");
  console.log("[DROP-RVM]   Phone:", phone);
  console.log("[DROP-RVM]   CaseID:", caseId);
  console.log("[DROP-RVM]   Name:", name);
  console.log("[DROP-RVM]   RVM #:", rvmNum || "N/A");
  console.log("[DROP-RVM]   Audio:", selectedAudio || "(campaign default)");
  console.log("[DROP-RVM]   Company:", company || "WYNN (default)");
  console.log(
    "[DROP-RVM]   Campaign token:",
    campaignToken ? `...${campaignToken.slice(-6)}` : "✗ MISSING",
  );

  if (!apiKey) {
    console.error("[DROP-RVM] ✗ Missing dropApiKey for", company || "WYNN");
    return { ok: false, error: `Missing dropApiKey for ${company || "WYNN"}` };
  }

  if (!campaignToken) {
    console.error(
      "[DROP-RVM] ✗ Missing dropCampaignToken for",
      company || "WYNN",
    );
    return {
      ok: false,
      error: `Missing dropCampaignToken for ${company || "WYNN"}`,
    };
  }

  // Normalize phone to 10 digits
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) {
    console.error("[DROP-RVM] ✗ Invalid phone:", phone);
    return { ok: false, error: "Invalid phone number" };
  }

  try {
    const params = new URLSearchParams({
      ApiKey: apiKey,
      CampaignToken: campaignToken,
      PhoneTo: digits,
      AllowDuplicates: "true",
      Source: source || "cadence-engine",
      C1: String(caseId || ""),
      C2: String(name || ""),
      C3: new Date().toISOString(),
    });

    if (selectedAudio) {
      params.set("Audio", selectedAudio);
    }

    const resp = await axios.post(
      `${DROP_API_BASE}/delivery/?${params.toString()}`,
      null,
      { timeout: 15000 },
    );

    const data = resp.data;

    console.log("[DROP-RVM] Response status:", resp.status);
    console.log("[DROP-RVM] Response body:", JSON.stringify(data, null, 2));

    // Drop.co status codes:
    //   1038 = "API Post Accepted" (success)
    //   1033 = "Failed-National DNC" (permanent)
    const SUCCESS_CODES = [1038];
    const PERMANENT_FAIL_CODES = [1033, 1043, 1010, 1031];

    if (
      SUCCESS_CODES.includes(data.ApiStatusCode) ||
      (data.ActivityToken && !PERMANENT_FAIL_CODES.includes(data.ApiStatusCode))
    ) {
      console.log("[DROP-RVM] ✓ RVM queued");
      console.log("[DROP-RVM]   ActivityToken:", data.ActivityToken);
      console.log("[DROP-RVM]   Phone:", data.PhoneTo);
      console.log("[DROP-RVM]   AudioFile:", data.AudioFile || "N/A");
      console.log(
        "[DROP-RVM]   ValidationLevel:",
        data.ValidationLevel || "N/A",
      );
      console.log("[DROP-RVM] ──────────────────────────────────────────");
      return {
        ok: true,
        activityToken: data.ActivityToken,
        phoneTo: data.PhoneTo,
        phoneFrom: data.PhoneFrom,
        data,
      };
    }

    if (PERMANENT_FAIL_CODES.includes(data.ApiStatusCode)) {
      console.warn(
        `[DROP-RVM] ✗ PERMANENT FAIL: ${data.ApiStatusMessage} (code ${data.ApiStatusCode})`,
      );
      console.log("[DROP-RVM] ──────────────────────────────────────────");
      return {
        ok: false,
        permanent: true,
        error: data.ApiStatusMessage || "Permanent failure",
        statusCode: data.ApiStatusCode,
        data,
      };
    }

    console.error("[DROP-RVM] ✗ Drop failed");
    console.error("[DROP-RVM]   StatusCode:", data.ApiStatusCode);
    console.error("[DROP-RVM]   StatusMessage:", data.ApiStatusMessage);
    console.log("[DROP-RVM] ──────────────────────────────────────────");
    return {
      ok: false,
      error: data.ApiStatusMessage || "Drop failed",
      statusCode: data.ApiStatusCode,
      data,
    };
  } catch (err) {
    const errData = err.response?.data;
    const errStatus = err.response?.status;
    const errMsg = errData?.ApiStatusMessage || err.message;
    console.error("[DROP-RVM] ✗ Drop error:", errMsg);
    console.error("[DROP-RVM]   HTTP status:", errStatus || "N/A");
    console.error(
      "[DROP-RVM]   Response body:",
      errData ? JSON.stringify(errData, null, 2) : "N/A",
    );
    console.error(
      "[DROP-RVM]   Request URL:",
      `${DROP_API_BASE}/delivery/?ApiKey=***&CampaignToken=***&PhoneTo=${digits}&Audio=${selectedAudio || "default"}`,
    );
    console.log("[DROP-RVM] ──────────────────────────────────────────");
    return { ok: false, error: errMsg, statusCode: errStatus, data: errData };
  }
}

/* -------------------------------------------------------------------------- */
/*                          STATUS & REPORTING                                */
/* -------------------------------------------------------------------------- */

/**
 * Check the delivery status of a specific RVM drop.
 * @param {string} activityToken — Token returned from dropVoicemail()
 * @returns {{ ok, statusCode, statusMessage, error }}
 */
async function getDropStatus(activityToken) {
  if (!activityToken) return { ok: false, error: "No activityToken" };

  try {
    const params = new URLSearchParams({ ActivityToken: activityToken });
    const resp = await axios.post(
      `${DROP_API_BASE}/VMDropStatus?${params.toString()}`,
      null,
      { timeout: 10000 },
    );

    const data = resp.data;
    return {
      ok: true,
      statusCode: data.DropStatusCode,
      statusMessage: data.DropStatusMessage,
      dropId: data.DropId,
      data,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Get campaign-level stats for a date range.
 * @param {string} dateFrom  — Format: MM/DD/YYYY
 * @param {string} dateTo    — Format: MM/DD/YYYY
 * @param {string} [company="WYNN"]
 * @returns {{ ok, stats, error }}
 */
async function getCampaignStats(dateFrom, dateTo, company = "WYNN") {
  const config = getCompanyConfig(company);
  const apiKey = config.dropApiKey;
  const campaignToken = config.dropCampaignToken;

  if (!apiKey || !campaignToken) {
    return { ok: false, error: `Missing Drop.co credentials for ${company}` };
  }

  try {
    const params = new URLSearchParams({
      ApiKey: apiKey,
      CampaignToken: campaignToken,
      DateFrom: dateFrom,
      DateTo: dateTo,
    });

    const resp = await axios.post(
      `${DROP_API_BASE}/VMDropStats?${params.toString()}`,
      null,
      { timeout: 10000 },
    );

    const data = resp.data;
    return { ok: true, stats: data.Results, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Check account balance.
 * @param {string} [company="WYNN"]
 */
async function checkBalance(company = "WYNN") {
  const config = getCompanyConfig(company);
  const apiKey = config.dropApiKey;

  if (!apiKey) {
    return { ok: false, error: `Missing dropApiKey for ${company}` };
  }

  try {
    const params = new URLSearchParams({ ApiKey: apiKey });
    const resp = await axios.post(
      `${DROP_API_BASE}/BalanceCheck?${params.toString()}`,
      null,
      { timeout: 10000 },
    );

    const data = resp.data;
    console.log(
      `[DROP-RVM] Balance (${company}): $${data.CurrentBalance} (pending: $${data.PendingCost})`,
    );
    return {
      ok: true,
      balance: data.CurrentBalance,
      pending: data.PendingCost,
      customer: data.CustomerName,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/* -------------------------------------------------------------------------- */
/*                      WEBHOOK HANDLER (for Express)                         */
/* -------------------------------------------------------------------------- */

/**
 * Process a webhook callback from Drop.co.
 * Mount in Express: app.post("/drop-webhook", handleDropWebhook)
 *
 * Drop.co sends delivery status updates here.
 * We extract the CaseID from C1 and update MongoDB.
 */
async function handleDropWebhook(req, res) {
  try {
    const data = req.body;
    console.log("[DROP-WEBHOOK] ══════════════════════════════════════");
    console.log("[DROP-WEBHOOK] Received:", JSON.stringify(data, null, 2));

    const caseId = data.C1;
    const statusCode = data.DropStatusCode;
    const statusMessage = data.DropStatusMessage;

    console.log(`[DROP-WEBHOOK] CaseID: ${caseId}`);
    console.log(`[DROP-WEBHOOK] Status: ${statusCode} — ${statusMessage}`);

    if (caseId) {
      const LeadCadence = require("../models/LeadCadence");
      const update = {
        $set: {
          lastRvmStatus: statusMessage,
          lastRvmStatusCode: statusCode,
          lastRvmStatusAt: new Date(),
        },
      };

      if (statusMessage && statusMessage.toLowerCase().includes("callback")) {
        update.$set.day0Connected = true;
        update.$set.day0ConnectedAt = new Date();
        console.log("[DROP-WEBHOOK] ✓ Lead called back! Marking as connected.");
      }

      await LeadCadence.updateOne({ caseId: String(caseId) }, update);
      console.log("[DROP-WEBHOOK] ✓ MongoDB updated for CaseID:", caseId);
    }

    console.log("[DROP-WEBHOOK] ══════════════════════════════════════");
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[DROP-WEBHOOK] ✗ Error:", err.message);
    res.status(200).json({ ok: true }); // Always 200 so Drop.co doesn't retry
  }
}

module.exports = {
  createCampaign,
  dropVoicemail,
  getDropStatus,
  getCampaignStats,
  checkBalance,
  handleDropWebhook,
};
