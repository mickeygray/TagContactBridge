// shared/utils/processGuard.js
// ─────────────────────────────────────────────────────────────
// Crash isolation for each bridge process.
// Call once at the top of each server.js:
//
//   require("../shared/utils/processGuard")("leadBridge");
//
// What it does:
//   1. Catches unhandled exceptions — logs to system logger, does NOT exit
//      (Express can continue serving other requests)
//   2. Catches unhandled promise rejections — same treatment
//   3. Catches Express route errors via a middleware factory
//   4. Monitors MongoDB connection — logs disconnect/reconnect
//   5. Exposes a health check endpoint factory
//
// What it does NOT do:
//   - Kill the process on a caught error (that's PM2's job if truly stuck)
//   - Silence errors (everything goes to systemLog)
//   - Mask bugs (stack traces are preserved in the log entry)
// ─────────────────────────────────────────────────────────────

const mongoose = require("mongoose");

let log = null;

function init(bridgeName) {
  // Lazy-load systemLog to avoid circular deps during early boot
  try {
    const { createLogger } = require("./systemLog");
    log = createLogger(bridgeName);
  } catch {
    // systemLog not available yet (Mongo not connected) — use console
    log = {
      error: (cat, msg, data) => console.error(`[${bridgeName}] [${cat}] ${msg}`, data || ""),
      warn: (cat, msg, data) => console.warn(`[${bridgeName}] [${cat}] ${msg}`, data || ""),
      info: (cat, msg, data) => console.log(`[${bridgeName}] [${cat}] ${msg}`, data || ""),
    };
  }

  // ─── Unhandled Exception ────────────────────────���──────────
  // By default Node exits on uncaughtException. We catch it,
  // log it, and let the process continue. PM2 will restart if
  // the process enters a bad state (health check fails).
  process.on("uncaughtException", (err) => {
    log.error("UNCAUGHT", `${err.message}`, {
      stack: err.stack?.split("\n").slice(0, 5).join("\n"),
    });
    // Do NOT call process.exit() — let Express keep serving
  });

  // ─── Unhandled Promise Rejection ───────────────────────────
  process.on("unhandledRejection", (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack?.split("\n").slice(0, 5).join("\n") : undefined;
    log.error("UNHANDLED_REJECTION", msg, { stack });
  });

  // ─── MongoDB Connection Monitoring ─────────────────────────
  mongoose.connection.on("disconnected", () => {
    log.error("MONGO", "Connection lost — queries will fail until reconnected");
  });
  mongoose.connection.on("reconnected", () => {
    log.info("MONGO", "Reconnected");
  });
  mongoose.connection.on("error", (err) => {
    log.error("MONGO", `Connection error: ${err.message}`);
  });

  log.info("BOOT", `${bridgeName} process guard active`);
}

// ─── Express Error Middleware ─────────────────────────────────
// Mount as the LAST middleware: app.use(expressErrorHandler("leadBridge"))
// Catches errors thrown/next(err) in route handlers.

function expressErrorHandler(bridgeName) {
  return (err, req, res, _next) => {
    const entry = {
      method: req.method,
      url: req.originalUrl,
      stack: err.stack?.split("\n").slice(0, 5).join("\n"),
    };

    if (log) {
      log.error("EXPRESS", `${req.method} ${req.originalUrl} — ${err.message}`, entry);
    } else {
      console.error(`[${bridgeName}] EXPRESS ERROR:`, err.message, entry);
    }

    // Don't leak stack traces to the client
    if (!res.headersSent) {
      res.status(err.status || 500).json({
        error: process.env.NODE_ENV === "production"
          ? "Internal server error"
          : err.message,
      });
    }
  };
}

// ─── Health Check Endpoint ───────────────────────────────────
// Mount: app.get("/health", healthCheck("leadBridge"))
// PM2 or nginx can poll this to detect stuck processes.

function healthCheck(bridgeName) {
  return async (req, res) => {
    const checks = {
      bridge: bridgeName,
      uptime: Math.floor(process.uptime()),
      memory: Math.round(process.memoryUsage().rss / 1024 / 1024),
      mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      timestamp: new Date().toISOString(),
    };

    const healthy = checks.mongo === "connected";
    res.status(healthy ? 200 : 503).json(checks);
  };
}

module.exports = init;
module.exports.expressErrorHandler = expressErrorHandler;
module.exports.healthCheck = healthCheck;
