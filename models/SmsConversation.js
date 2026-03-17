// models/SmsConversation.js
const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  direction: {
    type: String,
    enum: ["inbound", "outbound"],
    required: true,
  },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  aiGenerated: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ["received", "pending", "approved", "sent", "cancelled", "edited"],
    default: "received",
  },
  editedContent: String, // if manually edited before sending
  sentAt: Date,
});

const smsConversationSchema = new mongoose.Schema(
  {
    customerPhone: { type: String, required: true, index: true },
    trackingNumber: { type: String, required: true },
    company: { type: String, enum: ["WYNN", "TAG"], required: true },
    companyId: String, // CallRail company_id

    // Lead matching
    caseId: Number,
    leadName: String,
    leadEmail: String,
    contactType: {
      type: String,
      enum: ["prospect", "client", "unknown", "opt-out"],
      default: "unknown",
    },

    // Conversation thread
    messages: [messageSchema],

    // Current pending response
    proposedResponse: String,
    responseStatus: {
      type: String,
      enum: ["idle", "pending", "sent", "cancelled", "edited"],
      default: "idle",
    },
    autoSendAt: Date, // when the timer expires and auto-sends
    alertSent: { type: Boolean, default: false },

    // Settings
    autoRespondEnabled: { type: Boolean, default: true },
    botSleeping: { type: Boolean, default: false }, // manual intervention pauses bot

    // Stats
    totalInbound: { type: Number, default: 0 },
    totalOutbound: { type: Number, default: 0 },
    lastInboundAt: Date,
    lastOutboundAt: Date,
  },
  {
    timestamps: true,
  },
);

// Compound index for quick lookup
smsConversationSchema.index({ customerPhone: 1, company: 1 });
smsConversationSchema.index({ responseStatus: 1, autoSendAt: 1 });

module.exports = mongoose.model("SmsConversation", smsConversationSchema);
