// services/loginPanel.js
// ─────────────────────────────────────────────────────────────
// Auth gate — email-based login via SendGrid.
// After verification, sets a session cookie and redirects
// to the React app at /dashboard.
//
// Exports isValidSession so other route files can gate access.
// ─────────────────────────────────────────────────────────────

const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { getCompanyConfig } = require("../../shared/config/companyConfig");

// ─── Config ──────────────────────────────────────────────────

const PANEL_EMAIL = process.env.ADMIN_EMAIL;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;
const COOKIE_NAME = "deploy_session";

const ALLOWED_EMAILS = [
  "mgray@taxadvocategroup.com",
  "manderson@taxadvocategroup.com",
  "abanks@taxadvocategroup.com",
];

let pendingCode = null;
let pendingCodeExpires = 0;
let sessions = {};

// ─── Email sender (SendGrid via nodemailer) ──────────────────

async function sendEmailCode(code, toEmail) {
  const recipient = toEmail || PANEL_EMAIL;
  if (!recipient) throw new Error("No recipient email");

  const config = getCompanyConfig("TAG");
  const transport = nodemailer.createTransport({
    host: process.env.SENDGRID_GATEWAY || "smtp.sendgrid.net",
    port: Number(process.env.SENDGRID_PORT) || 587,
    secure: false,
    auth: {
      user: "apikey",
      pass:
        config.sendgridApiKey ||
        process.env.TAG_API_KEY ||
        process.env.WYNN_API_KEY,
    },
  });

  await transport.sendMail({
    from: `TagContactBridge <${config.fromEmail || "inquiry@taxadvocategroup.com"}>`,
    to: recipient,
    subject: `Login Code: ${code}`,
    text: `Your verification code is: ${code}\n\nExpires in 10 minutes.`,
    html: `
      <div style="font-family:monospace;padding:20px;background:#0a0a0a;color:#e0e0e0;border-radius:8px;max-width:400px;">
        <h2 style="color:#00ff88;margin:0 0 8px;">TagContactBridge</h2>
        <p style="color:#888;margin:0 0 20px;">Verification code:</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#fff;background:#141414;padding:16px;border-radius:8px;text-align:center;border:1px solid #333;">
          ${code}
        </div>
        <p style="color:#666;font-size:12px;margin:16px 0 0;">Expires in 10 minutes.</p>
      </div>
    `,
  });

  console.log(`[AUTH] Code sent via email to ${recipient}`);
}

// ─── Auth helpers ────────────────────────────────────────────

function generateCode() {
  return crypto.randomInt(100000, 999999).toString();
}

function generateSession() {
  return crypto.randomBytes(32).toString("hex");
}

function isValidSession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token || !sessions[token]) return false;
  if (Date.now() > sessions[token].expires) {
    delete sessions[token];
    return false;
  }
  return true;
}

// ─── Mount login routes ──────────────────────────────────────

function mountLoginPanel(app) {
  // ── Login page or redirect if already authed ───────────────
  app.get("/login", (req, res) => {
    if (isValidSession(req)) {
      return res.redirect("/dashboard");
    }
    res.send(loginHTML());
  });

  // ── Send verification code ─────────────────────────────────
  app.post("/login/send-code", async (req, res) => {
    try {
      const chosen = req.body?.email;
      if (chosen && !ALLOWED_EMAILS.includes(chosen)) {
        return res.status(400).json({ ok: false, error: "Invalid email" });
      }
      const code = generateCode();
      pendingCode = code;
      pendingCodeExpires = Date.now() + CODE_TTL_MS;
      await sendEmailCode(code, chosen || PANEL_EMAIL);
      res.json({ ok: true, message: "Code sent to email" });
    } catch (err) {
      console.error("[AUTH] Email send failed:", err.message);
      res
        .status(500)
        .json({ ok: false, error: "Failed to send code: " + err.message });
    }
  });

  // ── Verify code → set cookie → redirect to React app ──────
  app.post("/login/verify", (req, res) => {
    const { code } = req.body || {};

    if (!pendingCode || Date.now() > pendingCodeExpires) {
      return res.status(401).json({ ok: false, error: "Code expired" });
    }

    if (String(code).trim() !== String(pendingCode).trim()) {
      return res.status(401).json({ ok: false, error: "Wrong code" });
    }

    pendingCode = null;
    const token = generateSession();
    sessions[token] = {
      expires: Date.now() + SESSION_TTL_MS,
      created: new Date().toISOString(),
    };

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "Lax",
      maxAge: SESSION_TTL_MS,
      path: "/",
    });

    console.log("[AUTH] ✓ Authenticated — redirecting to React app");
    res.json({ ok: true, redirect: "/dashboard" });
  });

  // ── Auth check (used by nginx auth_request) ────────────────
  app.get("/auth-check", (req, res) => {
    if (isValidSession(req)) return res.sendStatus(200);
    return res.sendStatus(401);
  });

  // ── Logout ─────────────────────────────────────────────────
  app.get("/logout", (req, res) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) delete sessions[token];
    res.clearCookie(COOKIE_NAME, { path: "/" });
    res.redirect("/login");
  });
}

// ═════════════════════════════════════════════════════════════
// LOGIN HTML
// ═════════════════════════════════════════════════════════════

function loginHTML() {
  const emailHint = PANEL_EMAIL
    ? PANEL_EMAIL.replace(/(.{2}).*(@.*)/, "$1***$2")
    : "not configured";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TagContactBridge — Login</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'DM Sans', sans-serif;
      background: #0a0a0a;
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .login-box {
      background: #141414;
      border: 1px solid #222;
      border-radius: 12px;
      padding: 40px;
      width: 340px;
      text-align: center;
    }
    .login-box h1 {
      font-family: 'JetBrains Mono', monospace;
      font-size: 18px;
      color: #00ff88;
      margin-bottom: 8px;
      letter-spacing: 2px;
    }
    .login-box p {
      font-size: 13px;
      color: #666;
      margin-bottom: 24px;
    }
    .email-hint {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: #555;
      margin-bottom: 16px;
    }
    .step { display: none; }
    .step.active { display: block; }
    button {
      font-family: 'DM Sans', sans-serif;
      width: 100%;
      padding: 12px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-send { background: #00ff88; color: #0a0a0a; }
    .btn-send:hover { background: #00cc6a; }
    .btn-send:disabled { background: #333; color: #666; cursor: not-allowed; }
    .btn-verify { background: #fff; color: #0a0a0a; }
    .btn-verify:hover { background: #ddd; }
    input {
      font-family: 'JetBrains Mono', monospace;
      width: 100%;
      padding: 14px;
      border: 1px solid #333;
      border-radius: 8px;
      background: #0a0a0a;
      color: #fff;
      font-size: 24px;
      text-align: center;
      letter-spacing: 12px;
      margin-bottom: 16px;
      outline: none;
    }
    input:focus { border-color: #00ff88; }
    input::placeholder { letter-spacing: 2px; font-size: 14px; color: #444; }
    .error { color: #ff4444; font-size: 13px; margin-top: 12px; }
    .sending { color: #00ff88; font-size: 13px; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="login-box">
    <h1>TCB</h1>
    <p>Email verification required</p>
    <div class="email-hint">${emailHint}</div>
    <div id="step1" class="step active">
      <select id="emailSelect" style="
        font-family:'JetBrains Mono',monospace;
        width:100%;padding:10px;border:1px solid #333;border-radius:8px;
        background:#0a0a0a;color:#e0e0e0;font-size:12px;margin-bottom:12px;
        outline:none;cursor:pointer;appearance:auto;
      ">
        <option value="mgray@taxadvocategroup.com">mgray@</option>
        <option value="manderson@taxadvocategroup.com">manderson@</option>
        <option value="abanks@taxadvocategroup.com">abanks@</option>
      </select>
      <button class="btn-send" onclick="sendCode()" id="sendBtn">Send Code to Email</button>
      <div id="sendStatus"></div>
    </div>

    <div id="step2" class="step">
      <input type="text" id="codeInput" maxlength="6" placeholder="000000" autofocus
        onkeyup="if(this.value.length===6)verify()">
      <button class="btn-verify" onclick="verify()">Verify</button>
      <div id="verifyStatus"></div>
    </div>
  </div>

  <script>
    async function sendCode() {
      const btn = document.getElementById('sendBtn');
      const status = document.getElementById('sendStatus');
      btn.disabled = true;
      status.className = 'sending';
      status.textContent = 'Sending...';
      try {
        const email = document.getElementById('emailSelect').value;
        const res = await fetch('/panel/send-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (data.ok) {
          document.getElementById('step1').classList.remove('active');
          document.getElementById('step2').classList.add('active');
          document.getElementById('codeInput').focus();
        } else {
          status.className = 'error';
          status.textContent = data.error || 'Failed to send';
          btn.disabled = false;
        }
      } catch (err) {
        status.className = 'error';
        status.textContent = 'Network error';
        btn.disabled = false;
      }
    }
    async function verify() {
      const code = document.getElementById('codeInput').value.trim();
      const status = document.getElementById('verifyStatus');
      if (code.length !== 6) return;
      status.className = 'sending';
      status.textContent = 'Verifying...';
      try {
        const res = await fetch('/panel/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const data = await res.json();
        if (data.ok) {
          window.location.href = data.redirect || '/dashboard';
        } else {
          status.className = 'error';
          status.textContent = data.error || 'Invalid code';
          document.getElementById('codeInput').value = '';
          document.getElementById('codeInput').focus();
        }
      } catch (err) {
        status.className = 'error';
        status.textContent = 'Network error';
      }
    }
  </script>
</body>
</html>`;
}

module.exports = { mountLoginPanel, isValidSession };
