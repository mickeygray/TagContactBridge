// ringBridge/cx/services/cxDispositionService.js
// ─────────────────────────────────────────────────────────────
// Auto-disposition for CX calls.
//
// When a CX call ends, this service:
//   1. Takes the caller phone number from the contact event
//   2. Looks up the phone in Logics (TAG + WYNN)
//   3. Checks for recent activity (last 5 min) — was a quote
//      created? An initial payment? A payment schedule?
//   4. Maps the Logics findings to a CX disposition
//   5. Sets the disposition on the CX contact
//   6. Optionally updates the Logics case status
//
// Disposition mapping:
//   Sale/payment found    → "Sale Made" → Logics: sold status
//   Quote/schedule found  → "Interested" → Logics: appointment set
//   Activity but no sale  → "Contacted" → Logics: no change
//   No activity found     → "No Answer" / "Not Interested"
//   DNC requested         → "DNC" → deactivate lead
// ─────────────────────────────────────────────────────────────

const cxAuth = require("./cxAuthService");
const { findCaseByPhone, fetchActivities, fetchBillingSummary } = require("../../../shared/services/logicsService");
const log = require("../../utils/logger");
const mongoose = require("mongoose");

// ─── CX Contact Log Schema ──────────────────────────────────
// Mirrors ContactActivity for CX calls + disposition data

const cxContactSchema = new mongoose.Schema({
  cxContactId: { type: String, required: true, unique: true, index: true },
  cxAgentId: String,
  agentName: String,
  extensionId: String,
  phone: { type: String, index: true },
  phoneFormatted: String,
  direction: { type: String, enum: ["Inbound", "Outbound"], default: "Outbound" },
  skillId: Number,
  skillName: String,
  startTime: Date,
  endTime: Date,
  durationSeconds: Number,

  // Logics enrichment
  caseMatch: {
    domain: String,
    caseId: Number,
    name: String,
    statusId: Number,
    sourceName: String,
  },
  enrichmentStatus: { type: String, enum: ["pending", "matched", "unmatched", "error"], default: "pending" },

  // Auto-disposition results
  disposition: {
    outcome: String,       // sale_made, interested, contacted, no_answer, dnc, not_interested
    cxDispositionId: String,
    logicsActivity: String, // what was found in Logics
    autoSet: { type: Boolean, default: false },
    setAt: Date,
  },
}, { timestamps: true });

cxContactSchema.index({ createdAt: -1 });
cxContactSchema.index({ agentName: 1, createdAt: -1 });

const CxContact = mongoose.models.CxContact || mongoose.model("CxContact", cxContactSchema);

// ─── Disposition Mapping ─────────────────────────────────────
// Map Logics findings to disposition outcomes.
// The actual CX dispositionId must be configured per skill —
// these are logical outcomes that get mapped to CX IDs at runtime.

const DISPOSITION_MAP = {
  sale_made: { label: "Sale Made", classification: "Positive" },
  interested: { label: "Interested / Appointment Set", classification: "Positive" },
  contacted: { label: "Contacted / No Decision", classification: "Neutral" },
  no_answer: { label: "No Answer", classification: "Negative" },
  not_interested: { label: "Not Interested", classification: "Negative" },
  dnc: { label: "Do Not Contact", classification: "Negative" },
  callback: { label: "Callback Requested", classification: "Neutral" },
  wrong_number: { label: "Wrong Number", classification: "Negative" },
};

// ─── Core: Process a completed CX call ───────────────────────

async function processCallEnd(contactEvent) {
  const {
    contactId, agentId, agentName, extensionId,
    fromAddr, skillId, skillName, startTime, endTime, durationSeconds,
    isInbound,
  } = contactEvent;

  const phone = (fromAddr || "").replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
  if (!phone) {
    log.pipeSkip("CX-DISPO", agentName, "No phone number on contact");
    return;
  }

  const formatted = phone.length === 10
    ? `(${phone.slice(0, 3)})${phone.slice(3, 6)}-${phone.slice(6)}`
    : phone;

  log.pipe("CX-DISPO", agentName, `Processing ${formatted} (contact: ${contactId})`);

  // Create contact record
  const contact = new CxContact({
    cxContactId: contactId,
    cxAgentId: agentId,
    agentName,
    extensionId,
    phone,
    phoneFormatted: formatted,
    direction: isInbound ? "Inbound" : "Outbound",
    skillId,
    skillName,
    startTime: startTime ? new Date(startTime) : new Date(),
    endTime: endTime ? new Date(endTime) : new Date(),
    durationSeconds: durationSeconds || 0,
  });

  // Step 1: Logics lookup
  try {
    const result = await findCaseByPhone(phone, null);

    if (result.ok && result.matches?.length > 0) {
      const match = result.matches[0];
      contact.caseMatch = {
        domain: match.domain,
        caseId: match.caseId,
        name: match.name,
        statusId: match.statusId,
        sourceName: match.sourceName,
      };
      contact.enrichmentStatus = "matched";
      log.pipeOk("CX-DISPO", agentName, `${formatted} → ${match.domain} #${match.caseId} "${match.name}"`);
    } else {
      contact.enrichmentStatus = "unmatched";
      log.pipe("CX-DISPO", agentName, `${formatted} → no Logics match`);
    }
  } catch (err) {
    contact.enrichmentStatus = "error";
    log.pipeFail("CX-DISPO", agentName, `Logics lookup failed: ${err.message}`);
  }

  // Step 2: Check recent Logics activity for auto-disposition
  let outcome = "contacted";

  if (contact.durationSeconds < 10) {
    outcome = "no_answer";
  } else if (contact.caseMatch?.caseId) {
    try {
      outcome = await analyzeLogicsActivity(
        contact.caseMatch.domain,
        contact.caseMatch.caseId,
        agentName,
        formatted
      );
    } catch (err) {
      log.pipeFail("CX-DISPO", agentName, `Activity analysis failed: ${err.message}`);
    }
  }

  contact.disposition = {
    outcome,
    logicsActivity: outcome,
    autoSet: true,
    setAt: new Date(),
  };

  await contact.save();

  // Step 3: Set disposition on CX platform
  if (cxAuth.isConfigured()) {
    try {
      // TODO: Map logical outcome to actual CX dispositionId
      // This requires querying GET /skills/{skillId}/dispositions first
      // and matching by name. For now, log the intent.
      log.pipe("CX-DISPO", agentName, `${formatted} → outcome: ${outcome} (${DISPOSITION_MAP[outcome]?.label})`);

      // await cxAuth.apiCall("post", `/contacts/${contactId}/disposition`, {
      //   dispositionId: cxDispositionId,
      //   notes: `Auto-dispositioned by TCB: ${outcome}`,
      // });
    } catch (err) {
      log.pipeFail("CX-DISPO", agentName, `CX disposition failed: ${err.message}`);
    }
  }

  // Step 4: Return agent to available (skip ACW)
  // This happens in cxAgentBridge via EX state sync

  return contact;
}

// ─── Analyze Logics Activity ─────────────────────────────────
// Look for signals in the last 5 minutes that indicate outcome

async function analyzeLogicsActivity(domain, caseId, agentName, phone) {
  const activities = await fetchActivities(domain, caseId);
  const now = Date.now();
  const fiveMinAgo = now - 5 * 60 * 1000;

  // Filter to recent activities
  const recent = (activities || []).filter((a) => {
    const actDate = new Date(a.CreatedDate || a.ActivityDate).getTime();
    return actDate >= fiveMinAgo;
  });

  if (recent.length === 0) {
    log.pipe("CX-DISPO", agentName, `${phone} → no recent Logics activity`);
    return "contacted";
  }

  // Look for payment/sale signals
  const subjects = recent.map((a) => (a.Subject || "").toLowerCase());
  const notes = recent.map((a) => (a.Note || a.Notes || "").toLowerCase());
  const allText = [...subjects, ...notes].join(" ");

  if (allText.includes("payment") || allText.includes("initial") || allText.includes("paid")) {
    log.pipeOk("CX-DISPO", agentName, `${phone} → SALE signal (payment activity found)`);
    return "sale_made";
  }

  if (allText.includes("quote") || allText.includes("schedule") || allText.includes("appointment")) {
    log.pipeOk("CX-DISPO", agentName, `${phone} → INTERESTED signal (quote/schedule found)`);
    return "interested";
  }

  if (allText.includes("callback") || allText.includes("follow up") || allText.includes("call back")) {
    log.pipe("CX-DISPO", agentName, `${phone} → CALLBACK signal`);
    return "callback";
  }

  log.pipe("CX-DISPO", agentName, `${phone} → activity found but no sale/quote signals`);
  return "contacted";
}

// ─── Manual Disposition ──────────────────────────────────────

async function manualDisposition(contactId, outcome, notes) {
  const contact = await CxContact.findOne({ cxContactId: contactId });
  if (!contact) throw new Error("CX contact not found");

  contact.disposition = {
    outcome,
    logicsActivity: notes || outcome,
    autoSet: false,
    setAt: new Date(),
  };
  await contact.save();
  return contact;
}

// ─── Lead Controls (DNC / Freeze) ────────────────────────────

async function markDnc(phone, company) {
  const { deactivateLead } = require("../../../shared/utils/deactivateLead");
  return deactivateLead({
    phone: phone.replace(/\D/g, ""),
    company,
    reason: "cx-dnc",
    updateLogics: true,
  });
}

async function freezeProspect(phone, company) {
  // Freeze = pause all automated outreach but don't DNC
  // The lead stays in the system for manual follow-up
  const LeadCadence = require("../../../shared/models/LeadCadence");
  const result = await LeadCadence.updateOne(
    { phone: phone.replace(/\D/g, ""), company, active: true },
    {
      $set: {
        pauseOutreachUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // pause for 1 year (effectively frozen)
        nextOutreachType: null,
      },
    }
  );
  return { ok: result.modifiedCount > 0, frozen: result.modifiedCount };
}

module.exports = {
  processCallEnd,
  manualDisposition,
  markDnc,
  freezeProspect,
  CxContact,
  DISPOSITION_MAP,
};
