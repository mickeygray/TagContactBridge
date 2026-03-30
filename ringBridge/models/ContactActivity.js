// ringBridge/models/ContactActivity.js
// Tracks every call event with optional Logics case enrichment.

const mongoose = require('mongoose');

const contactActivitySchema = new mongoose.Schema({
  // Agent info
  extensionId: { type: String, required: true, index: true },
  agentName: String,
  company: String,

  // Call info
  direction: { type: String, enum: ['Inbound', 'Outbound', 'Unknown'], default: 'Unknown' },
  phone: { type: String, index: true },
  phoneFormatted: String,
  callSessionId: String,
  telephonySessionId: String,
  callStartTime: Date,
  callEndTime: Date,
  durationSeconds: { type: Number, default: 0 },

  // Disposition (filled by widget or override)
  disposition: { type: String, enum: ['good', 'bad', 'none'], default: 'none' },

  // Logics enrichment — filled async
  enrichmentStatus: {
    type: String,
    enum: ['pending', 'matched', 'unmatched', 'retried', 'error'],
    default: 'pending'
  },
  caseMatch: {
    domain: String,
    caseId: Number,
    firstName: String,
    lastName: String,
    name: String,
    statusId: Number,
    saleDate: Date,
    email: String,
    city: String,
    state: String,
    taxAmount: Number,
  },
  allMatches: [{
    domain: String,
    caseId: Number,
    name: String,
    statusId: Number,
  }],

  // Retry tracking
  enrichmentAttempts: { type: Number, default: 0 },
  lastEnrichmentAt: Date,
  enrichmentError: String,

  // ─── Transcription (outbound calls only) ──────────────
  transcription: {
    status: { type: String, enum: ['pending', 'processing', 'completed', 'no_recording', 'skipped', 'transcription_failed', 'download_failed', 'retrying', 'error'], default: 'pending' },
    text: String,
    recordingDuration: Number,
    recordingUri: String,
    transcribedAt: Date,
    error: String,
  },

  // ─── Claude scoring (vendor lead quality) ─────────────
  callScore: {
    overall: Number,
    dimensions: {
      contactability: { score: Number, note: String },
      legitimacy: { score: Number, note: String },
      tax_issue_present: { score: Number, note: String },
      interest_level: { score: Number, note: String },
      qualification: { score: Number, note: String },
    },
    lead_verdict: String,
    summary: String,
    red_flags: [String],
    key_details: {
      answered: Boolean,
      voicemail: Boolean,
      tax_type: String,
      tax_amount_mentioned: String,
      employed: String,
      willing_to_proceed: String,
    },
  },

}, { timestamps: true });

contactActivitySchema.index({ extensionId: 1, createdAt: -1 });
contactActivitySchema.index({ phone: 1, createdAt: -1 });
contactActivitySchema.index({ 'caseMatch.caseId': 1, createdAt: -1 });
contactActivitySchema.index({ enrichmentStatus: 1, createdAt: -1 });
contactActivitySchema.index({ createdAt: -1 });

module.exports = mongoose.model('RB_ContactActivity', contactActivitySchema);
