// leadBridge/server.js
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
require("../shared/utils/processGuard")("leadBridge");
const PrePing = require("../shared/models/PrePing");
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const axios = require("axios");
const cron = require("node-cron");
const { createLeadAdCase } = require("../shared/services/logicsService");
const { validateLead } = require("../shared/services/validationService");
const LeadCadence = require("../shared/models/LeadCadence");
const { getSmsContent } = require("./services/smsContent");
const { runCadenceTick } = require("./services/cadenceEngine");
const {
  dropVoicemail,
  handleDropWebhook,
  checkBalance,
} = require("./services/dropRVMService");
const connectDB = require("../shared/config/db");
const { runDbHealthChecks } = require("../shared/config/dbHealth");
const { runStatusCheck } = require("./services/statusChecker");
connectDB().then(() => {
  runDbHealthChecks().catch((err) =>
    console.error("[STARTUP] Migration error:", err.message),
  );
});

const {
  getCompanyConfig,
  resolveCompanyFromFbPageId,
  getFbPageToken,
  resolveCompanyFromTtAdvertiserId,
  resolveCompanyFromPayload,
} = require("../shared/config/companyConfig");
const crypto = require("crypto");
const {
  sendEmail,
  sendLeadNotificationEmail,
} = require("./services/emailService");
const pbService = require("./services/phoneBurnerService");
const cookieParser = require("cookie-parser");

const { mountDeployRoutes } = require("./services/deployService");
const { mountLoginPanel } = require("./services/loginPanel");
const {
  processFacebookWebhook,
  getMessengerStats,
} = require("./services/facebookMessenger");
const { processInstagramWebhook } = require("./services/instagramService");
const tiktokAuthService = require("./services/tiktokAuthService");

const ConsentRecord = require("../shared/models/ConsentRecord");
/* -------------------------------------------------------------------------- */
/*                                 CONFIG                                     */
/* -------------------------------------------------------------------------- */

const PORT = process.env.WEBHOOK_PORT || 4000;

// Internal notification routing
const FROM_EMAIL = process.env.FROM_EMAIL || "inquiry@WynnTaxSolutions.com";
const TO_EMAIL = process.env.TO_EMAIL || "inquiry@taxadvocategroup.com";

// /lead-contact + /test-lead protection
const LEAD_WEBHOOK_SECRET = process.env.LEAD_WEBHOOK_SECRET || "";

// Business hours (PT)
const BUSINESS_TZ = process.env.BUSINESS_TZ || "America/Los_Angeles";
const BUSINESS_START_HOUR = Number(9);
const BUSINESS_END_HOUR = Number(process.env.BUSINESS_END_HOUR || 18);

// Facebook
const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN || "";

// TikTok
const TT_VERIFY_TOKEN = process.env.TT_VERIFY_TOKEN || "";

// Feature flags
const ENABLE_FACEBOOK_OUTREACH =
  process.env.ENABLE_FACEBOOK_OUTREACH !== "false";
const ENABLE_FACEBOOK_DIAL = process.env.ENABLE_FACEBOOK_DIAL !== "false";
const ENABLE_FACEBOOK_CASE = process.env.ENABLE_FACEBOOK_CASE !== "false";

const ENABLE_TIKTOK_OUTREACH = process.env.ENABLE_TIKTOK_OUTREACH !== "false";
const ENABLE_TIKTOK_DIAL = process.env.ENABLE_TIKTOK_DIAL !== "false";
const ENABLE_TIKTOK_CASE = process.env.ENABLE_TIKTOK_CASE !== "false";

/* -------------------------------------------------------------------------- */
/*                              EXPRESS SETUP                                 */
/* -------------------------------------------------------------------------- */

const app = express();
app.use(express.json());

app.use(bodyParser.json());
app.use("/audio", express.static(path.join(__dirname, "..", "audio")));
app.use((req, res, next) => {
  console.log(`→ ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length) {
    console.log("Body:", JSON.stringify(req.body, null, 2));
  }
  next();
});
app.use(cookieParser());
mountLoginPanel(app);
mountDeployRoutes(app);
app.get("/pb/auth", (req, res) => {
  const url = `https://www.phoneburner.com/oauth/authorize?client_id=${process.env.PB_CLIENT_ID}&redirect_uri=https://tag-webhook.ngrok.app/pb/callback&response_type=code`;
  res.redirect(url);
});

async function checkInTrustedForm(certUrl) {
  if (!certUrl || !process.env.TRUSTEDFORM_API_KEY) return;

  // Extract cert ID from URL
  // Format: https://cert.trustedform.com/CERT_ID
  const match = certUrl.match(/trustedform\.com\/([a-f0-9]+)/);
  if (!match) return;

  const certId = match[1];

  try {
    await axios.post(
      `https://cert.trustedform.com/${certId}/check_in`,
      {},
      {
        auth: {
          username: "API",
          password: process.env.TRUSTEDFORM_API_KEY,
        },
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      },
    );
    console.log(`[TRUSTEDFORM] ✓ Checked in cert: ${certId}`);
  } catch (err) {
    console.error(
      `[TRUSTEDFORM] ✗ Check-in failed: ${err.response?.data?.message || err.message}`,
    );
  }
}

// ── PB OAuth: catches the redirect, exchanges for token ──
app.get("/pb/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("No code received");

  try {
    const response = await axios.post(
      "https://www.phoneburner.com/oauth/accesstoken",
      new URLSearchParams({
        client_id: process.env.PB_CLIENT_ID,
        client_secret: process.env.PB_CLIENT_SECRET,
        redirect_uri: "https://tag-webhook.ngrok.app/pb/callback",
        grant_type: "authorization_code",
        code,
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );

    const { access_token, refresh_token, expires_in } = response.data;
    console.log("[PB-AUTH] ═══════════════════════════════════════");
    console.log("[PB-AUTH] ✓ ACCESS TOKEN:", access_token);
    console.log("[PB-AUTH] ✓ REFRESH TOKEN:", refresh_token);
    console.log("[PB-AUTH] ✓ EXPIRES IN:", expires_in, "seconds");
    console.log("[PB-AUTH] ═══════════════════════════════════════");

    res.send(
      `<h2>PB Auth Success</h2><pre>Access Token: ${access_token}\nRefresh Token: ${refresh_token}\nExpires In: ${expires_in}s</pre><p>Copy the access token into your .env as PB_HOT_SEAT_TOKEN</p>`,
    );
  } catch (err) {
    console.error(
      "[PB-AUTH] ✗ Token exchange failed:",
      err.response?.data || err.message,
    );
    res
      .status(500)
      .send(
        `Token exchange failed: ${JSON.stringify(err.response?.data || err.message)}`,
      );
  }
});
pbService.mountCallDone(app);
pbService.mountOAuth(app);

/* -------------------------------------------------------------------------- */
/*                           PHONE NORMALIZATION                              */
/* -------------------------------------------------------------------------- */

function normalizePhone(rawPhone) {
  const raw = rawPhone == null ? "" : String(rawPhone).trim();
  const digits = raw.replace(/\D/g, "");

  let e164 = "";
  if (raw.startsWith("+")) {
    e164 = "+" + digits;
  } else if (digits.length === 10) {
    e164 = "+1" + digits;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    e164 = "+" + digits;
  } else if (digits.length) {
    e164 = digits;
  }

  return { raw, digits, e164 };
}

/* -------------------------------------------------------------------------- */
/*                          BUSINESS HOURS CHECK                              */
/* -------------------------------------------------------------------------- */

function isWithinBusinessHoursPT(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ,
    hour12: false,
    weekday: "short",
    hour: "2-digit",
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const hour = Number(get("hour"));
  const weekday = get("weekday");

  if (weekday === "Sat" || weekday === "Sun") return false;
  return hour >= BUSINESS_START_HOUR && hour < BUSINESS_END_HOUR;
}

/* -------------------------------------------------------------------------- */
/*                          CALLRAIL SMS HELPER                               */
/* -------------------------------------------------------------------------- */

async function sendWelcomeText(
  phoneNumber,
  name,
  textNum = 1,
  company = "WYNN",
) {
  if (!phoneNumber) return { ok: false, error: "No phone" };

  try {
    const { digits } = normalizePhone(phoneNumber);
    if (!digits) return { ok: false, error: "Invalid phone" };

    const config = getCompanyConfig(company);
    const content = getSmsContent(name, config.scheduleUrl, textNum);

    await axios.post(
      `https://api.callrail.com/v3/a/${config.callrailAccountId}/text-messages.json`,
      {
        customer_phone_number: digits,
        tracking_number: config.callrailTrackingNumber,
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

    console.log(`[SMS] ✓ Sent text #${textNum}:`, digits);
    return { ok: true, textNum };
  } catch (err) {
    const errMsg = err.response?.data?.error || err.message;
    console.error("[SMS] ✗ Failed:", errMsg);
    return { ok: false, error: errMsg };
  }
}

/* -------------------------------------------------------------------------- */
/*                          FIELD NORMALIZERS                                 */
/* -------------------------------------------------------------------------- */

function normalizeFacebookFields(fieldData) {
  const raw = {};
  for (const field of fieldData || []) {
    raw[field.name] = field.values?.[0] || "";
  }

  const name =
    raw.full_name ||
    raw.name ||
    [raw.first_name, raw.last_name].filter(Boolean).join(" ") ||
    "";

  const isTestLead = Object.values(raw).some((v) =>
    String(v).includes("<test lead:"),
  );

  if (isTestLead) {
    console.log("[FB] ⚠ Test lead detected — using hardcoded test data");
    return {
      name: "Test Lead",
      email: "your@email.com",
      phone: "3106665997",
      city: "Los Angeles",
      state: "CA",
    };
  }

  return {
    name: String(name).trim(),
    email: String(raw.email || "").trim(),
    phone: normalizePhone(raw.phone_number || raw.phone || "").digits,
    city: String(raw.city || "").trim(),
    state: String(raw.state || "").trim(),
  };
}

function normalizeTikTokFields(fieldData) {
  const raw = {};
  if (!Array.isArray(fieldData)) {
    Object.assign(raw, fieldData || {});
  } else {
    for (const field of fieldData) {
      const name = (field.name || field.field_name || "")
        .toLowerCase()
        .replace(/\s+/g, "_");
      raw[name] = field.value || field.field_value || field.values?.[0] || "";
    }
  }

  let name = raw.full_name || raw.name || raw.fullname || "";
  if (!name) {
    const firstName = raw.first_name || raw.firstname || "";
    const lastName = raw.last_name || raw.lastname || "";
    name = [firstName, lastName].filter(Boolean).join(" ");
  }

  return {
    name: String(name).trim(),
    email: String(raw.email || raw.email_address || "").trim(),
    phone: normalizePhone(
      raw.phone_number || raw.phone || raw.phonenumber || "",
    ).digits,
    city: String(raw.city || "").trim(),
    state: String(raw.state || raw.province || "").trim(),
  };
}

function normalizeLeadContactPayload(body = {}) {
  const name =
    body.name ||
    [body.first_name, body.last_name].filter(Boolean).join(" ") ||
    "";

  return {
    name,
    email: body.email || "",
    phone: body.phone || "",
    city: body.city || "",
    state: body.state || "",
    message: body.message || "",
    source: body.source || "",
    company: body.company || "",
    trafficSource: body.trafficSource || "",
    affiliatePartner: body.affiliatePartner || "",
    affiliateNid: body.affiliateNid || "",
    affiliateClickId: body.affiliateClickId || "",
    affiliateReferer: body.affiliateReferer || "",
    affiliateSub1: body.affiliateSub1 || "",
    affiliateSub2: body.affiliateSub2 || "",
    // ── Consent tokens ──
    trustedFormCertUrl:
      body.tf || body.trustedform_cert_url || body.xxTrustedFormCertUrl || "",
    jornayaLeadId: body.jl || body.leadid_token || body.jornaya_lead_id || "",
  };
}

/* -------------------------------------------------------------------------- */
/*                     UNIFIED LEAD PIPELINE                                  */
/* -------------------------------------------------------------------------- */

async function processLead(fields, opts = {}) {
  const {
    source = "unknown",
    meta = {},
    company = "WYNN",
    doEmail = true,
    doSms = true,
    doDial = true,
    doCase = true,
    doNotify = true,
  } = opts;

  console.log(
    `[PIPELINE] ══════════════════════════════════════════════════════════`,
  );
  console.log(
    `[PIPELINE] Processing ${source} lead: ${fields.name || fields.email || fields.phone}`,
  );

  const results = {
    fields,
    source,
    validation: null,
    outreach: { emailResult: null, smsResult: null, dialResult: null },
    caseId: null,
    mongoId: null,
  };
  function getTodayPT() {
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
    );
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  // SPAM CHECK: reject gibberish names before anything
  function isGibberishName(name) {
    if (!name || name.trim().length < 2) return true;
    const clean = name
      .toLowerCase()
      .replace(/[^a-z\s]/g, "")
      .trim();
    if (clean.length < 2) return false;

    const parts = clean.split(/\s+/).filter((p) => p.length > 0);

    for (const part of parts) {
      if (part.length < 2) continue;
      if (/[^aeiou\s]{4,}/.test(part)) return true;
      if (part.length >= 3 && !/[aeiou]/.test(part)) return true;
      if (/(.)\1{2,}/.test(part)) return true;
    }

    const letters = clean.replace(/\s/g, "");
    const vowels = (letters.match(/[aeiou]/g) || []).length;
    if (letters.length >= 6 && vowels / letters.length < 0.15) return true;

    return false;
  }
  if (isGibberishName(fields.name)) {
    console.log(`[PIPELINE] ✗ Rejected — gibberish name: "${fields.name}"`);
    return {
      ...results,
      rejected: true,
      reason: "gibberish-name",
    };
  }
  // DUPE CHECK: reject duplicate phone numbers
  if (fields.phone) {
    const { digits } = normalizePhone(fields.phone);
    if (digits) {
      const existing = await LeadCadence.findOne({
        phone: { $regex: digits.replace(/^\+1/, "") },
      }).lean();
      if (existing) {
        console.log(
          `[PIPELINE] ✗ Rejected — duplicate phone: ${digits} (existing caseId: ${existing.caseId})`,
        );
        return {
          ...results,
          rejected: true,
          reason: "duplicate-phone",
          existingCaseId: existing.caseId,
        };
      }
    }
  }
  // STEP 1: VALIDATE
  console.log(`[PIPELINE] Step 1: Validating phone/email...`);
  const validation = await validateLead({
    phone: fields.phone,
    email: fields.email,
  });
  results.validation = validation;

  console.log(`[PIPELINE] Validation results:`);
  console.log(
    `[PIPELINE]   Phone: valid=${validation.phoneValid} canCall=${validation.phoneCanCall} canText=${validation.phoneCanText} isCell=${validation.phoneIsCell}`,
  );
  console.log(
    `[PIPELINE]   Email: canSend=${validation.emailCanSend} result=${validation.emailResult}`,
  );

  // STEP 2: CREATE LOGICS CASE
  if (doCase) {
    console.log(`[PIPELINE] Step 2: Creating Logics case...`);
    const logicsResult = await createLeadAdCase(company, fields, source, meta);
    results.caseId = logicsResult.caseId;

    if (logicsResult.duplicate) {
      console.log(`[PIPELINE] ✗ Rejected — duplicate phone in Logics`);
      return { ...results, rejected: true, reason: "duplicate-phone-logics" };
    }

    console.log(`[PIPELINE] Logics CaseID: ${results.caseId || "FAILED"}`);
  }
  // STEP 3: SAVE TO MONGODB
  if (results.caseId) {
    console.log(`[PIPELINE] Step 3: Saving to MongoDB...`);
    try {
      const existingLead = await LeadCadence.findOne({
        caseId: results.caseId,
      }).lean();

      if (existingLead) {
        console.log(
          `[PIPELINE] MongoDB: CaseID ${results.caseId} already exists — skipping`,
        );
        results.mongoId = existingLead._id;
      } else {
        const leadDoc = await LeadCadence.create({
          caseId: results.caseId,
          company: company,
          name: fields.name || "",
          email: fields.email || "",
          phone: fields.phone || "",
          city: fields.city || "",
          state: fields.state || "",
          source: source,
          emailValid: validation.emailCanSend,
          phoneConnected: validation.phoneValid,
          phoneIsCell: validation.phoneIsCell,
          validationDetails: {
            phoneStatus: validation.phone?.status || "unknown",
            phoneCanCall: validation.phoneCanCall,
            phoneCanText: validation.phoneCanText,
            phoneDNC: validation.phone?.onNationalDNC || false,
            phoneLitigator: validation.phone?.isLitigator || false,
            emailResult: validation.emailResult || "unknown",
            emailFlags: validation.email?.flags || [],
          },
          day0CallsMade: 0,
          day0Connected: false,
          welcomeEmailSent: false,
          active: true,
          // ── NEW: stored case age ──
          caseAge: 0,
          caseAgeUpdatedDate: getTodayPT(),
        });
        results.mongoId = leadDoc._id;
        console.log(`[PIPELINE] MongoDB: ✓ Saved — ID: ${leadDoc._id}`);

        // Set per-channel DNC at intake based on validation
        const dncUpdates = {};
        if (!validation.phoneCanText || !validation.phoneIsCell) {
          dncUpdates.smsDnc = true;
          dncUpdates.smsDncReason = !validation.phoneIsCell
            ? "landline"
            : "invalid-phone";
        }
        if (validation.phone?.onNationalDNC) {
          dncUpdates.rvmDnc = true;
          dncUpdates.rvmDncReason = "national-dnc";
        }
        if (Object.keys(dncUpdates).length) {
          dncUpdates.dncUpdatedAt = new Date();
          await LeadCadence.updateOne(
            { _id: leadDoc._id },
            { $set: dncUpdates },
          ).catch(() => {});
          console.log(
            `[PIPELINE] DNC flags set at intake:`,
            Object.keys(dncUpdates)
              .filter((k) => k !== "dncUpdatedAt")
              .join(", "),
          );
        }
      }
    } catch (err) {
      if (err.code === 11000) {
        console.log(
          `[PIPELINE] MongoDB: Duplicate caseId ${results.caseId} — already exists`,
        );
      } else {
        console.error(`[PIPELINE] MongoDB error: ${err.message}`);
      }
    }
  }

  // STEP 4: PUSH TO PHONEBURNER
  if (results.caseId && results.mongoId && fields.phone) {
    try {
      const pbResult = await pbService.pushContact(
        {
          name: fields.name,
          phone: fields.phone,
          email: fields.email,
          caseId: results.caseId,
          company,
          source,
          mongoId: results.mongoId.toString(),
          city: fields.city || "",
          state: fields.state || "",
        },
        "HOT",
      );
      // Track PB contact ID in Mongo for folder moves / removal
      if (pbResult.success && pbResult.contactId) {
        await LeadCadence.updateOne(
          { _id: results.mongoId },
          {
            $set: {
              pbPushed: true,
              pbPushedAt: new Date(),
              pbContactId: pbResult.contactId,
              pbCurrentFolder: "HOT",
            },
          },
        ).catch(() => {});
      }
    } catch (pbErr) {
      console.error("[PIPELINE] PB push failed (non-fatal):", pbErr.message);
    }
  }

  // STEP 5: IMMEDIATE OUTREACH (welcome email and first text)
  console.log(`[PIPELINE] Step 5: Immediate outreach...`);

  const canEmail = doEmail && fields.email && validation.emailCanSend;
  const canText = doSms && fields.phone && validation.phoneCanText;

  if (canEmail) {
    console.log(`[PIPELINE]   Sending welcome email...`);
    results.outreach.emailResult = await sendEmail({
      email: fields.email,
      name: fields.name,
      emailIndex: 1,
      company,
    });
    if (results.mongoId && results.outreach.emailResult?.ok) {
      await LeadCadence.updateOne(
        { _id: results.mongoId },
        {
          $set: {
            welcomeEmailSent: true,
            emailsSent: 1,
            lastEmailedAt: new Date(),
          },
        },
      ).catch(() => {});
    }
  } else {
    results.outreach.emailResult = {
      ok: false,
      error: !doEmail
        ? "Disabled"
        : !fields.email
          ? "No email"
          : `Blocked: ${validation.emailResult}`,
    };
    console.log(
      `[PIPELINE]   Email skipped: ${results.outreach.emailResult.error}`,
    );
  }

  if (canText && isWithinBusinessHoursPT()) {
    console.log(`[PIPELINE]   Sending first text...`);
    results.outreach.smsResult = await sendWelcomeText(
      fields.phone,
      fields.name,
      1,
      company,
    );
    if (results.mongoId && results.outreach.smsResult?.ok) {
      await LeadCadence.updateOne(
        { _id: results.mongoId },
        { $set: { textsSent: 1, lastTextedAt: new Date() } },
      ).catch(() => {});
    }
  } else {
    results.outreach.smsResult = {
      ok: false,
      error: !doSms
        ? "Disabled"
        : !fields.phone
          ? "No phone"
          : !isWithinBusinessHoursPT()
            ? "Outside hours"
            : `Blocked: not cell`,
    };
    console.log(
      `[PIPELINE]   Text skipped: ${results.outreach.smsResult.error}`,
    );
  }

  // Dialing handled by PhoneBurner
  results.outreach.dialResult = {
    ok: true,
    note: "Handled by PhoneBurner",
  };

  // Internal notification
  if (doNotify) {
    await sendLeadNotificationEmail(
      source,
      fields,
      results.caseId,
      validation,
      company,
    );
  }

  console.log(
    `[PIPELINE] ✓ Complete — CaseID: ${results.caseId || "N/A"}, MongoID: ${results.mongoId || "N/A"}`,
  );
  console.log(
    `[PIPELINE] ══════════════════════════════════════════════════════════`,
  );
  return results;
}

/* -------------------------------------------------------------------------- */
/*                         FACEBOOK WEBHOOK                                   */
/* -------------------------------------------------------------------------- */

app.get("/fb/webhook", (req, res) => {
  const {
    "hub.mode": mode,
    "hub.verify_token": token,
    "hub.challenge": challenge,
  } = req.query;
  if (mode === "subscribe" && token === FB_VERIFY_TOKEN) {
    console.log("[FB] ✓ Verified");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post("/fb/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object === "instagram") {
      await processInstagramWebhook(body);
      return;
    }

    if (body.object !== "page") return;
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "leadgen") continue;

        const { leadgen_id, form_id, adgroup_id, created_time } = change.value;
        console.log("[FB] Lead:", { leadgen_id, form_id, adgroup_id });
        const company = resolveCompanyFromFbPageId(entry.id);
        const leadData = await fetchFacebookLeadData(leadgen_id, company);
        if (!leadData) continue;

        const fields = normalizeFacebookFields(leadData.field_data || []);

        await processLead(fields, {
          source: "facebook",
          company,
          meta: { leadgen_id, form_id, adgroup_id, created_time },
          doEmail: ENABLE_FACEBOOK_OUTREACH,
          doSms: ENABLE_FACEBOOK_OUTREACH,
          doDial: ENABLE_FACEBOOK_DIAL,
          doCase: ENABLE_FACEBOOK_CASE,
          doNotify: true,
        });
      }
    }
    await processFacebookWebhook(body);
    await processInstagramWebhook(body);
  } catch (err) {
    console.error("[FB] Error:", err);
  }
});
async function fetchFacebookLeadData(leadgenId, company = "WYNN") {
  try {
    const token = getFbPageToken(company);
    if (!token) {
      console.warn(
        `[FB] No page token for company ${company} — skipping fetch`,
      );
      return null;
    }
    const response = await axios.get(
      `https://graph.facebook.com/v21.0/${leadgenId}`,
      {
        params: { access_token: token },
      },
    );
    return response.data;
  } catch (err) {
    console.error(
      "[FB] Fetch failed:",
      err.response?.data?.error?.message || err.message,
    );
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                          TIKTOK WEBHOOK                                    */
/* -------------------------------------------------------------------------- */

app.get("/tt/webhook", (req, res) => {
  const { verify_token: token, challenge } = req.query;
  if (token === TT_VERIFY_TOKEN) {
    console.log("[TT] ✓ Verified");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ─── TIKTOK OAUTH ────────────────────────────────────────────

app.get("/tt/oauth/start", (req, res) => {
  const company = (req.query.company || "").toUpperCase();
  if (!["TAG", "WYNN"].includes(company)) {
    return res.status(400).send("Use ?company=TAG or ?company=WYNN");
  }
  const { url } = tiktokAuthService.buildAuthUrl(company);
  console.log(`[TT-AUTH] Redirecting ${company} to TikTok OAuth...`);
  res.redirect(url);
});

app.get("/tt/oauth/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;
  if (error)
    return res.status(400).send(`TikTok auth failed: ${error_description}`);
  if (!code || !state) return res.status(400).send("Missing code or state");
  const result = await tiktokAuthService.handleCallback(code, state);
  if (!result.ok)
    return res.status(500).send(`Token exchange failed: ${result.error}`);
  res.send(`<h2>✅ ${result.company} authorized. You can close this window.</h2>
    <p>Authorize the other brand: <a href="/tt/oauth/start?company=${result.company === "TAG" ? "WYNN" : "TAG"}">click here</a></p>`);
});

app.get("/tt/oauth/status", async (req, res) => {
  const statuses = await tiktokAuthService.getTokenStatus();
  res.json(
    statuses.length
      ? statuses
      : { message: "No tokens. Visit /tt/oauth/start?company=TAG" },
  );
});

app.post("/sms/inbound", (req, res) => {
  res.sendStatus(200);
  axios.post("http://localhost:5000/sms/inbound", req.body).catch(() => {});
});

app.post("/tt/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    for (const entry of req.body.entry || []) {
      const { id: lead_id, page_id: form_id, adgroup_id, changes } = entry;
      console.log("[TT] Lead:", { lead_id, form_id, adgroup_id });

      const fieldData = {};
      for (const change of changes || []) {
        const fieldName = (change.field || "")
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[?]/g, "");
        fieldData[fieldName] = change.value || "";
      }

      const normalizedFields = normalizeTikTokFields(fieldData);
      console.log(
        "[TT] Normalized:",
        JSON.stringify(normalizedFields, null, 2),
      );
      const company = resolveCompanyFromTtAdvertiserId(
        entry.page_id || entry.id,
      );
      await processLead(normalizedFields, {
        source: "tiktok",
        company,
        meta: { lead_id, form_id, adgroup_id, ...entry },
        doEmail: ENABLE_TIKTOK_OUTREACH,
        doSms: ENABLE_TIKTOK_OUTREACH,
        doDial: ENABLE_TIKTOK_DIAL,
        doCase: ENABLE_TIKTOK_CASE,
        doNotify: true,
      });
    }
  } catch (err) {
    console.error("[TT] Error:", err);
  }
});

/* -------------------------------------------------------------------------- */
/*                          LEAD CONTACT API                                  */
/* -------------------------------------------------------------------------- */

app.post("/lead-contact", async (req, res) => {
  if (req.headers["x-webhook-key"] !== LEAD_WEBHOOK_SECRET) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const fields = normalizeLeadContactPayload(req.body);

  if (!fields.email && !fields.phone) {
    return res
      .status(400)
      .json({ ok: false, error: "Need email or phone", received: fields });
  }

  console.log("[LEAD-CONTACT] Received:", fields);

  // ── Check if this email was pre-pinged (LD Posting) ──
  const emailHash = fields.email
    ? crypto
        .createHash("md5")
        .update(fields.email.toLowerCase().trim())
        .digest("hex")
    : null;

  const wasPrePinged = emailHash
    ? await PrePing.findOneAndDelete({
        emailHash: emailHash.toLowerCase(),
      }).lean()
    : null;

  const resolvedSource = wasPrePinged
    ? "ld-posting"
    : fields.source || "lead-contact";
  console.log(
    `[LEAD-CONTACT] Source resolved: ${resolvedSource}${wasPrePinged ? " (via pre-ping)" : ""}`,
  );

  const company = resolveCompanyFromPayload(req.body, req.headers);
  const result = await processLead(fields, {
    source: resolvedSource,
    company,
    meta: {
      received_at: new Date().toISOString(),
      trafficSource: fields.trafficSource || "",
      affiliatePartner: fields.affiliatePartner || "",
      affiliateNid: fields.affiliateNid || "",
      affiliateClickId: fields.affiliateClickId || "",
      affiliateReferer: fields.affiliateReferer || "",
    },
    doEmail: true,
    doSms: true,
    doDial: true,
    doCase: true,
    doNotify: true,
  });

  // ── Store consent record (immutable, permanent) ──
  if (!result.rejected) {
    ConsentRecord.create({
      email: fields.email,
      phone: fields.phone,
      caseId: result.caseId || "",
      company,
      source: resolvedSource,
      trustedFormCertUrl: fields.trustedFormCertUrl || "",
      jornayaLeadId: fields.jornayaLeadId || "",
      receivedAt: new Date(),
      ip: req.headers["x-forwarded-for"] || req.ip || "",
      userAgent: req.headers["user-agent"] || "",
    }).catch((err) =>
      console.error("[CONSENT] Failed to store consent record:", err.message),
    );

    checkInTrustedForm(fields.trustedFormCertUrl).catch(() => {});
  }

  return res.json({ ok: true, ...result });
});

/* -------------------------------------------------------------------------- */
/*                          TEST ENDPOINT                                     */
/* -------------------------------------------------------------------------- */

app.post("/test-lead", async (req, res) => {
  if (req.headers["x-webhook-key"] !== LEAD_WEBHOOK_SECRET) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const fields = normalizeLeadContactPayload(req.body);
  const q = req.query;
  const company = resolveCompanyFromPayload(req.body, req.headers);
  const result = await processLead(fields, {
    source: q.source || "test",
    company,
    meta: { test: true },
    doEmail: q.doEmail !== "false",
    doSms: q.doSms !== "false",
    doDial: q.doDial !== "false",
    doCase: q.doCase !== "false",
    doNotify: q.doNotify !== "false",
  });

  return res.json({ ok: true, ...result });
});

/* -------------------------------------------------------------------------- */
/*                          STATUS ENDPOINT                                   */
/* -------------------------------------------------------------------------- */

app.get("/status", async (req, res) => {
  const activeLeads = await LeadCadence.countDocuments({ active: true });
  const day0Leads = await LeadCadence.countDocuments({
    active: true,
    day0Connected: { $ne: true },
    rvmsSent: { $lt: 2 },
  });

  let dropBalance = null;
  try {
    const bal = await checkBalance();
    if (bal.ok) dropBalance = { balance: bal.balance, pending: bal.pending };
  } catch {}

  res.json({
    ok: true,
    time: new Date().toISOString(),
    businessHours: isWithinBusinessHoursPT(),
    activeLeads,
    day0Leads,
    dropBalance,
    tickInterval: "5 minutes",
    strategy: {
      day0: "5min: Email+Text+RVM → 15min: RVM → 30min: Text",
      "day2-9": "Noon RVM drop daily",
      "day10+": "Cadence exhaustion check",
      dialing:
        "PhoneBurner age cascade: HOT → DAY1 → DAY2 → DAY3_10 → DAY10_PLUS (7am CT)",
      cleanup: "Bad/inactive → deactivate Mongo + remove from PB",
    },
  });
});

/* -------------------------------------------------------------------------- */
/*                          PRE-PING ENDPOINT                                 */
/* -------------------------------------------------------------------------- */

function calculateAge(dob) {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
}

function normalizeState(state) {
  if (!state) return null;
  return String(state).trim().toUpperCase().slice(0, 2);
}

async function checkEmailHashExists(emailHash) {
  const leads = await LeadCadence.find({}, { email: 1 }).lean();
  for (const lead of leads) {
    if (!lead.email) continue;
    const hashedEmail = crypto
      .createHash("md5")
      .update(lead.email.toLowerCase().trim())
      .digest("hex");
    if (hashedEmail.toLowerCase() === emailHash.toLowerCase()) {
      return true;
    }
  }
  return false;
}

app.post("/lead-contact/pre-ping", async (req, res) => {
  try {
    const company = resolveCompanyFromPayload(req.body, req.headers);
    const config = getCompanyConfig(company);
    const state = req.body["State"] || req.body["state"];
    const dob =
      req.body["Date Of Birth"] ||
      req.body["Date  Of  Birth"] ||
      req.body["dob"] ||
      req.body["DOB"];
    const hash =
      req.body["Email"] || req.body["email"] || req.body["email_hash"];

    const normalizedState = normalizeState(state);
    if (!normalizedState) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing state", code: "MISSING_STATE" });
    }
    /* if (
      config.allowedStates.length &&
      !config.allowedStates.includes(normalizedState)
    ) {
      return res.status(400).json({
        ok: false,
        error: `State ${normalizedState} not accepted`,
        code: "STATE_NOT_ALLOWED",
        allowedStates: config.allowedStates,
      });
    }
*/
    const age = calculateAge(dob);
    if (age === null) {
      return res.status(400).json({
        ok: false,
        error: "Invalid or missing date of birth",
        code: "INVALID_DOB",
      });
    }
    if (config.minAge > 0 && age < config.minAge) {
      return res.status(400).json({
        ok: false,
        error: `Age ${age} below minimum ${config.minAge}`,
        code: "AGE_TOO_YOUNG",
        minAge: config.minAge,
      });
    }

    if (!hash) {
      return res.status(400).json({
        ok: false,
        error: "Missing email hash",
        code: "MISSING_EMAIL_HASH",
      });
    }
    if (await checkEmailHashExists(hash)) {
      return res
        .status(400)
        .json({ ok: false, error: "Duplicate email", code: "DUPLICATE_EMAIL" });
    }
    await PrePing.findOneAndUpdate(
      { emailHash: hash.toLowerCase() },
      { emailHash: hash.toLowerCase(), createdAt: new Date() },
      { upsert: true },
    ).catch(() => {});
    return res.status(200).json({
      ok: true,
      message: "Lead accepted - proceed with full submission to /lead-contact",
      checks: { age, emailNew: true },
    });
  } catch (err) {
    console.error("[PRE-PING] Error:", err.message);
    return res
      .status(500)
      .json({ ok: false, error: "Internal error", code: "INTERNAL_ERROR" });
  }
});

app.post("/drop-webhook", handleDropWebhook);

app.get("/drop-balance", async (req, res) => {
  const result = await checkBalance();
  res.json(result);
});

/* -------------------------------------------------------------------------- */
/*                          CRON JOBS                                         */
/* -------------------------------------------------------------------------- */

// PB morning rotation — age cascade (7am CT)
cron.schedule(
  "0 7 * * 1-5",
  async () => {
    console.log("[PB] ── 7am Morning Rotation ──");
    try {
      const result = await pbService.morningRotation(LeadCadence, "WYNN");
      console.log(
        `[PB] Rotation complete: ` +
          `TRANSFER=${result.transfer.bounced}back/${result.transfer.removed}removed, ` +
          `DAY3_10→DAY10+=${result.day3_10_to_day10_plus.moved}, ` +
          `DAY2→DAY3_10=${result.day2_to_day3_10.moved}, ` +
          `DAY1→DAY2=${result.day1_to_day2.moved}, ` +
          `HOT→DAY1=${result.hot_to_day1.moved}, ` +
          `Unpushed→HOT=${result.unpushed_to_hot.pushed}`,
      );
    } catch (err) {
      console.error("[PB] Morning rotation error:", err);
    }
  },
  { timezone: "America/Chicago" },
);

// Logics status check every 15 min
cron.schedule(
  "0,15,30,45 * * * 1-5",
  async () => {
    console.log("[STATUS-CRON] ══ Running Logics status check ══");
    try {
      const result = await runStatusCheck();
      if (!result.skipped) {
        console.log(
          `[STATUS-CRON] ✓ ${result.checked} checked, ` +
            `${result.deactivated} deactivated, ${result.failed} failed`,
        );
      }
    } catch (err) {
      console.error("[STATUS-CRON] ✗ Error:", err.message);
    }
  },
  { timezone: "America/Los_Angeles" },
);

// Error handler + health check (must be after all routes)
const { expressErrorHandler, healthCheck } = require("../shared/utils/processGuard");
app.get("/health", healthCheck("leadBridge"));
app.use(expressErrorHandler("leadBridge"));

/* -------------------------------------------------------------------------- */
/*                          START SERVER                                      */
/* -------------------------------------------------------------------------- */

app.listen(PORT, async () => {
  console.log(`
═══════════════════════════════════════════════════════════════════════════════
  TAGCONTACTBRIDGE — WEBHOOK SERVER
═══════════════════════════════════════════════════════════════════════════════
  Port:             ${PORT}
  Notifications:    ${FROM_EMAIL} → ${TO_EMAIL}
  Business Hours:   Mon-Fri ${BUSINESS_START_HOUR}:00-${BUSINESS_END_HOUR}:00 ${BUSINESS_TZ}

  Brands:           WYNN (Wynn Tax Solutions) | TAG (Tax Advocate Group)

  Feature Flags:
    Facebook:       outreach=${ENABLE_FACEBOOK_OUTREACH} dial=${ENABLE_FACEBOOK_DIAL} case=${ENABLE_FACEBOOK_CASE}
    TikTok:         outreach=${ENABLE_TIKTOK_OUTREACH} dial=${ENABLE_TIKTOK_DIAL} case=${ENABLE_TIKTOK_CASE}

  Dialing:          PhoneBurner (age-based folders)
  PB Folders:       HOT (Day 0) → DAY1 → DAY2 → DAY3_10 → DAY10_PLUS
  PB Rotation:      7am CT Mon-Fri cascade
  Cadence:          RVM + SMS + Email (5-min tick)

  Routes:
    POST /fb/webhook              Facebook Lead Ads
    POST /tt/webhook              TikTok Lead Ads
    POST /lead-contact            External Lead API
    POST /lead-contact/pre-ping   Pre-validation
    POST /test-lead               Manual Testing
    GET  /status                  System Status
    GET  /drop-balance            Drop.co Balance
═══════════════════════════════════════════════════════════════════════════════
`);

  pbService.initTokenRefresh();

  // Cadence Engine — RVM, SMS, and Email only (dialing via PhoneBurner)
  const cadenceActions = {
    sendText: async (phone, name, textNum, company) =>
      sendWelcomeText(phone, name, textNum, company),
    sendFollowUpEmail: async (email, name, emailIndex, company) =>
      sendEmail({ email, name, emailIndex, company }),
    dropRvm: async ({ phone, caseId, name, source, rvmNum, company }) =>
      dropVoicemail({ phone, caseId, name, source, rvmNum, company }),
    rcPlatform: null,
  };

  console.log("[STARTUP] cadenceActions configured:");
  console.log(
    "[STARTUP]   dropRvm: company passthrough =",
    cadenceActions.dropRvm.toString().includes("company") ? "✓" : "✗ MISSING",
  );
  console.log(
    "[STARTUP]   RVM audio base:",
    process.env.RVM_AUDIO_BASE_URL ||
      "https://tag-webhook.ngrok.app/audio (default)",
  );
  console.log(
    "[STARTUP]   DROP_CAMPAIGN_TOKEN:",
    process.env.DROP_CAMPAIGN_TOKEN ? "✓ set" : "✗ MISSING",
  );
  console.log(
    "[STARTUP]   DROP_API_KEY:",
    process.env.DROP_API_KEY ? "✓ set" : "✗ MISSING",
  );

  function scheduleCadence() {
    const TICK_INTERVAL_MS = 5 * 60 * 1000;

    async function tick() {
      console.log(
        "[CADENCE] ══════════════════════════════════════════════════════════",
      );
      try {
        const result = await runCadenceTick(cadenceActions);
        if (result.skipped) {
          console.log(`[CADENCE] Skipped: ${result.reason}`);
        } else {
          console.log(
            `[CADENCE] Processed: ${result.processed} leads | ` +
              `${result.rvmsDropped || 0} RVMs | ` +
              `${result.textsSent} texts | ${result.emailsSent} emails | ` +
              `${result.deactivated} deactivated`,
          );
        }
      } catch (err) {
        console.error("[CADENCE] Error:", err.message);
      }
      console.log(
        "[CADENCE] ══════════════════════════════════════════════════════════",
      );
    }

    const now = getNowForScheduler();
    const currentMin = now.getMinutes();
    const nextTickMin = Math.ceil((currentMin + 1) / 5) * 5;
    const msToFirstTick =
      ((nextTickMin - currentMin) * 60 - now.getSeconds()) * 1000;

    console.log(
      `[CADENCE] First tick in ${Math.round(msToFirstTick / 1000)}s, then every 5 min`,
    );

    setTimeout(() => {
      tick();
      setInterval(tick, TICK_INTERVAL_MS);
    }, msToFirstTick);
  }

  function getNowForScheduler() {
    return new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
    );
  }

  scheduleCadence();
  console.log("[STARTUP] ✓ Cadence engine scheduled — every 5 min");
  console.log(
    "[STARTUP] ✓ RVM audio: WYNN →",
    (process.env.RVM_AUDIO_BASE_URL || "https://tag-webhook.ngrok.app/audio") +
      "/WYNN",
  );
  console.log(
    "[STARTUP] ✓ RVM audio: TAG  →",
    (process.env.RVM_AUDIO_BASE_URL || "https://tag-webhook.ngrok.app/audio") +
      "/TAG",
  );
});
