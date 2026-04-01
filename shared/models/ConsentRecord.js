// models/ConsentRecord.js
// ─────────────────────────────────────────────────────────────
// Permanent immutable record of consent at time of lead receipt.
// Never updated or deleted regardless of DNC, opt-out, or
// lead deactivation. Retained for TCPA defense (5 year minimum).
// ─────────────────────────────────────────────────────────────

const mongoose = require("mongoose");

const consentRecordSchema = new mongoose.Schema(
  {
    // ── Lead identity ──
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    caseId: { type: String, default: "" },
    company: { type: String, default: "" },
    source: { type: String, default: "" },

    // ── Consent tokens ──
    trustedFormCertUrl: { type: String, default: "" },
    jornayaLeadId: { type: String, default: "" },

    // ── Receipt metadata ──
    receivedAt: { type: Date, default: Date.now },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
  },
  {
    timestamps: false,
    // No TTL — permanent record
  },
);

// Prevent any updates — immutable after creation
consentRecordSchema.pre("findOneAndUpdate", function () {
  throw new Error("ConsentRecord is immutable — updates not permitted");
});
consentRecordSchema.pre("updateOne", function () {
  throw new Error("ConsentRecord is immutable — updates not permitted");
});
consentRecordSchema.pre("updateMany", function () {
  throw new Error("ConsentRecord is immutable — updates not permitted");
});

module.exports = mongoose.model("ConsentRecord", consentRecordSchema);
