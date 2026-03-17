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
      enum: [
        "facebook",
        "tiktok",
        "lead-contact",
        "test",
        "unknown",
        "LD Posting",
      ],
      default: "unknown",
    },

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
    // Set on permanent SMS/RVM failures to skip future attempts
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
    day0ConnectDuration: { type: Number }, // seconds
    day0ConnectCallId: { type: String },

    // Worked lead — pause outreach until this date
    // Set when a call lasts 5+ minutes (lead is being worked by rep)
    pauseOutreachUntil: { type: Date },
    lastCallDuration: { type: Number }, // seconds
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

    // RVM (Ringless Voicemail) tracking
    rvmsSent: { type: Number, default: 0 },
    lastRvmAt: { type: Date },
    lastRvmActivityToken: { type: String },
    lastRvmStatus: { type: String },
    lastRvmStatusCode: { type: Number },
    lastRvmStatusAt: { type: Date },

    // Alternating call/RVM logic (legacy — kept for compatibility)
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
    pbContactId: { type: String }, // PB contact_user_id for move/remove ops
    pbCurrentFolder: { type: String }, // HOT, DAY1, DAY2, DAY3_10, DAY10_PLUS, TRANSFER
    pbPreviousFolder: { type: String }, // folder before TRANSFER (for bounce-back)
    pbDialCount: { type: Number, default: 0 }, // total PB dial attempts
    pbLastDialedAt: { type: Date }, // last PB calldone timestamp

    // Active flag (deactivate when Logics status changes)
    active: { type: Boolean, default: true, index: true },
  },
  {
    timestamps: true,
    collection: "leadcadences",
  },
);

// Compound indexes for common queries
leadCadenceSchema.index({ caseId: 1, company: 1 }, { unique: true });
leadCadenceSchema.index({ active: 1, company: 1, createdAt: -1 });
leadCadenceSchema.index({ active: 1, createdAt: -1 });
leadCadenceSchema.index({ active: 1, day0Connected: 1, createdAt: -1 });
leadCadenceSchema.index({ active: 1, phoneConnected: 1 });
leadCadenceSchema.index({ active: 1, nextOutreachType: 1 });

module.exports = mongoose.model("LeadCadence", leadCadenceSchema);
