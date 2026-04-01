#!/usr/bin/env node
// scripts/smoke-test-live.js
// ─────────────────────────────────────────────────────────────
// Hits every endpoint on running servers to verify they respond.
// Run AFTER servers are up: npm run dev, then node scripts/smoke-test-live.js
//
// Requires: servers running on ports 4000, 5000, 6000
// ─────────────────────────────────────────────────────────────

const http = require("http");

const PORTS = {
  leadBridge: 4000,
  clientBridge: 5000,
  ringBridge: 6000,
};

let pass = 0;
let fail = 0;

async function req(method, port, path, { body, expect = 200, label, allowStatus } = {}) {
  const name = label || `${method} :${port}${path}`;
  return new Promise((resolve) => {
    const opts = {
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers: { "Content-Type": "application/json" },
      timeout: 5000,
    };

    const request = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const ok = res.statusCode === expect || (allowStatus && allowStatus.includes(res.statusCode));
        if (ok) {
          pass++;
          console.log(`  \x1b[32m✓\x1b[0m ${name} → ${res.statusCode}`);
        } else {
          fail++;
          console.log(`  \x1b[31m✗\x1b[0m ${name} → ${res.statusCode} (expected ${expect})`);
          if (data.length < 200) console.log(`    \x1b[90m${data}\x1b[0m`);
        }
        resolve();
      });
    });

    request.on("error", (err) => {
      fail++;
      console.log(`  \x1b[31m✗\x1b[0m ${name} → ${err.code || err.message}`);
      resolve();
    });

    request.on("timeout", () => {
      fail++;
      console.log(`  \x1b[31m✗\x1b[0m ${name} → TIMEOUT`);
      request.destroy();
      resolve();
    });

    if (body) request.write(JSON.stringify(body));
    request.end();
  });
}

async function run() {
  console.log("\n\x1b[36m═══ HEALTH CHECKS ═══\x1b[0m");
  await req("GET", 4000, "/health", { label: "leadBridge health" });
  await req("GET", 5000, "/health", { label: "clientBridge health" });
  await req("GET", 6000, "/health", { label: "ringBridge health" });

  console.log("\n\x1b[32m═══ LEADBRIDGE :4000 ═══\x1b[0m");
  await req("GET", 4000, "/status", { label: "LB status" });
  await req("GET", 4000, "/drop-balance", { allowStatus: [200, 500], label: "LB drop balance" });

  console.log("\n\x1b[36m═══ CLIENTBRIDGE :5000 — AUTH ═══\x1b[0m");
  await req("GET", 5000, "/api/auth/me", { expect: 401, label: "CB auth/me (no cookie → 401)" });
  await req("GET", 5000, "/api/auth/allowed-emails", { label: "CB allowed-emails" });
  await req("GET", 5000, "/auth-check", { expect: 401, label: "CB auth-check (no cookie → 401)" });

  console.log("\n\x1b[36m═══ CLIENTBRIDGE :5000 — API (unauthed → 401) ═══\x1b[0m");
  await req("GET", 5000, "/api/admin/consent-records", { expect: 401, label: "CB admin (gated)" });
  await req("GET", 5000, "/api/sms/conversations", { expect: 401, label: "CB SMS (gated)" });
  await req("GET", 5000, "/api/metrics/snapshot", { expect: 401, label: "CB metrics (gated)" });
  await req("GET", 5000, "/api/logs", { expect: 401, label: "CB logs (gated)" });
  await req("GET", 5000, "/api/logs/stats", { expect: 401, label: "CB log stats (gated)" });

  console.log("\n\x1b[36m═══ CLIENTBRIDGE :5000 — SCHEDULE STUBS (410 Gone) ═══\x1b[0m");
  await req("GET", 5000, "/api/schedule/wynn-leads", { expect: 410, label: "CB callfire wynn (deprecated)" });
  await req("GET", 5000, "/api/schedule/tag-leads", { expect: 410, label: "CB callfire tag (deprecated)" });

  console.log("\n\x1b[36m═══ CLIENTBRIDGE :5000 — STATIC ═══\x1b[0m");
  await req("GET", 5000, "/", { label: "CB serves React index.html" });
  await req("GET", 5000, "/dashboard", { label: "CB React catch-all" });
  await req("GET", 5000, "/login", { label: "CB React /login route" });
  await req("GET", 5000, "/agent", { label: "CB React /agent route" });

  console.log("\n\x1b[33m═══ RINGBRIDGE :6000 ═══\x1b[0m");
  await req("GET", 6000, "/api/health", { label: "RB API health" });
  await req("GET", 6000, "/health", { label: "RB process health" });

  console.log("\n\x1b[35m═══ CROSS-BRIDGE RELAY ═══\x1b[0m");
  // SMS inbound relay: leadBridge :4000 → clientBridge :5000
  await req("POST", 5000, "/sms/inbound", {
    body: { tracking_number: "0000000000", customer_phone_number: "0000000000", content: "test" },
    allowStatus: [200, 400, 500],
    label: "CB SMS inbound endpoint responds",
  });

  // ═══════════════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(50));
  console.log(`\x1b[${fail > 0 ? "31" : "32"}m  ${pass} passed, ${fail} failed\x1b[0m\n`);

  if (fail > 0) {
    console.log("\x1b[33mNote: Some failures may be expected if:\x1b[0m");
    console.log("  - MongoDB is not connected (health checks return 503)");
    console.log("  - External APIs not configured (Drop.co, CallRail)");
    console.log("  - Auth routes return 401 without a session cookie (expected)");
    console.log("");
  }

  process.exit(fail > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
