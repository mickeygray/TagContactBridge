// ringBridge/server.js
// ─────────────────────────────────────────────────────────────
// RingBridge — EX↔CX Unified Agent Platform
// Lives inside TagContactBridge, runs on its own port.
//
// Usage:
//   node ringBridge/server.js       (from TagContactBridge root)
//   pm2 start ringBridge/server.js --name ringbridge
//
// Shares parent .env, node_modules, and Mongo connection.
// ─────────────────────────────────────────────────────────────

require("../shared/utils/processGuard")("ringBridge");
const express = require("express");
const path = require("path");
const config = require("./config/env");
const log = require("./utils/logger");
const { startCron } = require("./services/dailyReportService");
// Shared MongoDB connection from parent TagContactBridge
const connectDB = require("../shared/config/db");

// Routes
const webhookRoutes = require("./routes/webhookRoutes");
const apiRoutes = require("./routes/apiRoutes");

// Services
const rcAuthService = require("./services/rcAuthService");
const webhookManager = require("./services/webhookManager");

const app = express();

// ─── Middleware ───────────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS for local dev + chrome extension
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// Serve dashboard
app.use(express.static(path.join(__dirname, "public")));

// ─── Routes ──────────────────────────────────────────────────

app.use("/webhook", webhookRoutes);
app.use("/api", apiRoutes);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// Error handler + health check
const { expressErrorHandler, healthCheck } = require("../shared/utils/processGuard");
app.get("/health", healthCheck("ringBridge"));
app.use(expressErrorHandler("ringBridge"));

// ─── Startup ─────────────────────────────────────────────────

async function start() {
  log.info("Starting RingBridge...");
  log.info(`Running from: ${__dirname}`);

  // Connect to MongoDB (shared connection from parent config/db)
  await connectDB();

  // Authenticate with RingCentral EX (same warmup pattern as :4000)
  const rcReady = await rcAuthService.warmup();
  if (!rcReady) {
    log.warn(
      "RC auth failed — running in offline mode (dashboard will work, no live events)",
    );
  }

  // Initialize webhook subscriptions
  try {
    await webhookManager.initializeAll();
  } catch (err) {
    log.warn("Webhook initialization failed:", err.message);
  }
  try {
    startCron();
  } catch (err) {
    log.warn("Daily report cron failed to start:", err.message);
  }

  // Start server
  app.listen(config.PORT, () => {
    log.success(`RingBridge running on port ${config.PORT}`);
    log.info(`Dashboard: http://localhost:${config.PORT}`);
    log.info(`Webhook endpoint: ${config.NGROK_DOMAIN}/webhook/ex`);
    log.info(`Health check: http://localhost:${config.PORT}/api/health`);
    log.info("");

    if (!config.RC_CLIENT_ID) {
      log.warn("══════════════════════════════════════════════════════");
      log.warn("  RC credentials not set — running in OFFLINE MODE");
      log.warn("  Uses RING_CENTRAL_* vars from parent .env");
      log.warn("  Dashboard and API work, but no live EX events");
      log.warn("══════════════════════════════════════════════════════");
    }
  });
}

start().catch((err) => {
  log.error("Fatal startup error:", err);
  process.exit(1);
});

module.exports = app;
