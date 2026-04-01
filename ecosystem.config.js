// ecosystem.config.js — PM2 process configuration
// Usage: pm2 start ecosystem.config.js

module.exports = {
  apps: [
    {
      name: "leadbridge",
      script: "leadBridge/server.js",
      env: { NODE_ENV: "production" },
      instances: 1,
      max_memory_restart: "512M",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
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
      log_date_format: "YYYY-MM-DD HH:mm:ss",
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
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "/dev/null",
      out_file: "/dev/null",
      merge_logs: true,
    },
  ],
};
