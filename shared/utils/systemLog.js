// shared/utils/systemLog.js
// ─────────────────────────────────────────────────────────────
// Universal structured logging for all three bridges.
// Replaces console.log sprawl with:
//   1. Structured JSON entries in MongoDB (capped collection, auto-rotates)
//   2. SSE broadcast to connected React clients (debug panel + toast)
//   3. Minimal console output (errors only, for PM2 crash forensics)
//
// Usage:
//   const log = require("../../shared/utils/systemLog")("leadBridge");
//   log.info("CADENCE", "Tick completed", { processed: 42 });
//   log.error("SMS", "SendGrid failed", { to: "...", err: err.message });
//   log.warn("AUTH", "Expired session cleanup", { count: 7 });
// ─────────────────────────────────────────────────────────────

const mongoose = require("mongoose");

// ─── MongoDB Capped Collection ──────────────────────────────
// 50MB cap ≈ ~200K entries. Old entries auto-delete. No cleanup needed.

const logSchema = new mongoose.Schema({
  bridge: { type: String, required: true, index: true },
  level: { type: String, enum: ["info", "warn", "error", "debug"], default: "info", index: true },
  category: { type: String, index: true },
  message: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now, index: { expireAfterSeconds: 7 * 24 * 60 * 60 } }, // 7-day TTL
});

logSchema.index({ timestamp: -1 });
logSchema.index({ bridge: 1, level: 1, timestamp: -1 });

const SystemLog = mongoose.models.SystemLog || mongoose.model("SystemLog", logSchema);

// ─── SSE Clients ────────────────────────────────────────────
// Any bridge can broadcast. React connects to clientBridge's SSE endpoint.

const sseClients = new Set();

function addSSEClient(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(":\n\n"); // heartbeat
  sseClients.add(res);
  res.on("close", () => sseClients.delete(res));
}

function broadcastLog(entry) {
  const payload = `data: ${JSON.stringify(entry)}\n\n`;
  for (const client of sseClients) {
    try { client.write(payload); } catch { sseClients.delete(client); }
  }
}

// Keep-alive heartbeat every 30s
setInterval(() => {
  for (const client of sseClients) {
    try { client.write(":\n\n"); } catch { sseClients.delete(client); }
  }
}, 30000);

// ─── Logger Factory ─────────────────────────────────────────

function createLogger(bridge) {
  async function write(level, category, message, data) {
    const entry = {
      bridge,
      level,
      category: category || "GENERAL",
      message,
      data: data || null,
      timestamp: new Date(),
    };

    // Always broadcast to SSE (real-time debug panel)
    broadcastLog(entry);

    // Errors also go to console (PM2 crash forensics)
    if (level === "error") {
      console.error(`[${bridge}] [${category}] ${message}`, data ? JSON.stringify(data).slice(0, 200) : "");
    }

    // Write to MongoDB (fire-and-forget, never block the caller)
    try {
      await SystemLog.create(entry);
    } catch {
      // If Mongo is down, we can't log that we can't log. Console fallback.
      console.error(`[${bridge}] LOG WRITE FAILED: ${message}`);
    }
  }

  return {
    info: (category, message, data) => write("info", category, message, data),
    warn: (category, message, data) => write("warn", category, message, data),
    error: (category, message, data) => write("error", category, message, data),
    debug: (category, message, data) => write("debug", category, message, data),
  };
}

// ─── Query API (for debug panel) ────────────────────────────

async function queryLogs({ bridge, level, category, limit = 100, before } = {}) {
  const query = {};
  if (bridge) query.bridge = bridge;
  if (level) query.level = level;
  if (category) query.category = category;
  if (before) query.timestamp = { $lt: new Date(before) };

  return SystemLog.find(query)
    .sort({ timestamp: -1 })
    .limit(Math.min(limit, 500))
    .lean();
}

async function getLogStats() {
  const [total, errors24h, byBridge, byLevel] = await Promise.all([
    SystemLog.countDocuments(),
    SystemLog.countDocuments({
      level: "error",
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    }),
    SystemLog.aggregate([
      { $group: { _id: "$bridge", count: { $sum: 1 } } },
    ]),
    SystemLog.aggregate([
      { $match: { timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } },
      { $group: { _id: "$level", count: { $sum: 1 } } },
    ]),
  ]);

  return { total, errors24h, byBridge, byLevel };
}

module.exports = { createLogger, addSSEClient, queryLogs, getLogStats, SystemLog };
