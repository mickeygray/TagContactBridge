const nodemailer = require("nodemailer");
require("dotenv").config();

// 🔧 Create a reusable transporter based on the domain
const getTransporter = (domain) => {
  const apiKey =
    domain === "WYNN" ? process.env.WYNN_API_KEY : process.env.TAXAD_API_KEY;

  return nodemailer.createTransport({
    host: "smtp.sendgrid.net",
    port: 587,
    secure: false,
    auth: {
      user: "apikey",
      pass: apiKey,
    },
  });
};

/**
 * Send an email using SendGrid + Nodemailer
 *
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Subject line
 * @param {string} [options.text] - Fallback plain text content
 * @param {string} [options.html] - Optional HTML content
 * @param {string} [options.domain] - "TAG" (default) or "WYNN"
 */
const sendEmail = async ({ to, subject, text, html, domain }) => {
  const transporter = getTransporter(domain);

  const fromAddress =
    domain === "WYNN"
      ? `"Wynn Tax Solutions" <${process.env.WYNN_EMAIL}>`
      : `"Tax Advocate Group" <${process.env.TAG_EMAIL}>`;

  const mailOptions = {
    from: fromAddress,
    to,
    subject,
    text: text || "",
    html: html || "",
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📤 Email sent to ${to} via ${domain}`);
  } catch (err) {
    console.error(
      "❌ Email sending failed:",
      err.response?.body || err.message
    );
    throw new Error("Email failed");
  }
};

module.exports = sendEmail;
