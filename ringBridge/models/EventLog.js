const mongoose = require('mongoose');

const eventLogSchema = new mongoose.Schema({
  extensionId: { type: String, required: true, index: true },
  agentName: String,

  // What happened
  eventType: {
    type: String,
    enum: ['presence_change', 'call_start', 'call_end', 'disposition', 'manual_toggle', 'cx_sync', 'webhook_raw'],
    required: true
  },

  // State transition
  previousStatus: String,
  newStatus: String,

  // Source details
  source: { type: String, enum: ['EX_webhook', 'CX_webhook', 'widget', 'admin', 'system'] },

  // Raw event data (for debugging)
  rawPayload: { type: mongoose.Schema.Types.Mixed, default: null },

  // Call details if relevant
  callDetails: {
    direction: String,
    from: String,
    fromName: String,
    to: String,
    sessionId: String,
    telephonySessionId: String
  },

  timestamp: { type: Date, default: Date.now }
}, {
  timestamps: false,
  capped: { size: 52428800, max: 50000 } // 50MB cap, ~50k events
});

eventLogSchema.index({ timestamp: -1 });
eventLogSchema.index({ extensionId: 1, timestamp: -1 });

module.exports = mongoose.model('RB_EventLog', eventLogSchema);
