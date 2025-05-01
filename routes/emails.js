const express = require("express");
const fs = require("fs");
const path = require("path");
const hbs = require("handlebars");
const sendEmail = require("../utils/sendEmail");
const {
  authMiddleware,
  requireAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();

// Protect all email routes
router.use(authMiddleware, requireAdmin);

/**
 * Send one-off or bulk emails using Handlebars templates.
 * POST /api/emails/send
 * body: { list: [{email,name,cell,caseNumber,token}], subject, template, domain, attachment }
 */
router.post("/send", async (req, res, next) => {
  const { list, subject, template, domain, attachment } = req.body;
  if (!Array.isArray(list) || !subject || !template || !domain) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  try {
    // Load and compile template
    const templatePath = path.join(
      __dirname,
      "../Templates",
      `${template}.hbs`
    );
    if (!fs.existsSync(templatePath)) throw new Error("Template not found");
    const source = fs.readFileSync(templatePath, "utf8");
    const compiled = hbs.compile(source);

    // Send to each recipient
    const results = await Promise.allSettled(
      list.map(async (recipient) => {
        const { email, name, cell, caseNumber, token } = recipient;
        if (!email) throw new Error("Invalid recipient");

        // Build scheduler URL
        const baseMap = {
          TAG: "taxadvocategroup.com",
          WYNN: "wynntaxsolutions.com",
          AMITY: "amitytaxgroup.com",
        };
        const host = baseMap[domain] || baseMap.TAG;
        const schedulerUrl = `https://${host}/schedule-my-call/${token}`;

        // Render HTML
        const html = compiled({ name, cell, caseNumber, schedulerUrl });

        // Prepare attachments
        let attachments = [];
        if (
          attachment &&
          fs.existsSync(path.join(__dirname, "../Templates", attachment))
        ) {
          attachments.push({
            filename: attachment,
            path: path.join(__dirname, "../Templates", attachment),
          });
        }

        // Send
        await sendEmail({ to: email, subject, html, domain, attachments });
        return { email, status: "sent" };
      })
    );

    res.json({ results });
  } catch (err) {
    next(err);
  }
});

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
