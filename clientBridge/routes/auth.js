// routes/auth.js
// ─────────────────────────────────────────────────────────────
// Email + pin code authentication.
// Replaces the server-rendered loginPanel HTML — now the React
// app handles the UI, these routes handle the API.
//
// Flow:
//   1. POST /api/auth/send-code { email } → sends 6-digit pin via SendGrid
//   2. POST /api/auth/verify { code }     → validates pin, sets session cookie
//   3. GET  /api/auth/me                  → returns user if session valid
//   4. POST /api/auth/logout              → clears session
// ─────────────────────────────────────────────────────────────

const express = require("express");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const sendEmail = require("../../shared/utils/sendEmail");
const { authMiddleware, ADMIN_USER } = require("../../shared/middleware/authMiddleware");

const router = express.Router();

// ─── Config ──────────────────────────────────────────────────

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;   // 8 hours
const CODE_TTL_MS = 10 * 60 * 1000;           // 10 minutes
const COOKIE_NAME = "deploy_session";

const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// If env not set, fall back to hardcoded defaults
if (ALLOWED_EMAILS.length === 0) {
  ALLOWED_EMAILS.push(
    "mgray@taxadvocategroup.com",
    "manderson@taxadvocategroup.com",
    "abanks@taxadvocategroup.com"
  );
}

// ─── In-memory session store ─────────────────────────────────
// In production, replace with Redis or MongoDB sessions.

const sessions = {};
let pendingCodes = {}; // { email: { code, expires } }

function isValidSession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token || !sessions[token]) return false;
  if (Date.now() > sessions[token].expires) {
    delete sessions[token];
    return false;
  }
  return true;
}

// ─── Rate limiting ───────────────────────────────────────────

const codeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many code requests. Try again in 15 minutes." },
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many verification attempts." },
});

// ─── GET /api/auth/me ────────────────────────────────────────

router.get("/me", (req, res) => {
  if (isValidSession(req)) {
    const session = sessions[req.cookies[COOKIE_NAME]];
    return res.json({
      ...ADMIN_USER,
      email: session.email,
    });
  }

  // Fall through to authMiddleware for nginx X-Auth-Validated
  authMiddleware(req, res, () => {
    res.json(req.user);
  });
});

// ─── GET /api/auth/allowed-emails ────────────────────────────
// Returns the list of allowed emails for the login picker.

router.get("/allowed-emails", (req, res) => {
  res.json({ emails: ALLOWED_EMAILS });
});

// ─── POST /api/auth/send-code ────────────────────────────────

router.post("/send-code", codeLimiter, async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();

    if (!email || !ALLOWED_EMAILS.includes(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    const code = crypto.randomInt(100000, 999999).toString();
    pendingCodes[email] = { code, expires: Date.now() + CODE_TTL_MS };

    await sendEmail({
      to: email,
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
      domain: "TAG",
    });

    console.log(`[AUTH] Code sent to ${email}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[AUTH] Send code failed:", err.message);
    res.status(500).json({ error: "Failed to send code" });
  }
});

// ─── POST /api/auth/verify ───────────────────────────────────

router.post("/verify", verifyLimiter, (req, res) => {
  const { email, code } = req.body || {};
  const normalEmail = (email || "").trim().toLowerCase();

  const pending = pendingCodes[normalEmail];
  if (!pending || Date.now() > pending.expires) {
    return res.status(401).json({ error: "Code expired or not found" });
  }

  if (String(code).trim() !== String(pending.code).trim()) {
    return res.status(401).json({ error: "Wrong code" });
  }

  // Code valid — create session
  delete pendingCodes[normalEmail];
  const token = crypto.randomBytes(32).toString("hex");
  sessions[token] = {
    email: normalEmail,
    expires: Date.now() + SESSION_TTL_MS,
    created: new Date().toISOString(),
  };

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "Lax",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });

  console.log(`[AUTH] Session created for ${normalEmail}`);
  res.json({ ok: true, user: { ...ADMIN_USER, email: normalEmail } });
});

// ─── POST /api/auth/logout ───────────────────────────────────

router.post("/logout", (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) delete sessions[token];
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

// ─── GET /auth-check (nginx auth_request) ────────────────────
// Kept at root level for nginx compatibility — mounted in server.js

module.exports = router;
module.exports.isValidSession = isValidSession;
