const express = require("express");
const fs = require("fs");
const path = require("path");
const hbs = require("handlebars");
const sendEmail = require("../utils/sendEmail");
const {
  authMiddleware,
  requireAdmin,
} = require("../middleware/authMiddleware");
const { sendDailyEmail } = require("../controllers/scheduleController");
const router = express.Router();

// Protect all email routes
router.use(authMiddleware, requireAdmin);

/**
 * Send one-off or bulk emails using Handlebars templates.
 * POST /api/emails/send
 * body: { list: [{email,name,cell,caseNumber,token}], subject, template, domain, attachment }
 */
router.post("/send", async (req, res, next) => {
  try {
    const { list, template } = req.body;
    if (!Array.isArray(list) || !template) {
      return res
        .status(400)
        .json({ message: "Missing required fields: list or template" });
    }
    const domainHostMap = {
      TAG: "taxadvocategroup.com",
      WYNN: "wynntaxsolutions.com",
      AMITY: "amitytaxgroup.com",
    };
    // load & compile the body template from marketingemails/
    const bodyPath = path.join(
      __dirname,
      "../Templates/marketingemails",
      `${template}.hbs`
    );
    if (!fs.existsSync(bodyPath)) {
      return res
        .status(404)
        .json({ message: `Template not found: ${template}` });
    }
    const bodySource = fs.readFileSync(bodyPath, "utf8");
    const bodyTpl = hbs.compile(bodySource);

    const results = await Promise.allSettled(
      list.map(async (recip) => {
        const {
          email,
          name,
          caseNumber,
          token,
          domain,
          senderEmailPrefix,
          senderName,
        } = recip;
        if (!email) {
          throw new Error("Invalid recipient (missing email)");
        }
        if (!["TAG", "WYNN", "AMITY"].includes(domain)) {
          throw new Error(`Invalid domain "${domain}"`);
        }
        const host = domainHostMap[domain];
        const from = `${senderName} <${senderEmailPrefix}@${host}>`;
        // 1) gather per-domain env vars
        const vars = {
          scheduleUrl: process.env[`${domain}_CALENDAR_SCHEDULE_URL`] || "",
          url: process.env[`${domain}_URL`] || "",
          phone: process.env[`${domain}_CLIENT_CONTACT_PHONE`] || "",
          processingEmail: process.env[`${domain}_PROCESSING_EMAIL`] || "",
          logoSrc: process.env[`${domain}_LOGO_URL`] || "",
          contactName: process.env[`${domain}_CONTACT_NAME`] || "",
        };

        // 2) render signature
        const signatureTpl = loadSignatureTpl(domain);
        const signatureHtml = signatureTpl(vars);

        // 3) render body, injecting {{{signature}}}
        const html = bodyTpl({
          name,
          phone: vars.phone,
          signature: signatureHtml,
        });

        // 4) collect attachments for this marketing template
        const atts = [];
        for (const fn of attachmentsMapping[template] || []) {
          const p = path.join(__dirname, "../Templates/attachments", fn);
          if (fs.existsSync(p)) {
            atts.push({ filename: fn, path: p });
          }
        }

        // 5) pick subject (fallback to a generic)
        const subject =
          (emailSubjects[template] && emailSubjects[template].subject) ||
          `Update from ${domain}`;

        // 6) send
        await sendEmail({
          to: email,
          from,
          subject,
          html,
          domain,
          attachments: atts,
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
