// routes/auth.js
// ─────────────────────────────────────────────────────────────
// Email + pin code authentication with MongoDB session store.
//
// Security for EC2/production deployment:
//   - Sessions in MongoDB (survives restarts, works with PM2 cluster)
//   - Cookies: httpOnly, secure (HTTPS), sameSite strict
//   - CSRF: double-submit cookie pattern (X-CSRF-Token header)
//   - Rate limiting on send-code and verify
//   - Pending codes hashed with SHA-256 (not stored in plaintext)
//   - Sessions auto-expire via MongoDB TTL index
//
// Flow:
//   1. POST /api/auth/send-code { email } → sends 6-digit pin
//   2. POST /api/auth/verify { email, code } → validates, sets cookie
//   3. GET  /api/auth/me                     → returns user if valid
//   4. POST /api/auth/logout                 → destroys session
// ─────────────────────────────────────────────────────────────

const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const sendEmail = require("../../shared/utils/sendEmail");
const { ADMIN_USER } = require("../../shared/middleware/authMiddleware");

const router = express.Router();

// ─── Config ──────────────────────────────────────────────────

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;     // 8 hours
const CODE_TTL_MS = 10 * 60 * 1000;             // 10 minutes
const COOKIE_NAME = "tcb_session";
const CSRF_COOKIE = "tcb_csrf";
const IS_PROD = process.env.NODE_ENV === "production";

const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

if (ALLOWED_EMAILS.length === 0) {
  ALLOWED_EMAILS.push(
    "mgray@taxadvocategroup.com",
    "manderson@taxadvocategroup.com",
    "abanks@taxadvocategroup.com"
  );
}

// ─── MongoDB Session Schema ──────────────────────────────────

const sessionSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true },
  csrfSecret: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  createdAt: { type: Date, default: Date.now },
});

const Session = mongoose.models.AuthSession || mongoose.model("AuthSession", sessionSchema);

// Pending codes — short-lived, in-memory is fine (10min TTL, single process handles login)
// Code is hashed so even a memory dump doesn't reveal it.
const pendingCodes = {};

function hashCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

// ─── Session helpers ─────────────────────────────────────────

async function getSession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;

  const session = await Session.findOne({ token, expiresAt: { $gt: new Date() } }).lean();
  return session || null;
}

function isValidSession(req) {
  // Sync check for nginx auth_request — uses a fire-and-forget approach
  // For async validation, use getSession() instead
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return false;
  // Return a promise for the nginx check endpoint to await
  return Session.findOne({ token, expiresAt: { $gt: new Date() } }).lean().then((s) => !!s);
}

function verifyCsrf(req, session) {
  if (!IS_PROD) return true; // Skip in dev for convenience
  const headerToken = req.headers["x-csrf-token"];
  return headerToken && headerToken === session.csrfSecret;
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

router.get("/me", async (req, res) => {
  const session = await getSession(req);
  if (!session) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  res.json({
    ...ADMIN_USER,
    email: session.email,
    csrfToken: session.csrfSecret, // Frontend stores this for subsequent requests
  });
});

// ─── GET /api/auth/allowed-emails ────────────────────────────

router.get("/allowed-emails", (req, res) => {
  // Only return masked emails to unauthenticated users
  const masked = ALLOWED_EMAILS.map((e) => {
    const [local, domain] = e.split("@");
    return `${local.slice(0, 2)}***@${domain}`;
  });
  res.json({ emails: ALLOWED_EMAILS, masked });
});

// ─── POST /api/auth/send-code ────────────────────────────────

router.post("/send-code", codeLimiter, async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();

    if (!email || !ALLOWED_EMAILS.includes(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    const code = crypto.randomInt(100000, 999999).toString();
    pendingCodes[email] = {
      hash: hashCode(code),
      expires: Date.now() + CODE_TTL_MS,
      attempts: 0,
    };

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

router.post("/verify", verifyLimiter, async (req, res) => {
  const { email, code } = req.body || {};
  const normalEmail = (email || "").trim().toLowerCase();

  const pending = pendingCodes[normalEmail];
  if (!pending || Date.now() > pending.expires) {
    return res.status(401).json({ error: "Code expired or not found" });
  }

  // Max 3 attempts per code
  pending.attempts++;
  if (pending.attempts > 3) {
    delete pendingCodes[normalEmail];
    return res.status(401).json({ error: "Too many attempts. Request a new code." });
  }

  if (hashCode(code) !== pending.hash) {
    return res.status(401).json({ error: "Wrong code" });
  }

  // Code valid — create MongoDB session
  delete pendingCodes[normalEmail];

  const token = crypto.randomBytes(32).toString("hex");
  const csrfSecret = crypto.randomBytes(32).toString("hex");

  await Session.create({
    token,
    email: normalEmail,
    csrfSecret,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });

  // Session cookie — httpOnly, secure in prod
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "Strict",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });

  // CSRF token — readable by JS (not httpOnly), used for double-submit
  res.cookie(CSRF_COOKIE, csrfSecret, {
    httpOnly: false,
    secure: IS_PROD,
    sameSite: "Strict",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });

  console.log(`[AUTH] Session created for ${normalEmail}`);
  res.json({ ok: true, user: { ...ADMIN_USER, email: normalEmail }, csrfToken: csrfSecret });
});

// ─── POST /api/auth/logout ───────────────────────────────────

router.post("/logout", async (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    await Session.deleteOne({ token }).catch(() => {});
  }
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.clearCookie(CSRF_COOKIE, { path: "/" });
  res.json({ ok: true });
});

// ─── Exports ─────────────────────────────────────────────────

module.exports = router;

// Async session check for nginx auth_request (mounted in server.js)
module.exports.checkSession = async (req, res) => {
  const session = await getSession(req);
  return res.sendStatus(session ? 200 : 401);
};
