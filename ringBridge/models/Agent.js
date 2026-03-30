const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema({
  extensionId: { type: String, required: true, unique: true, index: true },
  cxAgentId: { type: String, default: null },
  name: { type: String, required: true },
  company: { type: String, enum: ['TAG', 'WYNN'], default: 'TAG' },
  pin: { type: String, default: null }, // 4-digit PIN for widget auth

  // Canonical state — this is the single source of truth
  status: {
    type: String,
    enum: ['available', 'onCall', 'ringing', 'disposition', 'away', 'offline'],
    default: 'offline'
  },

  // What EX is reporting (raw, before state engine processing)
  exTelephonyStatus: { type: String, default: 'NoCall' },
  exPresenceStatus: { type: String, default: 'Offline' },

  // Active call details
  currentCall: {
    sessionId: String,
    telephonySessionId: String,
    direction: String,        // 'Inbound' | 'Outbound'
    from: String,
    fromName: String,
    to: String,
    startTime: Date
  },

  // Platform tracking
  activePlatform: { type: String, enum: ['EX', 'CX', 'none'], default: 'none' },
  lastStatusChange: { type: Date, default: Date.now },
  lastEventReceived: { type: Date, default: null },

  // Daily stats (reset at midnight)
  dailyStats: {
    date: { type: String, default: () => new Date().toISOString().split('T')[0] },
    hot: { type: Number, default: 0 },
    day1: { type: Number, default: 0 },
    day10: { type: Number, default: 0 },
    aged: { type: Number, default: 0 },
    totalCalls: { type: Number, default: 0 },
    goodCalls: { type: Number, default: 0 },
    badCalls: { type: Number, default: 0 }
  },

  // Webhook subscription tracking
  webhookSubscriptionId: { type: String, default: null },
  webhookExpiresAt: { type: Date, default: null }
}, {
  timestamps: true
});

// Reset daily stats if date has changed
agentSchema.methods.checkDailyReset = function () {
  const today = new Date().toISOString().split('T')[0];
  if (this.dailyStats.date !== today) {
    this.dailyStats = {
      date: today,
      hot: 0, day1: 0, day10: 0, aged: 0,
      totalCalls: 0, goodCalls: 0, badCalls: 0
    };
  }
};

module.exports = mongoose.model('RB_Agent', agentSchema);
