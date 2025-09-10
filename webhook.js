// webhook.js (base level)
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cron = require("node-cron");

// Utils
const sendTextMessage = require("./utils/sendTextMessage");
const sendEmail = require("./utils/sendEmail");

// Services
const {
  createZeroInvoice,
  updateCaseStatus,
  createActivityLoop,
} = require("./services/logicsService");

// Email config
const ADMIN_EMAILS = process.env.ADMIN_EMAILS.split(",")
  .map((e) => e.trim())
  .filter(Boolean);
const FROM_EMAIL = process.env.FROM_EMAIL;
function formatDateWithSuffix(date) {
  const d = new Date(date);
  const month = d.toLocaleString("en-US", { month: "long" });
  const day = d.getDate();

  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
      ? "nd"
      : day % 10 === 3 && day !== 13
      ? "rd"
      : "th";

  return `${month} ${day}${suffix}`;
}
// Message templates for SMS
const MESSAGE_TEMPLATES = {
  VOICEMAIL_RED: () =>
    `This is your tax attorneys office. We have not recieved this months payment. Please call us at ${process.env.PB_YELLOW_TEXT} so we can get back to work on your case.`,
  NO_ANSWER_RED: () =>
    `This is your tax attorneys office. We have not recieved this months payment. Please call us at ${process.env.PB_YELLOW_TEXT} so we can get back to work on your case.`,
  RED_VM_FULL: () =>
    `This is your tax attorneys office. We have not recieved this months payment. Please call us at ${process.env.PB_YELLOW_TEXT} so we can get back to work on your case.`,
  VOICEMAIL_YELLOW: () =>
    `We have been trying to get in touch in regards to our previous conversation about your tax liability issue. Please call us at ${process.env.PB_YELLOW_TEXT} if you need assistance.`,
  NO_ANSWER_YELLOW: () =>
    `We have been trying to get in touch in regards to our previous conversation about your tax liability issue. Please call us at ${process.env.PB_YELLOW_TEXT} if you need assistance.`,
  YELLOW_VM_FULL: () =>
    `We have been trying to get in touch in regards to our previous conversation about your tax liability issue. Please call us at ${process.env.PB_YELLOW_TEXT} if you need assistance.`,
  LEAVE_VOICEMAIL: () =>
    "We tried to reach you about your taxes. Please call us if you need assistance.",
  VOICEMAIL_FULL_AS: () =>
    "We tried to reach you about your taxes. Please call us if you need assistance.",
  YELLOW_FOLLOWUP: (date) =>
    `Great speaking with you. We will reach out again on ${formatDateWithSuffix(
      date
    )}.`,
  AS_SCHEDULE_FOLLOW_UP: (date) =>
    `Great speaking with you. We will reach out again on ${date}.`,
};

// Email templates for specific statuses
const EMAIL_TEMPLATES = {
  BAD_NUMBER_AS: (caseId) => ({
    subject: `Incorrect contact info for case ${caseId}`,
    text: `Agent reported an incorrect phone number for case ${caseId}. Please verify contact details.`,
  }),
  TRANSFERRED: (caseId) => ({
    subject: `Call transferred successfully for case ${caseId}`,
    text: `A call was transferred successfully for case ${caseId}.`,
  }),
};

// Status categories
const DNC_STATUSES = ["YELLOW_DNC", "BAD_NUMBER", "BAD_NUMBER_YELLOW"];
const FOLLOWUP_STATUSES = ["YELLOW_FOLLOWUP", "AS_SCHEDULE_FOLLOW_UP"];
const TRANSFER_STATUSES = ["YELLOW_TRANSFERRED", "AS_TRANSFERRED"];
const VOICEMAIL_YELLOW_STATUSES = [
  "VOICEMAIL_YELLOW",
  "NO_ANSWER_YELLOW",
  "YELLOW_VM_FULL",
];

const VOICEMAIL_RED_STATUSES = [
  "VOICEMAIL_RED",
  "NO_ANSWER_RED",
  "RED_VM_FULL",
];
const VOICEMAIL_AS_STATUSES = [
  "VOICEMAIL_AS",
  "BAD_NUMBER_AS",
  "VOICEMAIL_FULL_(AS)",
];

// In-memory action log
let actionLog = [];

const app = express();
app.use(bodyParser.json());
app.use((req, res, next) => {
  console.log(`→ ${req.method} ${req.url}`);
  if (Object.keys(req.body).length) {
    console.log("Body:", JSON.stringify(req.body, null, 2));
  }
  next();
});
app.post("/pb/calldone", async (req, res) => {
  const { status, contact, custom_fields, follow_up } = req.body;

  const domain = (custom_fields["Logics Database"] || "TAG")
    .toString()
    .toUpperCase();
  const caseId = parseInt(custom_fields["Case ID"]);

  const key = status.replace(/\s+/g, "_").toUpperCase();

  try {
    // 1) Voicemail texts
    if (VOICEMAIL_YELLOW_STATUSES.includes(key)) {
      /*await sendTextMessage({
        phoneNumber: contact.phone,
        trackingNumber: process.env.PB_YELLOW_TEXT,
        message: MESSAGE_TEMPLATES[key](),
      });*/
      actionLog.push({ domain, caseId, action: "sms:voicemail" });
    }

    if (VOICEMAIL_RED_STATUSES.includes(key)) {
      await sendTextMessage({
        phoneNumber: contact.phone,
        trackingNumber: process.env.PB_YELLOW_TEXT,
        message: MESSAGE_TEMPLATES[key](),
      });
      actionLog.push({ domain, caseId, action: "sms:voicemail-RED" });
    }

    if (VOICEMAIL_AS_STATUSES.includes(key)) {
      await sendTextMessage({
        phoneNumber: contact.phone,
        //trackingNumber: "8188623725",
        message: MESSAGE_TEMPLATES[key](),
      });
      actionLog.push({ domain, caseId, action: "sms:voicemail" });
    }

    // 2) DNC statuses
    if (DNC_STATUSES.includes(key)) {
      const searchPhone = contact.phone;
      await updateCaseStatus(domain, 173, searchPhone);
      actionLog.push({ domain, caseId, action: "status:DNC" });
    }

    // 3) AS DNC -> zero invoice
    if (key === "AS_DNC") {
      await createZeroInvoice(domain, caseId);
      actionLog.push({ domain, caseId, action: "invoice:zero" });
    }

    // 4) Bad Number AS -> only activity
    if (key === "BAD_NUMBER_AS") {
      actionLog.push({
        domain,
        caseId,
        action: "skip_case_update:bad_number_as",
      });
    }

    // 5) Follow-up texts
    if (FOLLOWUP_STATUSES.includes(key)) {
      console.log(key, "KEY");
      console.log(follow_up, "FOLLOW_UP");
      await sendTextMessage({
        phoneNumber: contact.phone,
        trackingNumber: process.env.PB_YELLOW_TEXT,
        message: MESSAGE_TEMPLATES[key](follow_up),
      });
      actionLog.push({ domain, caseId, action: "sms:followup" });
    }

    // 6) Transfer statuses
    if (TRANSFER_STATUSES.includes(key)) {
      await updateCaseStatus(domain, caseId, 2);
      actionLog.push({ domain, caseId, action: "status:transferred" });
      const { subject, text } = EMAIL_TEMPLATES.TRANSFERRED(caseId);
      await sendEmail({ from: FROM_EMAIL, to: ADMIN_EMAILS, subject, text });
      actionLog.push({ domain, caseId, action: "email:transferred" });
    }
    if (!caseId) return res.status(200).send("Missing lead_id");
    await createActivityLoop(domain, caseId, `Clicked disposition: ${status}`);
    actionLog.push({ domain, caseId, action: "activity:logged" });

    return res.sendStatus(200);
  } catch (err) {
    console.error("Error in /pb/calldone:", err);
    return res.sendStatus(500);
  }
});

/**
 * Send a daily digest of accumulated actions.
 * Groups by domain and caseId, formats into text, emails admins, then clears the log.
 */
async function sendDailyDigest() {
  if (actionLog.length === 0) return;

  // Group by domain and caseId
  const grouped = {};
  actionLog.forEach(({ domain, caseId, action }) => {
    if (!grouped[domain]) grouped[domain] = {};
    if (!grouped[domain][caseId]) grouped[domain][caseId] = [];
    grouped[domain][caseId].push(action);
  });

  // Build email body
  let body = "";
  for (const [dom, cases] of Object.entries(grouped)) {
    body += `Domain: ${dom}\n`;
    for (const [cid, acts] of Object.entries(cases)) {
      body += `  Case ${cid}: ${acts.join(", ")}\n`;
    }
    body += "\n";
  }

  // Send summary
  await sendEmail({
    from: FROM_EMAIL,
    to: ADMIN_EMAILS,
    subject: `Daily PB Disposition Digest (${new Date().toLocaleDateString()})`,
    text: body,
  });

  // Clear log
  actionLog = [];
}

// Schedule Mon-Fri at 5 PM
cron.schedule("0 17 * * 1-5", () => {
  console.log("Running daily PB disposition digest...");
  sendDailyDigest().catch((err) => console.error("Digest error:", err));
});

const PORT = process.env.WEBHOOK_PORT || 4000;
app.listen(PORT, () => console.log(`PB webhook listening on port ${PORT}`));
