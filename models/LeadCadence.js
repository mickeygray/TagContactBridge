// models/LeadCadence.js
const mongoose = require("mongoose");

const leadCadenceSchema = new mongoose.Schema(
  {
    // ── Core lead data ──────────────────────────────────────
    caseId: { type: Number, required: true, unique: true, index: true },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" }, // 10-digit or E.164
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    source: {
      type: String,
      enum: ["facebook", "tiktok", "lead-contact", "test", "unknown"],
      default: "unknown",
    },

    // ── Validation results ──────────────────────────────────
    emailValid: { type: Boolean, default: false },
    phoneConnected: { type: Boolean, default: false },
    phoneIsCell: { type: Boolean, default: false },
    validationDetails: {
      phoneStatus: { type: String, default: "" }, // raw status from RealValidation
      emailResult: { type: String, default: "" }, // raw result from NeverBounce
    },

    // ── Email cadence ───────────────────────────────────────
    welcomeEmailSent: { type: Boolean, default: false },
    emailsSent: { type: Number, default: 0 }, // follow-up chain count (max 5 chain + weekly)
    lastEmailedAt: { type: Date, default: null },

    // ── SMS cadence ─────────────────────────────────────────
    textsSent: { type: Number, default: 0 }, // max 3 (1/day for first 3 days)
    lastTextedAt: { type: Date, default: null },

    // ── Call cadence ────────────────────────────────────────
    callsMade: { type: Number, default: 0 }, // lifetime total
    callsToday: { type: Number, default: 0 }, // resets each business day
    callsTodayDate: { type: String, default: "" }, // "YYYY-MM-DD" to detect day rollover
    lastCalledAt: { type: Date, default: null },

    // ── Lifecycle ───────────────────────────────────────────
    lastLogicsStatus: { type: Number, default: null },
    lastLogicsCheckAt: { type: Date, default: null },
    active: { type: Boolean, default: true, index: true },
  },
  {
    timestamps: true, // adds createdAt, updatedAt
  },
);

// Compound index for cron queries
leadCadenceSchema.index({ active: 1, createdAt: 1 });

module.exports = mongoose.model("LeadCadence", leadCadenceSchema);
