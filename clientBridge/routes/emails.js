const express = require("express");
const fs = require("fs");
const path = require("path");
const hbs = require("handlebars");
const sendEmail = require("../../shared/utils/sendEmail");
const {
  authMiddleware,
  requireAdmin,
} = require("../../shared/middleware/authMiddleware");
const { sendDailyEmail } = require("../controllers/scheduleController");
const router = express.Router();
const compileSignatureTpl = require("../libraries/rawSignature");
const emailSubjects = require("../libraries/emailSubjects");

// Protect all email routes
router.use(authMiddleware, requireAdmin);

/**
 * Send one-off or bulk emails using Handlebars templates.
 * POST /api/emails/send
 * body: { list: [{email,name,cell,caseNumber,token}], subject, template, domain, attachment }
 */
router.post("/send", async (req, res, next) => {
  try {
    const { list, baseEmailName, index, domain, includeAttachment } = req.body;

    if (!Array.isArray(list) || !baseEmailName || !index) {
      return res.status(400).json({
        message: "Missing required fields: list, baseEmailName, index",
      });
    }

    const emailIndex = Number(index);
    if (!Number.isInteger(emailIndex) || emailIndex < 1 || emailIndex > 5) {
      return res.status(400).json({ message: "index must be an integer 1–5" });
    }

    // Domain selection (prefer FE passing it; fallback to inference)

    const domainHostMap = {
      TAG: "taxadvocategroup.com",
      WYNN: "wynntaxsolutions.com",
      AMITY: "amitytaxgroup.com",
      TGC: "taxgroupconsultants.com",
    };

    if (!domainHostMap[domain]) {
      return res.status(400).json({ message: `Invalid domain: ${domain}` });
    }
    // Derived names
    const bodyTemplateName = `${baseEmailName}${emailIndex}`; // e.g. TaxOrganizer20261
    const templatesRoot = path.join(__dirname, "..", "Templates");

    // --- Paths (NEW STRUCTURE) ---
    const bodyPath = path.join(
      templatesRoot,
      baseEmailName,
      "handlebars",
      `${bodyTemplateName}.hbs`
    );

    const attachmentPath = path.join(
      templatesRoot,
      baseEmailName,
      "attachments",
      domain,
      "document.pdf"
    );

    const headerPath = path.join(
      templatesRoot,
      baseEmailName,
      "images",
      "header",
      `${bodyTemplateName}.png`
    );

    const logoPath = path.join(templatesRoot, "logos", `${domain}.png`);

    // (Future) Body image folder placeholder:
    // const bodyImagesDir = path.join(templatesRoot, baseEmailName, "images", "body");

    if (!fs.existsSync(bodyPath)) {
      return res
        .status(404)
        .json({ message: `Body template not found: ${bodyPath}` });
    }
    if (!fs.existsSync(attachmentPath)) {
      return res
        .status(404)
        .json({ message: `Attachment not found: ${attachmentPath}` });
    }

    // Compile template once
    const bodySource = fs.readFileSync(bodyPath, "utf8");
    const bodyTpl = hbs.compile(bodySource);

    // --- Subject map (baseEmailName + index) ---
    const subjectMap = {
      TaxOrganizer2026: {
        1: "Welcome to Tax Season — Let’s Get Ready to File 2025",
        2: "Your 2025 Tax Organizer + Quick Document Checklist",
        3: "Time to File — Schedule Your Tax Organizer Review",
        4: "Last Call — Act Now to File Your 2025 Return",
        5: "Action Required — Request an Extension If You’re Not Ready",
      },
      TaxOrganizer2026Prospect: {
        1: "Welcome to Tax Season — Let Us Help You File 2025",
      },
      // add other baseEmailName series here later...
    };

    const defaultSubject = "From Your Tax Attorney's Office";
    const resolvedSubject =
      subjectMap?.[baseEmailName]?.[emailIndex] || defaultSubject;

    // Build attachments (header is optional if file exists)

    const attachments = [];

    if (includeAttachment) {
      if (!fs.existsSync(attachmentPath)) {
        return res
          .status(404)
          .json({ message: `Attachment not found for ${domain}` });
      }
      attachments.push({
        filename: "document.pdf",
        path: attachmentPath,
        contentType: "application/pdf",
      });
    }

    if (fs.existsSync(headerPath)) {
      attachments.push({
        filename: path.basename(headerPath),
        path: headerPath,
        cid: "emailHeader",
      });
    }

    if (fs.existsSync(logoPath)) {
      const logoAttachment = {
        filename: path.basename(logoPath),
        path: logoPath,
        cid: "emailLogo",
      };
      attachments.push(logoAttachment);
    }

    const results = await Promise.allSettled(
      list.map(async (recip) => {
        const { email, name } = recip;

        // per-domain env vars
        const vars = {
          scheduleUrl:
            process.env[`${domain}_CALENDAR_SCHEDULE_URL`] ||
            process.env.TAG_CALENDAR_SCHEDULE_URL,
          url: process.env[`${domain}_URL`] || "",
          phone: baseEmailName.includes("Prospect")
            ? process.env[`${domain}_PROSPECT_CONTACT_PHONE`]
            : process.env[`${domain}_CLIENT_CONTACT_PHONE`] || "",
          processingEmail: process.env[`${domain}_PROCESSING_EMAIL`] || "",
          contactName: process.env[`${domain}_CONTACT_NAME`] || "",
          domainHost: domainHostMap[domain],
        };

        const signatureHtml = compileSignatureTpl(vars);

        const html = bodyTpl({
          name,
          phone: vars.phone,
          processingEmail: vars.processingEmail,
          signature: signatureHtml,
          scheduleUrl: vars.scheduleUrl,
          url: vars.url,
          // extensionLink etc can be added when needed
        });

        const from = `Cameron Pierce @ TaxAdvocateGroup <Cameron@TaxAdvocateGroup.com>`;

        await sendEmail({
          to: email,
          from,
          subject: resolvedSubject,
          html,
          domain,
          attachments,
        });

        return { email, status: "sent" };
      })
    );

    res.json({ results });
  } catch (err) {
    next(err);
  }
});
router.post("/daily", sendDailyEmail);
/**
 * Template management endpoints
 */
// List all templates
router.get("/templates", (req, res) => {
  const files = fs
    .readdirSync(path.join(__dirname, "../Templates"))
    .filter((f) => f.endsWith(".hbs"));
  res.json({ templates: files });
});

// Get a single template
router.get("/templates/:name", (req, res) => {
  const name = req.params.name.endsWith(".hbs")
    ? req.params.name
    : `${req.params.name}.hbs`;
  const filePath = path.join(__dirname, "../Templates", name);
  if (!fs.existsSync(filePath))
    return res.status(404).json({ message: "Not found" });
  res.sendFile(filePath);
});

// Create/update a template (experiments)
router.post("/templates/:name", (req, res) => {
  const content = req.body.content;
  if (typeof content !== "string")
    return res.status(400).json({ message: "Invalid content" });

  const name = req.params.name.endsWith(".hbs")
    ? req.params.name
    : `${req.params.name}.hbs`;
  const filePath = path.join(__dirname, "../Templates", name);
  fs.writeFileSync(filePath, content, "utf8");
  res.json({ message: "Template saved" });
});

// Delete a template
router.delete("/templates/:name", (req, res) => {
  const name = req.params.name.endsWith(".hbs")
    ? req.params.name
    : `${req.params.name}.hbs`;
  const filePath = path.join(__dirname, "../Templates", name);
  if (!fs.existsSync(filePath))
    return res.status(404).json({ message: "Not found" });
  fs.unlinkSync(filePath);
  res.json({ message: "Template deleted" });
});

module.exports = router;
