const express = require("express");
const router = express.Router();
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const hbs = require("handlebars");

// Configure SendGrid SMTP
const transporter = nodemailer.createTransport({
  host: "smtp.sendgrid.net", // SendGrid SMTP Server
  port: 587, // Use 587 for TLS (recommended)
  secure: false, // False for TLS, True for SSL (port 465)
  auth: {
    user: "apikey", // SendGrid requires "apikey" as the username
    pass: process.env.TAXAD_API_KEY, // Use API key as the password
  },
});

const transporter2 = nodemailer.createTransport({
  host: "smtp.sendgrid.net", // SendGrid SMTP Server
  port: 587, // Use 587 for TLS (recommended)
  secure: false, // False for TLS, True for SSL (port 465)
  auth: {
    user: "apikey", // SendGrid requires "apikey" as the username
    pass: process.env.WYNN_API_KEY, // Use API key as the password
  },
});

const transporter3 = nodemailer.createTransport({
  host: "smtp.sendgrid.net", // SendGrid SMTP Server
  port: 587, // Use 587 for TLS (recommended)
  secure: false, // False for TLS, True for SSL (port 465)
  auth: {
    user: "apikey", // SendGrid requires "apikey" as the username
    pass: process.env.AMITY_API_KEY, // Use API key as the password
  },
});

// Read and compile the Handlebars template

router.post("/taxadvocate", async (req, res) => {
  const { subject, attachment, template, list } = req.body;

  if (!list || !Array.isArray(list) || !subject || !template) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid input data." });
  }

  try {
    const templatePath = path.join(
      __dirname,
      "../Templates",
      `${template}.hbs`
    );
    const attachmentPath =
      attachment !== "none"
        ? path.join(__dirname, "../Templates", attachment)
        : null;

    if (!fs.existsSync(templatePath)) {
      console.error(`Template not found: ${templatePath}`);
      return res
        .status(400)
        .json({ success: false, message: "Template file missing." });
    }

    const source = fs.readFileSync(templatePath, "utf8");
    const compiledTemplate = hbs.compile(source);

    for (const recipient of list) {
      if (!recipient.email) continue;

      const { name, email, cell, caseID } = recipient;

      // 🔍 Check if client already exists by email or cell
      let existingClient = await Client.findOne({
        $or: [{ email }, { cell }],
      });

      let token = "";

      if (!existingClient) {
        // 🎟️ Create new client and generate token
        token = crypto.randomBytes(20).toString("hex");
        const tokenExpiresAt = new Date();
        tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 30);

        const newClient = new Client({
          name: name || "",
          email,
          cell,
          caseNumber: caseID || "TEMP-" + Date.now(),
          domain: "TAG",
          token,
          tokenExpiresAt,
        });

        await newClient.save();
        console.log(`✅ Client created for ${email}`);
      } else {
        token = existingClient.token;
        if (!token) {
          // If existing client is missing token, create it
          token = crypto.randomBytes(20).toString("hex");
          const tokenExpiresAt = new Date();
          tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 30);

          existingClient.token = token;
          existingClient.tokenExpiresAt = tokenExpiresAt;
          await existingClient.save();
        }
      }

      // 🌐 Build scheduler URL
      const schedulerUrl = `https://www.taxadvocategroup.com/schedule-my-call/${token}`;

      // ✉️ Compile email content
      const emailContent = compiledTemplate({
        name,
        email,
        cell,
        schedulerUrl,
      });

      const mailOptions = {
        from: `"Tax Advocate Group" <${process.env.ADMIN_EMAIL}>`,
        to: email,
        subject: subject,
        html: emailContent,
        attachments:
          attachmentPath && fs.existsSync(attachmentPath)
            ? [{ filename: attachment, path: attachmentPath }]
            : [],
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Sent email to ${email}`);
      } catch (error) {
        console.error(`❌ Failed to send email to ${email}:`, error);
      }
    }

    res.json({ success: true, message: "Emails processed successfully." });
  } catch (error) {
    console.error("❌ Error processing emails:", error);
    res
      .status(500)
      .json({ success: false, message: "Error processing emails." });
  }
});

router.post("/wynn", async (req, res) => {
  const { subject, attachment, template, list } = req.body;

  if (!list || !Array.isArray(list) || !subject || !template) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid input data." });
  }

  try {
    const templatePath = path.join(
      __dirname,
      "../Templates",
      `${template}.hbs`
    );
    const attachmentPath =
      attachment !== "none"
        ? path.join(__dirname, "../Templates", attachment)
        : null;

    if (!fs.existsSync(templatePath)) {
      console.error(`Template not found: ${templatePath}`);
      return res
        .status(400)
        .json({ success: false, message: "Template file missing." });
    }

    const source = fs.readFileSync(templatePath, "utf8");
    const compiledTemplate = hbs.compile(source);

    for (const recipient of list) {
      if (!recipient.email) continue;

      const { name, email, cell, senderEmailFull, senderName } = recipient;
      /*
      let client = await Client.findOne({
        $or: [{ email }, { cell }],
      });

      let token = "";
      let tokenExpiresAt = new Date();
      tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 30);

      if (client) {
        token = client.token || crypto.randomBytes(16).toString("hex");
        client.token = token;
        client.tokenExpiresAt = tokenExpiresAt;
        await client.save();
      } else {
        token = crypto.randomBytes(16).toString("hex");

        client = new Client({
          name: name || "",
          email,
          cell,
          caseNumber: caseID || "TEMP-" + Date.now(),
          domain: "WYNN",
          token,
          tokenExpiresAt,
        });

        await client.save();
        console.log(`✅ New Wynn client saved: ${email}`);
      }

      const scheduleUrl = `https://www.wynntaxsolutions.com/schedule-my-call/${token}`;
      */
      const emailContent = compiledTemplate({ name });

      const mailOptions = {
        from: `"${senderName} at Wynn Tax Soltuions" <${senderEmailFull}>`,
        to: email,
        subject,
        html: emailContent,
        attachments:
          attachmentPath && fs.existsSync(attachmentPath)
            ? [{ filename: attachment, path: attachmentPath }]
            : [],
      };

      try {
        await transporter2.sendMail(mailOptions);
        console.log(`✅ Wynn email sent to ${email}`);
      } catch (error) {
        console.error(`❌ Failed to send Wynn email to ${email}:`, error);
      }
    }

    res.json({ success: true, message: "Wynn emails processed successfully." });
  } catch (error) {
    console.error("❌ Error processing Wynn emails:", error);
    res
      .status(500)
      .json({ success: false, message: "Error processing emails." });
  }
});
router.post("/amity", async (req, res) => {
  const { subject, attachment, template, list } = req.body;

  if (!list || !Array.isArray(list) || !subject || !template) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid input data." });
  }

  try {
    const templatePath = path.join(
      __dirname,
      "../Templates",
      `${template}.hbs`
    );
    const attachmentPath =
      attachment !== "none"
        ? path.join(__dirname, "../Templates", attachment)
        : null;

    if (!fs.existsSync(templatePath)) {
      console.error(`Template not found: ${templatePath}`);
      return res
        .status(400)
        .json({ success: false, message: "Template file missing." });
    }

    const source = fs.readFileSync(templatePath, "utf8");
    const compiledTemplate = hbs.compile(source);

    for (const recipient of list) {
      if (!recipient.email) continue;

      const { name, email, cell, caseNumber, senderEmailFull, senderName } =
        recipient;

      let client = await Client.findOne({
        $or: [{ email }, { cell }],
      });

      let token = "";
      let tokenExpiresAt = new Date();
      tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 30);

      if (client) {
        token = client.token || crypto.randomBytes(16).toString("hex");
        client.token = token;
        client.tokenExpiresAt = tokenExpiresAt;
        await client.save();
      } else {
        token = crypto.randomBytes(16).toString("hex");

        client = new Client({
          name: name || "",
          email,
          cell,
          caseNumber: caseID || "TEMP-" + Date.now(),
          domain: "AMITY",
          token,
          tokenExpiresAt,
        });

        await client.save();
        console.log(`✅ New Amity client saved: ${email}`);
      }

      const scheduleUrl = `https://www.amitytaxgroup.com/schedule-my-call/${token}`;
      const emailContent = compiledTemplate({ name, scheduleUrl });

      const mailOptions = {
        from: `"${senderName}" <${senderEmailFull}>`,
        to: email,
        subject,
        html: emailContent,
        attachments:
          attachmentPath && fs.existsSync(attachmentPath)
            ? [{ filename: attachment, path: attachmentPath }]
            : [],
      };

      try {
        await transporter3.sendMail(mailOptions);
        console.log(`✅ Amity email sent to ${email}`);
      } catch (error) {
        console.error(`❌ Failed to send Amity email to ${email}:`, error);
      }
    }

    res.json({ success: true, message: "Amity emails sent successfully." });
  } catch (error) {
    console.error("❌ Error processing Amity emails:", error);
    res.status(500).json({ success: false, message: "Error sending emails." });
  }
});
module.exports = router;
