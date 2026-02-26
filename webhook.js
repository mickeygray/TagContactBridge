// webhook.js
require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const handlebars = require("handlebars");
const axios = require("axios");
const cron = require("node-cron");
const {
  placeRingOutCall,
  warmup: warmupRingCentral,
} = require("./services/ringCentralService");
const { createLeadAdCase } = require("./services/logicsService");
const { validateLead } = require("./services/validationService");
const LeadCadence = require("./models/LeadCadence");
const { getSmsContent } = require("./services/smsContent");
const { runCadenceTick } = require("./services/cadenceEngine");
const connectDB = require("./config/db");
connectDB();

/* -------------------------------------------------------------------------- */
/*                                 CONFIG                                     */
/* -------------------------------------------------------------------------- */

const PORT = process.env.WEBHOOK_PORT || 4000;

// Internal notification routing
const FROM_EMAIL = process.env.FROM_EMAIL || "inquiry@WynnTaxSolutions.com";
const TO_EMAIL = process.env.TO_EMAIL || "inquiry@taxadvocategroup.com";

// /lead-contact + /test-lead protection
const LEAD_WEBHOOK_SECRET = process.env.LEAD_WEBHOOK_SECRET || "";

// Dial settings (PT)
const DIAL_QUEUE_PATH = path.join(__dirname, "dial-queue.json");
const BUSINESS_TZ = process.env.BUSINESS_TZ || "America/Los_Angeles";
const BUSINESS_START_HOUR = Number(process.env.BUSINESS_START_HOUR || 7);
const BUSINESS_END_HOUR = Number(process.env.BUSINESS_END_HOUR || 17);

// RingCentral
const RINGOUT_CALLER = process.env.RING_CENTRAL_RINGOUT_CALLER || "";

// Facebook
const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN || "";
const FB_PAGE_TOKEN =
  process.env.FB_PAGE_TOKEN || process.env.FB_LEADS_ID || "";

// TikTok
const TT_VERIFY_TOKEN = process.env.TT_VERIFY_TOKEN || "";

// Feature flags (env-configurable, all default to ENABLED)
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
app.use(bodyParser.json());

app.use((req, res, next) => {
  console.log(`→ ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length) {
    console.log("Body:", JSON.stringify(req.body, null, 2));
  }
  next();
});

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

  // Monday-Friday only
  if (weekday === "Sat" || weekday === "Sun") return false;

  return hour >= BUSINESS_START_HOUR && hour < BUSINESS_END_HOUR;
}

/* -------------------------------------------------------------------------- */
/*                        SENDGRID EMAIL TRANSPORTER                          */
/* -------------------------------------------------------------------------- */

const transporter = nodemailer.createTransport({
  host: process.env.SENDGRID_GATEWAY || "smtp.sendgrid.net",
  port: process.env.SENDGRID_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SENDGRID_USER || "apikey",
    pass: process.env.WYNN_API_KEY,
  },
});

/* -------------------------------------------------------------------------- */
/*                     PROSPECT WELCOME TEMPLATE (HBS)                        */
/* -------------------------------------------------------------------------- */

const PROSPECT_WELCOME_TPL_PATH = path.join(
  __dirname,
  "Templates",
  "ProspectWelcome",
  "handlebars",
  "ProspectWelcome1.hbs",
);
const PROSPECT_LOGO_PATH = path.join(
  __dirname,
  "Templates",
  "ProspectWelcome",
  "images",
  "Wynn_Logo.png",
);
const PROSPECT_PDF_PATH = path.join(
  __dirname,
  "Templates",
  "ProspectWelcome",
  "attachments",
  "wynn-tax-guide.pdf",
);

let prospectWelcomeTpl = null;
try {
  if (fs.existsSync(PROSPECT_WELCOME_TPL_PATH)) {
    prospectWelcomeTpl = handlebars.compile(
      fs.readFileSync(PROSPECT_WELCOME_TPL_PATH, "utf8"),
    );
    console.log("[TEMPLATE] ✓ ProspectWelcome loaded");
  } else {
    console.warn("[TEMPLATE] ⚠ Not found:", PROSPECT_WELCOME_TPL_PATH);
  }
} catch (err) {
  console.error("[TEMPLATE] Error:", err.message);
}
/* -------------------------------------------------------------------------- */
/*                      CALLFIRE NOON AUTO-DIALER CRON                        */
/* -------------------------------------------------------------------------- */

const {
  addContactsToBroadcast,
  startBroadcast,
} = require("./services/callFireService");
const { daysSinceCreation } = require("./services/cadenceEngine");

// Run at noon PT, Mon-Fri — add Day 2+ leads to CallFire broadcast
cron.schedule(
  "0 12 * * 1-5",
  async () => {
    console.log("[CALLFIRE-CRON] ══ Running noon auto-dialer ══");

    try {
      const leads = await LeadCadence.find({
        active: true,
        phoneConnected: true,
      }).lean();

      const day2PlusLeads = leads.filter((lead) => {
        const day = daysSinceCreation(lead.createdAt);
        return day >= 2;
      });

      if (day2PlusLeads.length === 0) {
        console.log("[CALLFIRE-CRON] No Day 2+ leads to dial");
        return;
      }

      console.log(`[CALLFIRE-CRON] Found ${day2PlusLeads.length} Day 2+ leads`);

      const contacts = day2PlusLeads.map((lead) => ({
        phone: lead.phone,
        name: lead.name,
        caseId: lead.caseId,
      }));

      const result = await addContactsToBroadcast(contacts);

      if (result.ok) {
        console.log(
          `[CALLFIRE-CRON] ✓ Added ${result.added} contacts to broadcast`,
        );
        await startBroadcast();
      } else {
        console.error(`[CALLFIRE-CRON] ✗ Failed: ${result.errors.join(", ")}`);
      }
    } catch (err) {
      console.error("[CALLFIRE-CRON] Error:", err.message);
    }
  },
  { timezone: "America/Los_Angeles" },
);
/* -------------------------------------------------------------------------- */
/*                          CALLRAIL SMS HELPER                               */
/* -------------------------------------------------------------------------- */

const CALLRAIL_BASE = `https://api.callrail.com/v3/a/${process.env.CALL_RAIL_ACCOUNT_ID}`;

/**
 * Send SMS via CallRail with content varying by sequence number.
 *
 * @param {string} phoneNumber - Recipient phone
 * @param {string} name - Lead's first name
 * @param {number} textNum - Sequence number (1, 2, or 3) for varied content
 */
async function sendWelcomeText(phoneNumber, name, textNum = 1) {
  if (!phoneNumber) return { ok: false, error: "No phone" };

  try {
    const { digits } = normalizePhone(phoneNumber);
    if (!digits) return { ok: false, error: "Invalid phone" };

    // Get varied content based on sequence number
    const scheduleUrl =
      process.env.WYNN_SCHEDULE_URL ||
      "https://www.wynntaxsolutions.com/schedule";
    const content = getSmsContent(name, scheduleUrl, textNum);

    console.log(`[SMS] Sending text #${textNum} to:`, digits);

    await axios.post(
      `${CALLRAIL_BASE}/text-messages.json`,
      {
        customer_phone_number: digits,
        tracking_number: process.env.CALL_RAIL_TRACKING_NUMBER,
        content,
        company_id: process.env.CALL_RAIL_COMPANY_ID,
      },
      {
        headers: {
          Authorization: `Token token=${process.env.CALL_RAIL_KEY}`,
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
/*                          WELCOME EMAIL HELPER                              */
/* -------------------------------------------------------------------------- */

async function sendWelcomeEmail(email, name) {
  if (!email) return { ok: false, error: "No email" };
  if (!prospectWelcomeTpl) return { ok: false, error: "Template not loaded" };

  try {
    const scheduleUrl =
      process.env.WYNN_CALENDAR_SCHEDULE_URL ||
      process.env.TAG_CALENDAR_SCHEDULE_URL ||
      "https://calendly.com/wynntax";

    const html = prospectWelcomeTpl({
      name: name || "there",
      scheduleUrl,
      year: new Date().getFullYear(),
    });

    const attachments = [];
    if (fs.existsSync(PROSPECT_LOGO_PATH)) {
      attachments.push({
        filename: "Wynn_Logo.png",
        path: PROSPECT_LOGO_PATH,
        cid: "emailLogo",
      });
    }
    if (fs.existsSync(PROSPECT_PDF_PATH)) {
      attachments.push({
        filename: "Wynn_Tax_Guide.pdf",
        path: PROSPECT_PDF_PATH,
      });
    }

    console.log("[EMAIL] Sending to:", email);

    const info = await transporter.sendMail({
      from: `Wynn Tax Solutions <${FROM_EMAIL}>`,
      to: email,
      subject: `Welcome to Wynn Tax Solutions, ${name || "there"}!`,
      html,
      attachments,
    });

    console.log("[EMAIL] ✓ Sent:", email);
    return { ok: true, messageId: info?.messageId };
  } catch (err) {
    console.error("[EMAIL] ✗ Failed:", err.message);
    return { ok: false, error: err.message };
  }
}

/* -------------------------------------------------------------------------- */
/*                         BUSINESS HOURS DIAL QUEUE                          */
/* -------------------------------------------------------------------------- */

function loadDialQueue() {
  try {
    if (!fs.existsSync(DIAL_QUEUE_PATH)) return [];
    const raw = fs.readFileSync(DIAL_QUEUE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("[DIAL-QUEUE] Load failed:", e.message);
    return [];
  }
}

function saveDialQueue(queue) {
  try {
    fs.writeFileSync(DIAL_QUEUE_PATH, JSON.stringify(queue, null, 2));
  } catch (e) {
    console.error("[DIAL-QUEUE] Save failed:", e.message);
  }
}

let dialQueue = loadDialQueue();

function enqueueDial(fields, source = "unknown") {
  return enqueueContact(fields, source, "dial");
}

function enqueueContact(fields, source = "unknown", type = "dial") {
  const item = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    source,
    type, // "dial" or "sms"
    fields,
    attempts: 0,
  };
  dialQueue.push(item);
  saveDialQueue(dialQueue);
  console.log(`[QUEUE] Enqueued ${type}:`, item.id, source, fields.phone);
  return item.id;
}

function dequeueNext() {
  const item = dialQueue.shift();
  saveDialQueue(dialQueue);
  return item;
}

async function dialLeadNow(fields) {
  console.log("[DIAL] ══════════════════════════════════════");
  console.log("[DIAL] Input fields:", JSON.stringify(fields, null, 2));

  const { raw, digits, e164 } = normalizePhone(fields?.phone);
  console.log("[DIAL] Phone normalized:", { raw, digits, e164 });

  if (!e164) {
    console.log("[DIAL] ✗ Invalid phone — aborting");
    return { ok: false, error: "Invalid phone" };
  }

  if (!RINGOUT_CALLER) {
    console.log("[DIAL] ✗ Missing RING_CENTRAL_RINGOUT_CALLER env var");
    return { ok: false, error: "Missing RING_CENTRAL_RINGOUT_CALLER" };
  }

  console.log("[DIAL] Placing RingOut call:");
  console.log("[DIAL]   From:", RINGOUT_CALLER);
  console.log("[DIAL]   To:", e164);
  console.log("[DIAL]   PlayPrompt:", false);

  try {
    const result = await placeRingOutCall({
      toNumber: e164,
      fromNumber: RINGOUT_CALLER,
      playPrompt: false,
    });

    console.log("[DIAL] ✓ RingOut response:", JSON.stringify(result, null, 2));
    console.log("[DIAL] ══════════════════════════════════════");
    return result;
  } catch (err) {
    console.error("[DIAL] ✗ RingOut error:", err.message);
    if (err.response) {
      console.error("[DIAL] Status:", err.response.status);
      console.error("[DIAL] Data:", JSON.stringify(err.response.data, null, 2));
    }
    console.log("[DIAL] ══════════════════════════════════════");
    return { ok: false, error: err.message };
  }
}

async function dialNowOrQueue(fields, source = "unknown") {
  if (!fields?.phone) return { ok: false, error: "No phone" };

  if (!isWithinBusinessHoursPT()) {
    const queuedId = enqueueDial(fields, source);
    return { ok: true, queued: true, queuedId };
  }

  const result = await dialLeadNow(fields);
  return { ok: result?.ok, immediate: true, ...result };
}

async function smsNowOrQueue(fields, source = "unknown") {
  if (!fields?.phone) return { ok: false, error: "No phone" };

  if (!isWithinBusinessHoursPT()) {
    const queuedId = enqueueContact(fields, source, "sms");
    return { ok: true, queued: true, queuedId };
  }

  return sendWelcomeText(fields.phone, fields.name);
}

let isDraining = false;

async function drainDialQueue() {
  if (isDraining || !isWithinBusinessHoursPT() || !dialQueue.length) return;

  isDraining = true;
  console.log(`[QUEUE] Draining ${dialQueue.length} queued item(s)...`);

  try {
    while (isWithinBusinessHoursPT() && dialQueue.length) {
      const item = dequeueNext();
      item.attempts = (item.attempts || 0) + 1;
      const type = item.type || "dial"; // backwards compat for old queued items

      console.log(
        `[QUEUE] Processing ${type}:`,
        item.id,
        item.source,
        item.fields?.phone,
      );

      let result;
      if (type === "sms") {
        result = await sendWelcomeText(item.fields?.phone, item.fields?.name);
      } else {
        result = await dialLeadNow(item.fields);
      }

      if (!result?.ok) {
        console.warn(`[QUEUE] ${type} failed:`, item.id, result?.error);
        if (item.attempts < 3) {
          dialQueue.push(item);
          saveDialQueue(dialQueue);
          console.log("[QUEUE] Re-enqueued:", item.id);
        } else {
          console.log("[QUEUE] Dropped after 3 attempts:", item.id);
        }
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        console.log(`[QUEUE] ✓ ${type} completed:`, item.id);
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  } finally {
    isDraining = false;
  }
}

setInterval(() => drainDialQueue().catch(() => {}), 30 * 1000);
drainDialQueue().catch(() => {});

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

  // Detect Facebook test leads (contain "<test lead:" in values)
  const isTestLead = Object.values(raw).some((v) =>
    String(v).includes("<test lead:"),
  );

  if (isTestLead) {
    console.log("[FB] ⚠ Test lead detected — using hardcoded test data");
    return {
      name: "Test Lead",
      email: "your@email.com", // TODO: Replace with your email
      phone: "3106665997", // TODO: Replace with your phone
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

  return {
    name: String(raw.full_name || raw.name || raw.fullname || "").trim(),
    email: String(raw.email || raw.email_address || "").trim(),
    phone: normalizePhone(
      raw.phone_number || raw.phone || raw.phonenumber || "",
    ).digits,
    city: String(raw.city || "").trim(),
    state: String(raw.state || raw.province || "").trim(),
  };
}

function normalizeLeadContactPayload(body) {
  const b = body || {};
  const name =
    b.name ||
    b.full_name ||
    b.fullName ||
    [b.first_name || b.firstName, b.last_name || b.lastName]
      .filter(Boolean)
      .join(" ") ||
    "";

  return {
    name: String(name).trim(),
    email: String(b.email || b.email_address || b.emailAddress || "").trim(),
    phone: normalizePhone(
      b.phone || b.phone_number || b.phoneNumber || b.mobile || b.cell || "",
    ).digits,
    city: String(b.city || "").trim(),
    state: String(b.state || b.region || "").trim(),
  };
}

/* -------------------------------------------------------------------------- */
/*                     UNIFIED LEAD PIPELINE                                  */
/* -------------------------------------------------------------------------- */

/**
 * Process a lead through the full pipeline.
 * All steps are opt-in via flags.
 *
 * @param {object} fields - { name, email, phone, city, state }
 * @param {object} opts
 * @param {string} opts.source - "facebook" | "tiktok" | "lead-contact" | "test"
 * @param {object} opts.meta - Platform-specific metadata (form_id, adgroup_id, etc.)
 * @param {boolean} opts.doEmail - Send welcome email (default: true)
 * @param {boolean} opts.doSms - Send welcome SMS (default: true)
 * @param {boolean} opts.doDial - Place outbound call (default: true)
 * @param {boolean} opts.doCase - Create Logics case (default: true)
 * @param {boolean} opts.doNotify - Send internal notification (default: true)
 */
async function processLead(fields, opts = {}) {
  const {
    source = "unknown",
    meta = {},
    doEmail = true,
    doSms = true,
    doDial = true,
    doCase = true,
    doNotify = true,
  } = opts;

  console.log(
    `[PIPELINE] ${source}: ${fields.name || fields.email || fields.phone}`,
  );

  const results = {
    fields,
    source,
    validation: null,
    outreach: { emailResult: null, smsResult: null, dialResult: null },
    caseId: null,
    mongoId: null,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: VALIDATE PHONE & EMAIL FIRST
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`[PIPELINE] Validating phone/email...`);
  const validation = await validateLead({
    phone: fields.phone,
    email: fields.email,
  });
  results.validation = validation;

  console.log(`[PIPELINE] Validation results:`);
  console.log(
    `[PIPELINE]   Phone: connected=${validation.phoneValid}, isCell=${validation.phoneIsCell}, canCall=${validation.phoneCanCall}, canText=${validation.phoneCanText}`,
  );
  console.log(
    `[PIPELINE]   Email: result=${validation.emailResult}, canSend=${validation.emailCanSend}`,
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: CREATE LOGICS CASE (always, even if validation fails)
  // ═══════════════════════════════════════════════════════════════════════════
  if (doCase) {
    const logicsResult = await createLeadAdCase("WYNN", fields, source, meta);
    results.caseId = logicsResult.caseId;
    console.log(`[PIPELINE] Logics CaseID: ${results.caseId || "FAILED"}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: SAVE TO MONGODB WITH ACTUAL VALIDATION RESULTS
  // ═══════════════════════════════════════════════════════════════════════════
  if (results.caseId) {
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
          name: fields.name || "",
          email: fields.email || "",
          phone: fields.phone || "",
          city: fields.city || "",
          state: fields.state || "",
          source: ["facebook", "tiktok", "lead-contact", "test"].includes(
            source,
          )
            ? source
            : "unknown",

          // Store ACTUAL validation results
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

          welcomeEmailSent: false,
          active: true,
        });
        results.mongoId = leadDoc._id;
        console.log(`[PIPELINE] MongoDB: ✓ Saved — ID: ${leadDoc._id}`);
      }
    } catch (err) {
      if (err.code === 11000) {
        console.log(
          `[PIPELINE] MongoDB: Duplicate caseId ${results.caseId} — already tracked`,
        );
      } else {
        console.error(`[PIPELINE] MongoDB error: ${err.message}`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: OUTREACH (only if validation passes)
  // ═══════════════════════════════════════════════════════════════════════════
  const canEmail = doEmail && fields.email && validation.emailCanSend;
  const canSms = doSms && fields.phone && validation.phoneCanText;
  const canDial = doDial && fields.phone && validation.phoneCanCall;

  console.log(
    `[PIPELINE] Outreach gates: email=${canEmail}, sms=${canSms}, dial=${canDial}`,
  );

  const [emailResult, smsResult, dialResult] = await Promise.allSettled([
    canEmail
      ? sendWelcomeEmail(fields.email, fields.name)
      : Promise.resolve({
          ok: false,
          error: !doEmail
            ? "Disabled"
            : !fields.email
              ? "No email"
              : `Blocked: ${validation.emailResult}`,
        }),
    canSms
      ? smsNowOrQueue(fields, source)
      : Promise.resolve({
          ok: false,
          error: !doSms
            ? "Disabled"
            : !fields.phone
              ? "No phone"
              : "Blocked: not cell or disconnected",
        }),
    canDial
      ? dialNowOrQueue(fields, source)
      : Promise.resolve({
          ok: false,
          error: !doDial
            ? "Disabled"
            : !fields.phone
              ? "No phone"
              : "Blocked: DNC/litigator/disconnected",
        }),
  ]);

  const unwrap = (p) =>
    p.status === "fulfilled"
      ? p.value
      : { ok: false, error: p.reason?.message };

  results.outreach.emailResult = unwrap(emailResult);
  results.outreach.smsResult = unwrap(smsResult);
  results.outreach.dialResult = unwrap(dialResult);

  // Update MongoDB with welcome email status
  if (results.mongoId && results.outreach.emailResult?.ok) {
    await LeadCadence.updateOne(
      { _id: results.mongoId },
      { $set: { welcomeEmailSent: true } },
    ).catch(() => {});
  }

  // Update MongoDB with SMS tracking (prevents duplicate from cadence engine)
  if (results.mongoId && results.outreach.smsResult?.ok) {
    await LeadCadence.updateOne(
      { _id: results.mongoId },
      { $set: { lastTextedAt: new Date(), textsSent: 1 } },
    ).catch(() => {});
  }

  // Update MongoDB with call tracking
  if (
    results.mongoId &&
    results.outreach.dialResult?.ok &&
    results.outreach.dialResult?.immediate
  ) {
    await LeadCadence.updateOne(
      { _id: results.mongoId },
      {
        $set: {
          lastCalledAt: new Date(),
          callsToday: 1,
          callsTodayDate: new Date().toISOString().split("T")[0],
        },
      },
    ).catch(() => {});
  }

  // Internal notification
  if (doNotify) {
    await sendLeadNotificationEmail(
      source,
      fields,
      results.caseId,
      meta,
      results.outreach,
      validation,
    );
  }

  console.log(
    `[PIPELINE] ✓ Done — CaseID: ${results.caseId || "N/A"}, MongoID: ${results.mongoId || "N/A"}`,
  );
  return results;
}

/* -------------------------------------------------------------------------- */
/*                  INTERNAL NOTIFICATION EMAIL                               */
/* -------------------------------------------------------------------------- */

async function sendLeadNotificationEmail(
  source,
  fields,
  caseId,
  meta,
  outreach,
  validation,
) {
  try {
    const emoji =
      { facebook: "🔵", tiktok: "🎵", "lead-contact": "📞", test: "🧪" }[
        source
      ] || "📋";
    const platformName =
      {
        facebook: "Facebook",
        tiktok: "TikTok",
        "lead-contact": "Lead Contact",
        test: "Test",
      }[source] || "Lead";
    const sourceName =
      { facebook: "VF Face/Insta", tiktok: "VF TikTok" }[source] ||
      "VF Digital";

    const subject = `${emoji} New ${platformName} Lead — ${fields.name || "Unknown"}${caseId ? ` [Case #${caseId}]` : ""}`;

    let text = `
NEW ${platformName.toUpperCase()} LEAD
${"─".repeat(50)}

Name:       ${fields.name || "N/A"}
Email:      ${fields.email || "N/A"}
Phone:      ${fields.phone || "N/A"}
City:       ${fields.city || "N/A"}
State:      ${fields.state || "N/A"}

${"─".repeat(50)}
Source:         ${sourceName}
Form ID:        ${meta.form_id || meta.formId || "N/A"}
Ad Group:       ${meta.adgroup_id || meta.adgroupId || "N/A"}
Campaign:       ${meta.campaign_id || meta.campaignId || "N/A"}
Lead ID:        ${meta.lead_id || meta.leadgen_id || "N/A"}
Logics CaseID:  ${caseId || "Not created"}`;

    // Add validation results
    if (validation) {
      const phoneStatus = validation.phone?.status || "N/A";
      const phoneFlags = [];
      if (validation.phoneIsCell) phoneFlags.push("Cell");
      if (validation.phone?.onNationalDNC) phoneFlags.push("⚠️ DNC");
      if (validation.phone?.isLitigator) phoneFlags.push("🚨 LITIGATOR");

      text += `

${"─".repeat(50)}
VALIDATION
${"─".repeat(50)}
Phone:  ${phoneStatus}${phoneFlags.length ? ` (${phoneFlags.join(", ")})` : ""}
        canCall=${validation.phoneCanCall ? "✓" : "✗"} canText=${validation.phoneCanText ? "✓" : "✗"}
Email:  ${validation.emailResult || "N/A"}
        canSend=${validation.emailCanSend ? "✓" : "✗"}`;
    }

    if (outreach) {
      const { emailResult, smsResult, dialResult } = outreach;

      let dialStatus = "N/A";
      if (dialResult?.ok && dialResult?.immediate)
        dialStatus = "✓ Called immediately";
      else if (dialResult?.ok && dialResult?.queued)
        dialStatus = `⏳ Queued (${dialResult.queuedId})`;
      else if (!dialResult?.ok)
        dialStatus = `✗ ${dialResult?.error || "Failed"}`;

      text += `

${"─".repeat(50)}
OUTREACH
${"─".repeat(50)}
Email:  ${emailResult?.ok ? "✓ Sent" : `✗ ${emailResult?.error}`}
SMS:    ${smsResult?.ok ? "✓ Sent" : `✗ ${smsResult?.error}`}
Call:   ${dialStatus}`;
    }

    await transporter.sendMail({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      subject,
      text: text.trim(),
    });
    console.log(`[NOTIFY] ✓ Sent (${source})`);
  } catch (err) {
    console.error(`[NOTIFY] ✗ Failed:`, err.message);
  }
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
  console.log("[FB] Verify:", { mode, token, challenge });

  if (mode === "subscribe" && token === FB_VERIFY_TOKEN) {
    console.log("[FB] ✓ Verified");
    return res.status(200).send(challenge);
  }
  console.error("[FB] ✗ Verification failed");
  return res.sendStatus(403);
});

app.post("/fb/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== "page") return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "leadgen") continue;

        const { leadgen_id, form_id, adgroup_id, created_time } = change.value;
        console.log("[FB] Lead:", { leadgen_id, form_id, adgroup_id });

        const leadData = await fetchFacebookLeadData(leadgen_id);
        if (!leadData) continue;

        const fields = normalizeFacebookFields(leadData.field_data || []);

        await processLead(fields, {
          source: "facebook",
          meta: { leadgen_id, form_id, adgroup_id, created_time },
          doEmail: ENABLE_FACEBOOK_OUTREACH,
          doSms: ENABLE_FACEBOOK_OUTREACH,
          doDial: ENABLE_FACEBOOK_DIAL,
          doCase: ENABLE_FACEBOOK_CASE,
          doNotify: true,
        });
      }
    }
  } catch (err) {
    console.error("[FB] Error:", err);
  }
});

async function fetchFacebookLeadData(leadgenId) {
  try {
    if (!FB_PAGE_TOKEN) {
      console.error("[FB] Missing FB_PAGE_TOKEN");
      return null;
    }

    const url = `https://graph.facebook.com/v21.0/${leadgenId}`;
    const response = await axios.get(url, {
      params: { access_token: FB_PAGE_TOKEN },
    });

    if (response.data?.error) {
      console.error("[FB] Graph API error:", response.data.error.message);
      return null;
    }
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
  console.log("[TT] Verify:", { token, challenge });

  if (token === TT_VERIFY_TOKEN) {
    console.log("[TT] ✓ Verified");
    return res.status(200).send(challenge);
  }
  console.error("[TT] ✗ Verification failed");
  return res.sendStatus(403);
});

app.post("/tt/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body;

    // TikTok sends data in entry[].changes[] format
    // Each entry is a lead with changes containing the form fields
    for (const entry of body.entry || []) {
      const {
        id: lead_id,
        page_id: form_id,
        page_name,
        campaign_id,
        campaign_name,
        adgroup_id,
        adgroup_name,
        ad_id,
        ad_name,
        advertiser_id,
        create_time,
        changes,
      } = entry;

      console.log("[TT] Lead:", { lead_id, form_id, adgroup_id, page_name });

      // Convert changes array to field object
      // changes format: [{field: "email", value: "test@example.com"}, ...]
      const fieldData = {};
      for (const change of changes || []) {
        const fieldName = (change.field || "")
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[?]/g, "");
        fieldData[fieldName] = change.value || "";
      }

      console.log("[TT] Parsed fields:", JSON.stringify(fieldData, null, 2));

      const normalizedFields = normalizeTikTokFields(fieldData);
      console.log(
        "[TT] Normalized:",
        JSON.stringify(normalizedFields, null, 2),
      );

      await processLead(normalizedFields, {
        source: "tiktok",
        meta: {
          lead_id,
          form_id,
          page_name,
          adgroup_id,
          adgroup_name,
          campaign_id,
          campaign_name,
          ad_id,
          ad_name,
          advertiser_id,
          create_time,
        },
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

  const result = await processLead(fields, {
    source: "lead-contact",
    meta: { received_at: new Date().toISOString() },
    doEmail: true,
    doSms: true,
    doDial: true, // Auto-dial (queued if outside business hours)
    doCase: true, // Always create Logics case
    doNotify: true,
  });

  return res.json({
    ok: true,
    ...result,
    businessHours: {
      tz: BUSINESS_TZ,
      startHour: BUSINESS_START_HOUR,
      endHour: BUSINESS_END_HOUR,
      inWindowNow: isWithinBusinessHoursPT(),
      queuedCount: dialQueue.length,
    },
  });
});

/* -------------------------------------------------------------------------- */
/*                          TEST ENDPOINT                                     */
/* -------------------------------------------------------------------------- */

/**
 * POST /test-lead
 * Manual testing with query param overrides:
 *   ?source=test&doEmail=false&doSms=false&doDial=false&doCase=false&doNotify=false
 */
app.post("/test-lead", async (req, res) => {
  if (req.headers["x-webhook-key"] !== LEAD_WEBHOOK_SECRET) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const fields = normalizeLeadContactPayload(req.body);
  const q = req.query;

  console.log("[TEST] Received:", fields, "Query:", q);

  const result = await processLead(fields, {
    source: q.source || "test",
    meta: { test: true, received_at: new Date().toISOString() },
    doEmail: q.doEmail !== "false",
    doSms: q.doSms !== "false",
    doDial: q.doDial !== "false",
    doCase: q.doCase !== "false",
    doNotify: q.doNotify !== "false",
  });

  return res.json({
    ok: true,
    ...result,
    businessHours: {
      tz: BUSINESS_TZ,
      startHour: BUSINESS_START_HOUR,
      endHour: BUSINESS_END_HOUR,
      inWindowNow: isWithinBusinessHoursPT(),
      queuedCount: dialQueue.length,
    },
  });
});

/* -------------------------------------------------------------------------- */
/*                          START SERVER                                      */
/* -------------------------------------------------------------------------- */

app.listen(PORT, async () => {
  console.log(`
═══════════════════════════════════════════════════════════
  WEBHOOK SERVER
═══════════════════════════════════════════════════════════
  Port:             ${PORT}
  Email:            ${FROM_EMAIL} → ${TO_EMAIL}
  Template:         ${prospectWelcomeTpl ? "✓ Loaded" : "⚠ Missing"}
  Dial Queue:       ${dialQueue.length} pending
  Business Hours:   Mon-Fri ${BUSINESS_START_HOUR}:00-${BUSINESS_END_HOUR}:00 ${BUSINESS_TZ}

  Feature Flags:
    Facebook:       outreach=${ENABLE_FACEBOOK_OUTREACH} dial=${ENABLE_FACEBOOK_DIAL} case=${ENABLE_FACEBOOK_CASE}
    TikTok:         outreach=${ENABLE_TIKTOK_OUTREACH} dial=${ENABLE_TIKTOK_DIAL} case=${ENABLE_TIKTOK_CASE}
    Lead Contact:   case=always dial=queued

  Routes:
    /fb/webhook       Facebook Lead Ads
    /tt/webhook       TikTok Lead Ads
    /lead-contact     External Lead API (website forms)
    /test-lead        Manual Testing (query params override)
═══════════════════════════════════════════════════════════
  `);

  // Warm up RingCentral auth at startup (refresh every 45 min to stay ahead of 1hr token expiry)
  warmupRingCentral(45 * 60 * 1000).catch((err) => {
    console.error("[STARTUP] RingCentral warmup failed:", err.message);
  });

  // ── Cadence Engine ─────────────────────────────────────────────────────────
  // Runs at specific times during business hours: 7am, 8:40am, then hourly

  const cadenceActions = {
    sendText: async (phone, name, textNum) => {
      console.log(`[CADENCE-ACTION] sendText #${textNum} to ${phone}`);
      return sendWelcomeText(phone, name, textNum);
    },
    placeCall: async (fields) => {
      console.log(`[CADENCE-ACTION] placeCall to ${fields.phone}`);
      return dialLeadNow(fields);
    },
    sendFollowUpEmail: async (email, name, emailIndex) => {
      console.log(
        `[CADENCE-ACTION] sendFollowUpEmail #${emailIndex} to ${email}`,
      );
      // TODO: Implement follow-up email templates (for now, use welcome email)
      return sendWelcomeEmail(email, name);
    },
  };

  async function runCadenceWithLogging() {
    console.log("[CADENCE] ══════════════════════════════════════════════════");
    console.log("[CADENCE] Starting scheduled cadence tick...");
    console.log(
      "[CADENCE] Time:",
      new Date().toLocaleString("en-US", { timeZone: BUSINESS_TZ }),
    );

    try {
      const result = await runCadenceTick(cadenceActions);

      if (result.skipped) {
        console.log(`[CADENCE] Skipped: ${result.reason}`);
      } else {
        console.log(`[CADENCE] Processed: ${result.processed} leads`);
        console.log(`[CADENCE] Calls queued: ${result.callsQueued}`);
        console.log(`[CADENCE] Total queue: ${result.totalQueueSize}`);

        // Log individual actions
        for (const r of result.results || []) {
          if (r.actions?.length > 0) {
            console.log(
              `[CADENCE]   CaseID ${r.caseId} (${r.name}): ${r.actions.map((a) => a.type).join(", ")}`,
            );
          }
        }
      }
    } catch (err) {
      console.error("[CADENCE] Error:", err.message);
    }

    console.log("[CADENCE] ══════════════════════════════════════════════════");
  }

  // Schedule cadence at specific times (PT) - every 30 minutes during business hours
  // Run times: 7:00, 7:30, 8:00, 8:30, 9:00, 9:30, 10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30
  function scheduleCadence() {
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: BUSINESS_TZ }),
    );
    const hour = now.getHours();
    const minute = now.getMinutes();

    // Define run times as [hour, minute] - every 30 min from 7am to 5pm
    const runTimes = [];
    for (let h = 7; h <= 16; h++) {
      runTimes.push([h, 0]);
      runTimes.push([h, 30]);
    }

    // Find next run time
    let nextRun = null;
    for (const [h, m] of runTimes) {
      if (hour < h || (hour === h && minute < m)) {
        nextRun = { hour: h, minute: m };
        break;
      }
    }

    // If no more runs today, schedule for 7am tomorrow
    if (!nextRun) {
      nextRun = { hour: 7, minute: 0, tomorrow: true };
    }

    // Calculate ms until next run
    const target = new Date(now);
    target.setHours(nextRun.hour, nextRun.minute, 0, 0);
    if (nextRun.tomorrow) {
      target.setDate(target.getDate() + 1);
    }

    const msUntilNext = target.getTime() - now.getTime();

    console.log(
      `[CADENCE] Next run: ${nextRun.hour}:${String(nextRun.minute).padStart(2, "0")} PT (in ${Math.round(msUntilNext / 60000)} min)`,
    );

    setTimeout(() => {
      runCadenceWithLogging();
      scheduleCadence(); // Schedule the next one
    }, msUntilNext);
  }

  // Run immediately on startup if within business hours, then schedule
  console.log("[STARTUP] Starting initial cadence tick...");

  scheduleCadence();

  console.log(
    "[STARTUP] Cadence engine scheduled: every 30 min from 7:00-16:30 PT",
  );
});
