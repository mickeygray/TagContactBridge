// services/emailService.js
// ─────────────────────────────────────────────────────────────
// Company-aware email service.
//
// Handles:
//   - Prospect welcome chain (5 emails)
//   - Internal lead notification emails
//
// All emails route through the correct SendGrid account
// based on company config.
//
// Usage:
//   const { sendEmail, sendLeadNotificationEmail } = require("./services/emailService");
//   await sendEmail({ email, name, emailIndex: 1, company: "WYNN" });
//   await sendLeadNotificationEmail(source, fields, caseId, meta, outreach, validation, company);
// ─────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const handlebars = require("handlebars");
const { getCompanyConfig } = require("../../shared/config/companyConfig");

// Template cache: { WYNN: { 1: compiledFn, 2: compiledFn, ... }, TAG: { ... } }
const cache = {};

// Email subjects by index
const SUBJECT_BY_INDEX = {
  1: (config, name) => `Welcome to ${config.name}, ${name || "there"}!`,
  2: (config, name) => `${name || "Hi"}, your tax situation deserves a plan`,
  3: (config, name) => `How ${config.name} has helped thousands of clients`,
  4: (config, name) => `${name || "Hi"}, you have more options than you think`,
  5: (config, name) => `${name || "Hi"}, the best time to act is now`,
};

/**
 * Load and cache all templates for a company.
 * Templates live in Templates/{templateDir}/handlebars/ProspectWelcome{1-5}.hbs
 */
function loadTemplates(company) {
  const key = (company || "WYNN").toUpperCase();
  if (cache[key]) return cache[key];

  const config = getCompanyConfig(key);
  const baseDir = path.join(
    __dirname,
    "..",
    "Templates",
    config.templateDir,
    "handlebars",
  );
  cache[key] = {};

  for (let i = 1; i <= 5; i++) {
    const filePath = path.join(baseDir, `ProspectWelcome${i}.hbs`);
    try {
      if (fs.existsSync(filePath)) {
        cache[key][i] = handlebars.compile(fs.readFileSync(filePath, "utf8"));
      }
    } catch (err) {
      console.error(
        `[EMAIL-SVC] Error loading ${key} template #${i}: ${err.message}`,
      );
    }
  }

  const loaded = Object.keys(cache[key]).length;
  console.log(`[EMAIL-SVC] ✓ Loaded ${loaded}/5 templates for ${key}`);

  // Fallback: if TAG templates don't exist yet, use WYNN's
  if (loaded === 0 && key !== "WYNN") {
    console.warn(
      `[EMAIL-SVC] ⚠ No templates for ${key} — falling back to WYNN`,
    );
    return loadTemplates("WYNN");
  }

  return cache[key];
}

/**
 * Get the compiled template for a company and email index.
 * Falls back to template #1 if the requested index doesn't exist.
 */
function getTemplate(company, emailIndex) {
  const templates = loadTemplates(company);
  return templates[emailIndex] || templates[1] || null;
}

/**
 * Get asset paths (logo, PDF) for a company.
 */
function getAssets(company) {
  const config = getCompanyConfig(company);
  const baseDir = path.join(__dirname, "..", "Templates", config.templateDir);
  return {
    logoPath: path.join(baseDir, "images", config.logoFile),
    logoFile: config.logoFile,
    pdfPath: path.join(baseDir, "attachments", config.pdfFile),
    pdfFile: config.pdfFile,
  };
}

/**
 * Create a nodemailer transport for a company.
 */
function getTransport(company) {
  const config = getCompanyConfig(company);
  return nodemailer.createTransport({
    host: process.env.SENDGRID_GATEWAY || "smtp.sendgrid.net",
    port: Number(process.env.SENDGRID_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SENDGRID_USER || "apikey",
      pass: config.sendgridApiKey || process.env.WYNN_API_KEY,
    },
  });
}

/**
 * Send an email from the prospect welcome chain.
 *
 * @param {object} opts
 * @param {string} opts.email          — Recipient email
 * @param {string} opts.name           — Recipient name
 * @param {number} [opts.emailIndex=1] — Which email in the chain (1-5)
 * @param {string} [opts.company="WYNN"] — Company key
 * @returns {{ ok, messageId, error }}
 */
async function sendEmail({ email, name, emailIndex = 1, company = "WYNN" }) {
  if (!email) return { ok: false, error: "No email" };

  const config = getCompanyConfig(company);
  const template = getTemplate(company, emailIndex);

  if (!template) {
    return {
      ok: false,
      error: `No template loaded for ${company} #${emailIndex}`,
    };
  }

  try {
    const html = template({
      name: name || "there",
      scheduleUrl: config.scheduleUrl,
      year: new Date().getFullYear(),
      tollFreePhone: config.tollFreePhone || config.localPhone || "",
      localPhone: config.localPhone || "",
      companyName: config.name,
    });

    const assets = getAssets(company);
    const attachments = [];

    if (fs.existsSync(assets.logoPath)) {
      attachments.push({
        filename: assets.logoFile,
        path: assets.logoPath,
        cid: "emailLogo",
      });
    }

    // PDF only on email #1
    if (emailIndex === 1 && fs.existsSync(assets.pdfPath)) {
      attachments.push({
        filename: assets.pdfFile,
        path: assets.pdfPath,
      });
    }

    const subjectFn = SUBJECT_BY_INDEX[emailIndex] || SUBJECT_BY_INDEX[1];
    const subject = subjectFn(config, name);
    const transport = getTransport(company);

    console.log(`[EMAIL-SVC] Sending #${emailIndex} to ${email} (${company})`);

    const info = await transport.sendMail({
      from: `${config.name} <${config.fromEmail}>`,
      to: email,
      subject,
      html,
      attachments,
    });

    console.log(`[EMAIL-SVC] ✓ Sent #${emailIndex}: ${email} (${company})`);
    return { ok: true, messageId: info?.messageId };
  } catch (err) {
    console.error(
      `[EMAIL-SVC] ✗ Failed #${emailIndex} (${company}): ${err.message}`,
    );
    return { ok: false, error: err.message };
  }
}

/* -------------------------------------------------------------------------- */
/*                  INTERNAL LEAD NOTIFICATION EMAIL                          */
/* -------------------------------------------------------------------------- */

/**
 * Send internal team notification when a new lead comes in.
 * Uses the correct SendGrid account per company.
 *
 * @param {string} source       — Lead source (facebook, tiktok, contact-form, etc.)
 * @param {object} fields       — Lead fields (name, email, phone, city, state, message)
 * @param {number|null} caseId  — Logics CaseID
 * @param {object} meta         — Source metadata
 * @param {object} outreach     — Outreach results { emailResult, smsResult, dialResult }
 * @param {object} validation   — Validation results
 * @param {string} company      — Company key (WYNN, TAG)
 */
async function sendLeadNotificationEmail(
  source,
  fields,
  caseId,
  validation,
  company,
) {
  try {
    const config = getCompanyConfig(company);

    // ── Brand ────────────────────────────────────────────────────────────────
    const brand =
      (company || "WYNN").toUpperCase() === "TAG"
        ? {
            name: "Tax Advocate Group",
            tag: "TAG",
            to: config.toEmail || "inquiry@taxadvocategroup.com",
          }
        : {
            name: "Wynn Tax Solutions",
            tag: "WYNN",
            to: config.toEmail || "inquiry@wynntaxsolutions.com",
          };

    // ── Source label ─────────────────────────────────────────────────────────
    const SOURCE_META = {
      facebook: { emoji: "🔵", label: "Facebook Ad" },
      tiktok: { emoji: "🎵", label: "TikTok Ad" },
      "lead-contact": { emoji: "📞", label: "LD Posting" },
      "ld-posting": { emoji: "📞", label: "LD Posting" },
      "contact-form": { emoji: "🌐", label: `${brand.name} Contact Form` },
      "lead-form": { emoji: "🌐", label: `${brand.name} Landing Page` },
      "state-tax-guide": {
        emoji: "🌐",
        label: `${brand.name} State Tax Guide`,
      },
      "tax-stewart": { emoji: "🤖", label: `${brand.name} Chat Bot` },
      "tax-stewart-verified": {
        emoji: "🤖",
        label: `${brand.name} Chat Bot`,
      },
      test: { emoji: "🧪", label: "Test Lead" },
    };

    const src = SOURCE_META[source] || {
      emoji: "📋",
      label: source || "Unknown",
    };

    // ── Validation summary ────────────────────────────────────────────────────
    const phoneStatus = [
      validation?.phone?.canCall ? "✅ Can Call" : "❌ No Call",
      validation?.phone?.canText ? "✅ Can Text" : "❌ No Text",
      validation?.phone?.status ? `(${validation.phone.status})` : "",
    ]
      .filter(Boolean)
      .join("  ");

    const emailStatus = validation?.email?.canSend
      ? `✅ Valid (${validation.email?.result || "deliverable"})`
      : `❌ Invalid (${validation.email?.result || "unknown"})`;

    const dnc = validation?.phone?.dnc ? "  ⛔ DNC FLAGGED" : "";

    // ── Optional message field ────────────────────────────────────────────────
    const messageBlock = fields.message
      ? `\nNotes / Message:\n  ${fields.message}\n`
      : "";

    // ── Compose ───────────────────────────────────────────────────────────────
    const subject = `${src.emoji} [${brand.tag}] ${src.label} — ${fields.name || "Unknown"} ${caseId ? `| Case #${caseId}` : "| ⚠️ No Case ID"}`;

    const text = `
${src.emoji}  ${src.label.toUpperCase()}  ·  ${brand.name}
${"═".repeat(52)}

  Name:     ${fields.name || "N/A"}
  Phone:    ${fields.phone || "N/A"}${dnc}
  Email:    ${fields.email || "N/A"}
  Location: ${[fields.city, fields.state].filter(Boolean).join(", ") || "N/A"}
${messageBlock}
${"─".repeat(52)}
  IRS Logics Case:  ${caseId || "⚠️ Not created"}
  Source:           ${src.label}
  Brand:            ${brand.name}

${"─".repeat(52)}


${"─".repeat(52)}
VALIDATION

  Phone:  ${phoneStatus}
  Email:  ${emailStatus}

${"═".repeat(52)}
`.trim();

    const transport = getTransport(company);

    await transport.sendMail({
      from: `${brand.name} Leads <${config.alertEmail}>`,
      to: brand.to,
      subject,
      text,
    });

    console.log(`[NOTIFY] ✓ Sent (${src.label} · ${brand.tag})`);
  } catch (err) {
    console.error("[NOTIFY] ✗ Failed:", err.message);
  }
}

module.exports = {
  sendEmail,
  sendLeadNotificationEmail,
  loadTemplates,
  getTemplate,
};
