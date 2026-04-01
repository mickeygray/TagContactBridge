// models/LeadCadence.js
const mongoose = require("mongoose");

const leadCadenceSchema = new mongoose.Schema(
  {
    // Core lead info
    caseId: { type: String, required: true, index: true },
    company: { type: String, default: "WYNN", index: true },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    source: {
      type: String,
    },

    // ── Case age (stored integer, NOT derived from createdAt) ──
    // Starts at 0 on creation. Incremented by +1 at the first
    // cadence tick of each new business day. This is the single
    // source of truth for all schedule gates (texts, RVMs, emails,
    // PhoneBurner folder cascade).
    caseAge: { type: Number, default: 0 },
    // "YYYY-MM-DD" PT — tracks which calendar day the last
    // increment happened so we only bump once per day.
    caseAgeUpdatedDate: { type: String, default: "" },

    // Validation results
    emailValid: { type: Boolean, default: false },
    phoneConnected: { type: Boolean, default: false },
    phoneIsCell: { type: Boolean, default: false },
    validationDetails: {
      phoneStatus: { type: String, default: "unknown" },
      phoneCanCall: { type: Boolean, default: false },
      phoneCanText: { type: Boolean, default: false },
      phoneDNC: { type: Boolean, default: false },
      phoneLitigator: { type: Boolean, default: false },
      emailResult: { type: String, default: "unknown" },
      emailFlags: [{ type: String }],
    },

    // Per-channel DNC flags
    smsDnc: { type: Boolean, default: false },
    smsDncReason: {
      type: String,
      enum: ["opted-out", "invalid-phone", "landline", null],
      default: null,
    },
    rvmDnc: { type: Boolean, default: false },
    rvmDncReason: {
      type: String,
      enum: ["national-dnc", "invalid-area-code", "permanent-fail", null],
      default: null,
    },
    dncUpdatedAt: { type: Date },

    // Day 0 dialer tracking
    day0CallsMade: { type: Number, default: 0 },
    day0Connected: { type: Boolean, default: false },
    day0ConnectedAt: { type: Date },
    day0ConnectDuration: { type: Number },
    day0ConnectCallId: { type: String },

    // Worked lead — pause outreach until this date
    pauseOutreachUntil: { type: Date },
    lastCallDuration: { type: Number },
    lastConnectCallId: { type: String },

    // Standard cadence tracking — calls
    callsMade: { type: Number, default: 0 },
    lastCalledAt: { type: Date },
    lastCallResult: {
      type: String,
      enum: [
        "answered",
        "voicemail",
        "no_answer",
        "busy",
        "rejected",
        "failed",
        "unknown",
        null,
      ],
      default: null,
    },

    // Standard cadence tracking — texts
    welcomeEmailSent: { type: Boolean, default: false },
    textsSent: { type: Number, default: 0 },
    lastTextedAt: { type: Date },

    // Standard cadence tracking — emails
    emailsSent: { type: Number, default: 0 },
    lastEmailedAt: { type: Date },

    // RVM tracking
    rvmsSent: { type: Number, default: 0 },
    lastRvmAt: { type: Date },
    lastRvmActivityToken: { type: String },
    lastRvmStatus: { type: String },
    lastRvmStatusCode: { type: Number },
    lastRvmStatusAt: { type: Date },

    // Legacy (kept for compatibility)
    nextOutreachType: {
      type: String,
      enum: ["call", "rvm", null],
      default: "rvm",
    },

    // Logics status tracking
    lastLogicsStatus: { type: Number },
    lastLogicsCheckAt: { type: Date },

    // PhoneBurner tracking
    pbPushed: { type: Boolean, default: false },
    pbPushedAt: { type: Date },
    pbContactId: { type: String },
    pbCurrentFolder: { type: String },
    pbPreviousFolder: { type: String },
    pbDialCount: { type: Number, default: 0 },
    pbLastDialedAt: { type: Date },

    // Active flag
    active: { type: Boolean, default: true, index: true },
  },
  {
    timestamps: true,
    collection: "leadcadences",
  },
);

// Compound indexes
leadCadenceSchema.index({ caseId: 1, company: 1 }, { unique: true });
leadCadenceSchema.index({ active: 1, company: 1, createdAt: -1 });
leadCadenceSchema.index({ active: 1, createdAt: -1 });
leadCadenceSchema.index({ active: 1, day0Connected: 1, createdAt: -1 });
leadCadenceSchema.index({ active: 1, phoneConnected: 1 });
leadCadenceSchema.index({ active: 1, caseAge: 1 });
// Metrics dashboard indexes
leadCadenceSchema.index({ company: 1, createdAt: -1 });
leadCadenceSchema.index({ source: 1, company: 1, createdAt: -1 });

module.exports = mongoose.model("LeadCadence", leadCadenceSchema);
