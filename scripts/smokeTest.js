// scripts/smokeTest.js
// ─────────────────────────────────────────────────────────────
// Smoke test — validates every major service and route handler
// without firing live calls, texts, or RVMs.
//
// Checks:
//   1. Company resolution (FB, TT, payload)
//   2. Template files exist per brand
//   3. Asset files exist (logo, PDF) per brand
//   4. Email transport can connect (SMTP verify)
//   5. CallRail API reachable per brand
//   6. Drop.co campaign tokens valid per brand
//   7. MongoDB connection
//   8. RingCentral auth status
//   9. Audio files exist per brand
//  10. Pipeline dry-run (company resolution + template cache)
//
// Run from project root:
//   node scripts/smokeTest.js
// ─────────────────────────────────────────────────────────────

require("dotenv").config();
const fs = require("fs");
const path = require("path");

// ── Result tracking ──
const results = [];
let passed = 0;
let failed = 0;
let warned = 0;

function pass(section, label, detail = "") {
  passed++;
  results.push({ status: "✓", section, label, detail });
  console.log(`  ✓  ${label}${detail ? `  →  ${detail}` : ""}`);
}

function fail(section, label, detail = "") {
  failed++;
  results.push({ status: "✗", section, label, detail });
  console.log(`  ✗  ${label}${detail ? `  →  ${detail}` : ""}`);
}

function warn(section, label, detail = "") {
  warned++;
  results.push({ status: "○", section, label, detail });
  console.log(`  ○  ${label}${detail ? `  →  ${detail}` : ""}`);
}

function section(title) {
  console.log(`\n── ${title} ${"─".repeat(50 - title.length)}`);
}

// ════════════════════════════════════════════════════════════
// 1. COMPANY CONFIG
// ════════════════════════════════════════════════════════════
async function testCompanyConfig() {
  section("1. COMPANY CONFIG");

  let companyConfig;
  try {
    companyConfig = require("../config/companyConfig");
    pass("config", "config/companyConfig.js loaded");
  } catch (err) {
    fail("config", "config/companyConfig.js failed to load", err.message);
    return;
  }

  const {
    getCompanyConfig,
    resolveCompanyFromFbPageId,
    resolveCompanyFromTtAdvertiserId,
    resolveCompanyFromPayload,
    COMPANIES,
  } = companyConfig;

  // Company keys
  const keys = Object.keys(COMPANIES);
  pass("config", `Companies defined: ${keys.join(", ")}`);

  // getCompanyConfig
  for (const key of keys) {
    const config = getCompanyConfig(key);
    if (config.key === key) {
      pass("config", `getCompanyConfig("${key}")`, `name=${config.name}`);
    } else {
      fail("config", `getCompanyConfig("${key}")`, `returned ${config.key}`);
    }
  }

  // Case insensitivity
  const lower = getCompanyConfig("wynn");
  lower.key === "WYNN"
    ? pass("config", "getCompanyConfig is case-insensitive")
    : fail("config", "getCompanyConfig case-insensitive failed");

  // FB resolution
  const wynnFbId = process.env.WYNN_FB_PAGE_ID;
  const tagFbId = process.env.TAG_FB_PAGE_ID;
  if (wynnFbId) {
    const resolved = resolveCompanyFromFbPageId(wynnFbId);
    resolved === "WYNN"
      ? pass("config", "FB page_id → WYNN", wynnFbId)
      : fail("config", "FB page_id → WYNN failed", `got ${resolved}`);
  } else {
    warn("config", "WYNN_FB_PAGE_ID not set — FB resolution untested");
  }
  if (tagFbId) {
    const resolved = resolveCompanyFromFbPageId(tagFbId);
    resolved === "TAG"
      ? pass("config", "FB page_id → TAG", tagFbId)
      : fail("config", "FB page_id → TAG failed", `got ${resolved}`);
  } else {
    warn("config", "TAG_FB_PAGE_ID not set — FB resolution untested");
  }

  // Payload resolution
  const wynnPayload = resolveCompanyFromPayload({ company: "WYNN" }, {});
  wynnPayload === "WYNN"
    ? pass("config", "Payload company field → WYNN")
    : fail("config", "Payload company field resolution failed");

  const tagReferer = resolveCompanyFromPayload(
    {},
    { referer: "https://taxadvocategroup.com/form" },
  );
  tagReferer === "TAG"
    ? pass("config", "Referer taxadvocategroup.com → TAG")
    : fail("config", "Referer resolution failed", `got ${tagReferer}`);

  const wynnReferer = resolveCompanyFromPayload(
    {},
    { referer: "https://wynntaxsolutions.com/form" },
  );
  wynnReferer === "WYNN"
    ? pass("config", "Referer wynntaxsolutions.com → WYNN")
    : fail("config", "Referer resolution failed", `got ${wynnReferer}`);
}

// ════════════════════════════════════════════════════════════
// 2. TEMPLATE & ASSET FILES
// ════════════════════════════════════════════════════════════
async function testTemplateFiles() {
  section("2. TEMPLATE & ASSET FILES");

  const { getCompanyConfig } = require("../config/companyConfig");

  for (const company of ["WYNN", "TAG"]) {
    const config = getCompanyConfig(company);
    const baseDir = path.join(__dirname, "..", "Templates", config.templateDir);

    console.log(`\n  [${company}] baseDir: Templates/${config.templateDir}`);

    // HBS templates
    for (let i = 1; i <= 5; i++) {
      const filePath = path.join(
        baseDir,
        "handlebars",
        `ProspectWelcome${i}.hbs`,
      );
      const rel = path.relative(path.join(__dirname, ".."), filePath);
      fs.existsSync(filePath)
        ? pass("templates", `${company} ProspectWelcome${i}.hbs`, rel)
        : fail("templates", `${company} ProspectWelcome${i}.hbs MISSING`, rel);
    }

    // Logo
    const logoPath = path.join(baseDir, "images", config.logoFile);
    const logoRel = path.relative(path.join(__dirname, ".."), logoPath);
    fs.existsSync(logoPath)
      ? pass("templates", `${company} logo: ${config.logoFile}`, logoRel)
      : fail(
          "templates",
          `${company} logo MISSING: ${config.logoFile}`,
          logoRel,
        );

    // PDF
    const pdfPath = path.join(baseDir, "attachments", config.pdfFile);
    const pdfRel = path.relative(path.join(__dirname, ".."), pdfPath);
    fs.existsSync(pdfPath)
      ? pass("templates", `${company} PDF: ${config.pdfFile}`, pdfRel)
      : fail("templates", `${company} PDF MISSING: ${config.pdfFile}`, pdfRel);
  }
}

// ════════════════════════════════════════════════════════════
// 3. AUDIO FILES
// ════════════════════════════════════════════════════════════
async function testAudioFiles() {
  section("3. AUDIO FILES");

  const { getCompanyConfig } = require("../config/companyConfig");
  const audioNames = [
    "rvm-1-intro.wav",
    "rvm-2-qualify.wav",
    "rvm-3-followup.wav",
    "rvm-4-urgency.wav",
  ];

  for (const company of ["WYNN", "TAG"]) {
    const config = getCompanyConfig(company);
    const audioDir = path.join(__dirname, "..", "audio", config.rvmAudioDir);

    console.log(`\n  [${company}] audioDir: audio/${config.rvmAudioDir}`);

    if (!fs.existsSync(audioDir)) {
      fail("audio", `${company} audio dir missing`, audioDir);
      continue;
    }

    for (const name of audioNames) {
      const filePath = path.join(audioDir, name);
      const rel = path.relative(path.join(__dirname, ".."), filePath);
      fs.existsSync(filePath)
        ? pass("audio", `${company} ${name}`, rel)
        : fail("audio", `${company} ${name} MISSING`, rel);
    }
  }
}

// ════════════════════════════════════════════════════════════
// 4. EMAIL TRANSPORT
// ════════════════════════════════════════════════════════════
async function testEmailTransport() {
  section("4. EMAIL TRANSPORT");

  const { getCompanyConfig } = require("../config/companyConfig");
  const nodemailer = require("nodemailer");

  for (const company of ["WYNN", "TAG"]) {
    const config = getCompanyConfig(company);

    if (!config.sendgridApiKey) {
      fail("email", `${company} SendGrid API key missing`);
      continue;
    }

    const transport = nodemailer.createTransport({
      host: process.env.SENDGRID_GATEWAY || "smtp.sendgrid.net",
      port: Number(process.env.SENDGRID_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SENDGRID_USER || "apikey",
        pass: config.sendgridApiKey,
      },
    });

    try {
      await transport.verify();
      pass(
        "email",
        `${company} SMTP transport verified`,
        "smtp.sendgrid.net:587",
      );
    } catch (err) {
      fail("email", `${company} SMTP transport failed`, err.message);
    }
  }
}

// ════════════════════════════════════════════════════════════
// 5. CALLRAIL API
// ════════════════════════════════════════════════════════════
async function testCallRail() {
  section("5. CALLRAIL API");

  const { getCompanyConfig } = require("../config/companyConfig");
  const axios = require("axios");

  for (const company of ["WYNN", "TAG"]) {
    const config = getCompanyConfig(company);

    if (!config.callrailAccountId || !config.callrailKey) {
      warn("callrail", `${company} CallRail credentials not set — skipping`);
      continue;
    }

    try {
      await axios.get(
        `https://api.callrail.com/v3/a/${config.callrailAccountId}/text-messages.json?per_page=1`,
        {
          headers: { Authorization: `Token token=${config.callrailKey}` },
          timeout: 8000,
        },
      );
      pass(
        "callrail",
        `${company} CallRail API reachable`,
        `account=${config.callrailAccountId}`,
      );
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) {
        pass(
          "callrail",
          `${company} CallRail API reachable`,
          `HTTP 404 — account exists, no messages`,
        );
      } else {
        fail(
          "callrail",
          `${company} CallRail API failed`,
          err.response?.data?.error || err.message,
        );
      }
    }
  }
}

// ════════════════════════════════════════════════════════════
// 6. DROP.CO CAMPAIGN TOKENS
// ════════════════════════════════════════════════════════════
async function testDropCo() {
  section("6. DROP.CO CAMPAIGN TOKENS");

  const { getCompanyConfig } = require("../config/companyConfig");
  const axios = require("axios");

  for (const company of ["WYNN", "TAG"]) {
    const config = getCompanyConfig(company);

    if (!config.dropApiKey) {
      warn("drop", `${company} dropApiKey not set — skipping`);
      continue;
    }

    if (!config.dropCampaignToken) {
      warn("drop", `${company} dropCampaignToken not set — skipping`);
      continue;
    }

    try {
      // Use PhoneTo=0000000000 as a dummy — Drop.co validates the token
      // before it ever tries to queue the number
      await axios.get(`https://customerapi.drop.co/delivery/`, {
        params: {
          ApiKey: config.dropApiKey,
          CampaignToken: config.dropCampaignToken,
          PhoneTo: "0000000000",
          AllowDuplicates: false,
        },
        timeout: 8000,
      });
      pass(
        "drop",
        `${company} Drop.co campaign valid`,
        `token=${config.dropCampaignToken.slice(0, 8)}...`,
      );
    } catch (err) {
      const status = err.response?.status;
      if (status === 401) {
        fail(
          "drop",
          `${company} Drop.co auth failed (401)`,
          "check dropApiKey",
        );
      } else if (status === 404) {
        fail(
          "drop",
          `${company} Drop.co campaign not found (404)`,
          config.dropCampaignToken,
        );
      } else if (status === 400) {
        // 400 means the token is valid but the dummy phone was rejected — that's fine
        pass(
          "drop",
          `${company} Drop.co campaign valid`,
          `token=${config.dropCampaignToken.slice(0, 8)}... (400 = token OK, dummy phone rejected)`,
        );
      } else {
        fail("drop", `${company} Drop.co API error`, err.message);
      }
    }
  }
}

// ════════════════════════════════════════════════════════════
// 7. MONGODB
// ════════════════════════════════════════════════════════════
async function testMongoDB() {
  section("7. MONGODB");

  try {
    const connectDB = require("../config/db");
    await connectDB();
    pass("mongo", "MongoDB connected", "config/db.js");

    const LeadCadence = require("../models/LeadCadence");
    const count = await LeadCadence.countDocuments({ active: true });
    pass("mongo", "LeadCadence model accessible", `active leads: ${count}`);
  } catch (err) {
    fail("mongo", "MongoDB connection failed", err.message);
  }
}

// ════════════════════════════════════════════════════════════
// 8. RINGCENTRAL AUTH
// ════════════════════════════════════════════════════════════
async function testRingCentral() {
  section("8. RINGCENTRAL AUTH");

  if (!process.env.RING_CENTRAL_JWT_TOKEN) {
    warn("rc", "RING_CENTRAL_JWT_TOKEN not set — skipping RC auth test");
    return;
  }

  try {
    const { warmup, getAuthStatus } = require("../services/ringCentralService");
    await warmup(0); // one-shot auth, no refresh interval
    const { isAuthenticated } = getAuthStatus();

    isAuthenticated
      ? pass(
          "rc",
          "RingCentral authenticated",
          "services/ringCentralService.js",
        )
      : fail("rc", "RingCentral auth failed", "check RC credentials in .env");
  } catch (err) {
    fail("rc", "RingCentral service error", err.message);
  }
}

// ════════════════════════════════════════════════════════════
// 9. PIPELINE DRY RUN
// ════════════════════════════════════════════════════════════
async function testPipelineDryRun() {
  section("9. PIPELINE DRY RUN");

  const {
    resolveCompanyFromPayload,
    resolveCompanyFromFbPageId,
    resolveCompanyFromTtAdvertiserId,
  } = require("../config/companyConfig");

  const scenarios = [
    {
      label: "/lead-contact  (WYNN referer)",
      company: resolveCompanyFromPayload(
        {},
        { referer: "https://wynntaxsolutions.com/form" },
      ),
      expected: "WYNN",
    },
    {
      label: "/lead-contact  (TAG referer)",
      company: resolveCompanyFromPayload(
        {},
        { referer: "https://taxadvocategroup.com/form" },
      ),
      expected: "TAG",
    },
    {
      label: "/lead-contact  (explicit company=WYNN)",
      company: resolveCompanyFromPayload({ company: "WYNN" }, {}),
      expected: "WYNN",
    },
    {
      label: "/lead-contact  (explicit company=TAG)",
      company: resolveCompanyFromPayload({ company: "TAG" }, {}),
      expected: "TAG",
    },
    {
      label: "/lead-contact  (no hints → default WYNN)",
      company: resolveCompanyFromPayload({}, {}),
      expected: "WYNN",
    },
    {
      label: "/fb/webhook    (unknown page_id → default WYNN)",
      company: resolveCompanyFromFbPageId("unknown_page_999"),
      expected: "WYNN",
    },
    {
      label: "/tt/webhook    (unknown advertiser_id → default WYNN)",
      company: resolveCompanyFromTtAdvertiserId("unknown_adv_999"),
      expected: "WYNN",
    },
  ];

  for (const s of scenarios) {
    s.company === s.expected
      ? pass("pipeline", s.label, `resolved → ${s.company}`)
      : fail("pipeline", s.label, `expected ${s.expected}, got ${s.company}`);
  }

  // emailService load + template cache warm
  try {
    const { sendEmail, loadTemplates } = require("../services/emailService");
    pass("pipeline", "services/emailService.js loaded");

    for (const company of ["WYNN", "TAG"]) {
      try {
        const templates = loadTemplates(company);
        const count = Object.keys(templates).length;
        count > 0
          ? pass(
              "pipeline",
              `${company} email templates cached`,
              `${count}/5 loaded`,
            )
          : warn(
              "pipeline",
              `${company} email templates empty`,
              "check Templates folder",
            );
      } catch (err) {
        fail("pipeline", `${company} template load error`, err.message);
      }
    }
  } catch (err) {
    fail("pipeline", "services/emailService.js failed to load", err.message);
  }
}

// ════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════
async function main() {
  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║         SMOKE TEST — tagcontactbridge                  ║");
  console.log(
    `║         ${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }).padEnd(46)}║`,
  );
  console.log("╚════════════════════════════════════════════════════════╝");

  await testCompanyConfig();
  await testTemplateFiles();
  await testAudioFiles();
  await testEmailTransport();
  await testCallRail();
  await testDropCo();
  await testMongoDB();
  await testRingCentral();
  await testPipelineDryRun();

  // ── Summary ──
  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log(
    `║  ✓ Passed: ${String(passed).padEnd(5)} ✗ Failed: ${String(failed).padEnd(5)} ○ Warned: ${String(warned).padEnd(5)}    ║`,
  );
  console.log("╚════════════════════════════════════════════════════════╝");

  if (failed > 0) {
    console.log("\n🚨 FAILURES:");
    results
      .filter((r) => r.status === "✗")
      .forEach((r) =>
        console.log(
          `   [${r.section}] ${r.label}${r.detail ? ` — ${r.detail}` : ""}`,
        ),
      );
  }

  if (warned > 0) {
    console.log("\n⚠  WARNINGS:");
    results
      .filter((r) => r.status === "○")
      .forEach((r) =>
        console.log(
          `   [${r.section}] ${r.label}${r.detail ? ` — ${r.detail}` : ""}`,
        ),
      );
  }

  if (failed === 0) {
    console.log("\n✅  All checks passed!\n");
  } else {
    console.log("\n");
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\n[SMOKE TEST] Unhandled error:", err.message);
  process.exit(1);
});
