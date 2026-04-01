// ecosystem.config.js — PM2 process configuration
// Usage: pm2 start ecosystem.config.js
//
// Each bridge runs as its own OS process. A crash in one
// does NOT affect the others. PM2 auto-restarts on crash
// with exponential backoff (1s → 2s → 4s → max 15s).

module.exports = {
  apps: [
    {
      name: "leadbridge",
      script: "leadBridge/server.js",
      env: { NODE_ENV: "production" },
      instances: 1,
      max_memory_restart: "512M",
      exp_backoff_restart_delay: 1000,
      max_restarts: 20,
      min_uptime: "10s",
      // Logs go to systemLog (MongoDB + SSE), not files
      error_file: "/dev/null",
      out_file: "/dev/null",
      merge_logs: true,
    },
    {
      name: "clientbridge",
      script: "clientBridge/server.js",
      env: { NODE_ENV: "production" },
      instances: 1,
      max_memory_restart: "512M",
      exp_backoff_restart_delay: 1000,
      max_restarts: 20,
      min_uptime: "10s",
      error_file: "/dev/null",
      out_file: "/dev/null",
      merge_logs: true,
    },
    {
      name: "ringbridge",
      script: "ringBridge/server.js",
      env: { NODE_ENV: "production" },
      instances: 1,
      max_memory_restart: "512M",
      exp_backoff_restart_delay: 1000,
      max_restarts: 20,
      min_uptime: "10s",
      error_file: "/dev/null",
      out_file: "/dev/null",
      merge_logs: true,
    },
  ],
};
