const nodemailer = require("nodemailer");
require("dotenv").config();

// 🔧 Create a reusable transporter based on the domain
const getTransporter = (domain) => {
  let apiKey;
  switch ((domain || "").toUpperCase()) {
    case "WYNN":
      apiKey = process.env.WYNN_API_KEY;
      break;
    case "AMITY":
      apiKey = process.env.AMITY_API_KEY;
      break;
    case "TAG":
    default:
      apiKey = process.env.TAXAD_API_KEY;
      break;
  }

  return nodemailer.createTransport({
    host: process.env.SENDGRID_GATEWAY,
    port: process.env.SENDGRID_PORT,
    secure: false, // TLS
    auth: {
      user: process.env.SENDGRID_USER,
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
const sendEmail = async ({
  to,
  subject,
  text,
  html,
  domain,
  from,
  attachments,
}) => {
  const transporter = getTransporter(domain);

  const fromMap = {
    TAG: `${process.env.TAG_EMAIL_NAME} <${process.env.TAG_EMAIL_ADDRESS}>`,
    WYNN: `${process.env.WYNN_EMAIL_NAME} <${process.env.WYNN_EMAIL_ADDRESS}>`,
    AMITY: `${process.env.AMITY_EMAIL_NAME} <${process.env.AMITY_EMAIL_ADDRESS}>`,
  };
  const fromEmail = fromMap[domain?.toUpperCase()] || from;
  const mailOptions = {
    from: from ? from : fromEmail,
    to,
    subject,
    text: text || "",
    html: html || "",
    attachments: attachments,
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
