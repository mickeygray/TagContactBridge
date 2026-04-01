#!/usr/bin/env node
// scripts/smoke-test-backend.js
// ─────────────────────────────────────────────────────────────
// Verifies all require() paths resolve for the v2 structure.
// Run BEFORE starting servers — catches MODULE_NOT_FOUND early.
//
// Usage: node scripts/smoke-test-backend.js
// ─────────────────────────────────────────────────────────────

try { require("dotenv").config(); } catch { /* dotenv not installed yet */ }
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
let pass = 0;
let fail = 0;
const failures = [];

function test(label, fn) {
  try {
    fn();
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } catch (err) {
    fail++;
    const msg = err.code === "MODULE_NOT_FOUND"
      ? `MODULE_NOT_FOUND: ${err.message.split("\n")[0]}`
      : err.message;
    failures.push({ label, msg });
    console.log(`  \x1b[31m✗\x1b[0m ${label}`);
    console.log(`    \x1b[90m${msg}\x1b[0m`);
  }
}

function fileExists(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${rel}`);
}

// ═══════════════════════════════════════════════════════════════
console.log("\n\x1b[36m═══ SHARED ═══\x1b[0m");

test("shared/models/index.js barrel", () => {
  const models = require(path.join(ROOT, "shared/models"));
  const keys = Object.keys(models);
  if (keys.length < 14) throw new Error(`Only ${keys.length} models (expected 14+)`);
});

test("shared/config/companyConfig.js", () => {
  const { getCompanyConfig, COMPANIES } = require(path.join(ROOT, "shared/config/companyConfig"));
  if (!COMPANIES.TAG) throw new Error("TAG missing");
  if (!COMPANIES.WYNN) throw new Error("WYNN missing");
  getCompanyConfig("TAG");
});

test("shared/config/db.js", () => require(path.join(ROOT, "shared/config/db")));
test("shared/config/dbHealth.js", () => require(path.join(ROOT, "shared/config/dbHealth")));
test("shared/services/aiService.js", () => {
  const ai = require(path.join(ROOT, "shared/services/aiService"));
  if (!ai.claudeComplete) throw new Error("claudeComplete missing");
  if (!ai.claudeJSON) throw new Error("claudeJSON missing");
  if (!ai.whisperTranscribe) throw new Error("whisperTranscribe missing");
});
test("shared/services/logicsService.js", () => require(path.join(ROOT, "shared/services/logicsService")));
test("shared/services/validationService.js", () => require(path.join(ROOT, "shared/services/validationService")));
test("shared/services/callRailService.js", () => require(path.join(ROOT, "shared/services/callRailService")));
test("shared/utils/sendEmail.js", () => require(path.join(ROOT, "shared/utils/sendEmail")));
test("shared/utils/sendTextMessage.js", () => require(path.join(ROOT, "shared/utils/sendTextMessage")));
test("shared/utils/deactivateLead.js", () => require(path.join(ROOT, "shared/utils/deactivateLead")));
test("shared/utils/systemLog.js", () => require(path.join(ROOT, "shared/utils/systemLog")));
test("shared/utils/processGuard.js", () => require(path.join(ROOT, "shared/utils/processGuard")));
test("shared/middleware/authMiddleware.js", () => {
  const { authMiddleware, requireAdmin, ADMIN_USER } = require(path.join(ROOT, "shared/middleware/authMiddleware"));
  if (typeof authMiddleware !== "function") throw new Error("authMiddleware not a function");
});

// ═══════════════════════════════════════════════════════════════
console.log("\n\x1b[32m═══ LEADBRIDGE ═══\x1b[0m");

const LB = path.join(ROOT, "leadBridge");
test("leadBridge/server.js requires", () => {
  // Don't actually start it — just check top-level requires
  const src = fs.readFileSync(path.join(LB, "server.js"), "utf8");
  const requires = src.match(/require\(["']([^"']+)["']\)/g) || [];
  for (const req of requires) {
    const mod = req.match(/require\(["']([^"']+)["']\)/)[1];
    if (mod.startsWith(".")) {
      const resolved = path.resolve(LB, mod);
      const candidates = [resolved, resolved + ".js", resolved + "/index.js"];
      if (!candidates.some(fs.existsSync)) throw new Error(`Broken: ${mod} from server.js`);
    }
  }
});

const lbServices = [
  "cadenceEngine", "connectionChecker", "statusChecker", "day0DialerService",
  "phoneBurnerService", "dropRVMService", "emailService", "smsContent",
  "facebookMessenger", "instagramService", "tiktokService", "tiktokAuthService",
  "tiktokCommentService", "qualificationQuestions", "deployService", "loginPanel",
];
for (const svc of lbServices) {
  test(`leadBridge/services/${svc}.js exists`, () => fileExists(`leadBridge/services/${svc}.js`));
}

test("leadBridge Templates exist", () => {
  fileExists("leadBridge/Templates/TAG/ProspectWelcome/handlebars/ProspectWelcome1.hbs");
  fileExists("leadBridge/Templates/WYNN/ProspectWelcome/handlebars/ProspectWelcome1.hbs");
});

// ═══════════════════════════════════════════════════════════════
console.log("\n\x1b[36m═══ CLIENTBRIDGE ═══\x1b[0m");

const CB = path.join(ROOT, "clientBridge");
test("clientBridge/server.js requires", () => {
  const src = fs.readFileSync(path.join(CB, "server.js"), "utf8");
  const requires = src.match(/require\(["']([^"']+)["']\)/g) || [];
  for (const req of requires) {
    const mod = req.match(/require\(["']([^"']+)["']\)/)[1];
    if (mod.startsWith(".")) {
      const resolved = path.resolve(CB, mod);
      const candidates = [resolved, resolved + ".js", resolved + "/index.js"];
      if (!candidates.some(fs.existsSync)) throw new Error(`Broken: ${mod} from server.js`);
    }
  }
});

const cbRoutes = ["auth", "admin", "cleaner", "clients", "emails", "invite", "list", "recording", "schedule", "sms", "texts", "templates", "metrics"];
for (const route of cbRoutes) {
  test(`clientBridge/routes/${route}.js exists`, () => fileExists(`clientBridge/routes/${route}.js`));
}

const cbControllers = ["clientController", "listCleanerController", "listController", "scheduleController", "smsController"];
for (const ctrl of cbControllers) {
  test(`clientBridge/controllers/${ctrl}.js exists`, () => fileExists(`clientBridge/controllers/${ctrl}.js`));
}

test("clientBridge/services/smsService.js", () => fileExists("clientBridge/services/smsService.js"));
test("clientBridge/services/metricsService.js", () => fileExists("clientBridge/services/metricsService.js"));
test("clientBridge/client/build/index.html", () => fileExists("clientBridge/client/build/index.html"));

// ═══════════════════════════════════════════════════════════════
console.log("\n\x1b[33m═══ RINGBRIDGE ═══\x1b[0m");

const RB = path.join(ROOT, "ringBridge");
test("ringBridge/server.js requires", () => {
  const src = fs.readFileSync(path.join(RB, "server.js"), "utf8");
  const requires = src.match(/require\(["']([^"']+)["']\)/g) || [];
  for (const req of requires) {
    const mod = req.match(/require\(["']([^"']+)["']\)/)[1];
    if (mod.startsWith(".")) {
      const resolved = path.resolve(RB, mod);
      const candidates = [resolved, resolved + ".js", resolved + "/index.js"];
      if (!candidates.some(fs.existsSync)) throw new Error(`Broken: ${mod} from server.js`);
    }
  }
});

const rbServices = ["rcAuthService", "webhookManager", "logicsLookupService", "transcriptionService", "dailyReportService", "presencePoller"];
for (const svc of rbServices) {
  test(`ringBridge/services/${svc}.js exists`, () => fileExists(`ringBridge/services/${svc}.js`));
}

// CX scaffolding (unmounted but files should exist)
test("ringBridge/cx/services/cxAuthService.js", () => fileExists("ringBridge/cx/services/cxAuthService.js"));
test("ringBridge/cx/services/cxAgentBridge.js", () => fileExists("ringBridge/cx/services/cxAgentBridge.js"));
test("ringBridge/cx/services/cxDispositionService.js", () => fileExists("ringBridge/cx/services/cxDispositionService.js"));
test("ringBridge/cx/services/cxEventListener.js", () => fileExists("ringBridge/cx/services/cxEventListener.js"));
test("ringBridge/cx/routes/cxRoutes.js", () => fileExists("ringBridge/cx/routes/cxRoutes.js"));

// ═══════════════════════════════════════════════════════════════
console.log("\n\x1b[35m═══ REACT CLIENT ═══\x1b[0m");

const CLIENT = path.join(CB, "client/src");

const hooks = ["useAuth", "useEmail", "useText", "useSms", "useClients", "useList", "useSchedule", "useDailySchedule", "useAdmin", "useToast", "useMetrics", "useSystemLog", "useCxAgent"];
for (const hook of hooks) {
  test(`hooks/${hook}.js`, () => fileExists(`clientBridge/client/src/hooks/${hook}.js`));
}

const styles = ["variables.css", "reset.css", "base.css", "layout.css", "components.css", "utilities.css", "index.css"];
for (const s of styles) {
  test(`styles/${s}`, () => fileExists(`clientBridge/client/src/styles/${s}`));
}

test("App.js", () => fileExists("clientBridge/client/src/App.js"));
test("utils/api.js", () => fileExists("clientBridge/client/src/utils/api.js"));
test("utils/toast.js", () => fileExists("clientBridge/client/src/utils/toast.js"));
test("utils/PrivateRoute.js", () => fileExists("clientBridge/client/src/utils/PrivateRoute.js"));
test("Login component", () => fileExists("clientBridge/client/src/components/auth/Login.js"));
test("AgentDashboard", () => fileExists("clientBridge/client/src/components/interface/AgentDashboard.js"));
test("MetricsDashboard", () => fileExists("clientBridge/client/src/components/clientBridge/metrics/MetricsDashboard.js"));
test("SystemDebugPanel", () => fileExists("clientBridge/client/src/components/clientBridge/debug/SystemDebugPanel.js"));
test("AgentWidget", () => fileExists("clientBridge/client/src/components/ringBridge/cx/AgentWidget.js"));
test("MessagingHub", () => fileExists("clientBridge/client/src/components/clientBridge/messaging/MessagingHub.js"));
test("TemplateStudio", () => fileExists("clientBridge/client/src/components/clientBridge/messaging/TemplateStudio.js"));
test("No context/ directory", () => {
  if (fs.existsSync(path.join(CLIENT, "context"))) throw new Error("context/ still exists — should be deleted");
});

// ═══════════════════════════════════════════════════════════════
console.log("\n\x1b[36m═══ CONFIG FILES ═══\x1b[0m");

test("package.json scripts", () => {
  const pkg = require(path.join(ROOT, "package.json"));
  const required = ["leadbridge", "clientbridge", "ringbridge", "dev", "pm2:start", "client:build"];
  for (const s of required) {
    if (!pkg.scripts[s]) throw new Error(`Missing script: ${s}`);
  }
});

test("ecosystem.config.js", () => {
  const eco = require(path.join(ROOT, "ecosystem.config.js"));
  if (!eco.apps || eco.apps.length !== 3) throw new Error(`Expected 3 apps, got ${eco.apps?.length}`);
});

test("ARCHITECTURE.md", () => fileExists("ARCHITECTURE.md"));

// ═══════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(50));
console.log(`\x1b[${fail > 0 ? "31" : "32"}m  ${pass} passed, ${fail} failed\x1b[0m`);

if (failures.length > 0) {
  console.log("\n\x1b[31mFailures:\x1b[0m");
  for (const f of failures) {
    console.log(`  ${f.label}: ${f.msg}`);
  }
}

console.log("");
process.exit(fail > 0 ? 1 : 0);
