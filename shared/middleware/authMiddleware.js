// shared/middleware/authMiddleware.js
// ─────────────────────────────────────────────────────────────
// Auth strategy (checked in order):
//   1. tcb_session cookie → validate against MongoDB AuthSession
//   2. nginx X-Auth-Validated header → auto-admin (nginx validated upstream)
//   3. JWT token in cookie or Authorization header → verify + decode
//
// All three bridges use this middleware. The session cookie is
// shared across all ports via the same domain. MongoDB is the
// single source of truth for sessions — no in-memory state.
// ─────────────────────────────────────────────────────────────

const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const ADMIN_USER = Object.freeze({
  id: "admin",
  role: "admin",
  name: process.env.ADMIN_NAME || "Mickey",
  email: process.env.ADMIN_EMAIL || "mgray@taxadvocategroup.com",
  isOnline: true,
});

const SESSION_COOKIE = "tcb_session";

// Lazy reference to AuthSession model (avoids circular dep issues)
let SessionModel = null;
function getSessionModel() {
  if (!SessionModel) {
    SessionModel = mongoose.models.AuthSession || null;
  }
  return SessionModel;
}

const authMiddleware = async (req, res, next) => {
  // Path 1: tcb_session cookie → MongoDB session check
  const sessionToken = req.cookies?.[SESSION_COOKIE];
  if (sessionToken) {
    const Session = getSessionModel();
    if (Session) {
      try {
        const session = await Session.findOne({
          token: sessionToken,
          expiresAt: { $gt: new Date() },
        }).lean();
        if (session) {
          req.user = { ...ADMIN_USER, email: session.email };
          return next();
        }
      } catch (err) {
        console.error("[AUTH] Session lookup error:", err.message);
      }
    }
  }

  // Path 2: nginx X-Auth-Validated header
  // IMPORTANT: nginx MUST strip this header from client requests
  if (req.headers["x-auth-validated"] === "true") {
    req.user = { ...ADMIN_USER };
    return next();
  }

  // Path 3: JWT token (fallback for dev/future agents)
  const jwtToken =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : null);

  if (jwtToken && process.env.JWT_SECRET) {
    try {
      const decoded = jwt.verify(jwtToken, process.env.JWT_SECRET);
      req.user = decoded;
      return next();
    } catch { /* fall through */ }
  }

  return res.status(401).json({ message: "Not authenticated" });
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin")
    return res.status(403).json({ message: "Admin access required" });
  next();
};

module.exports = {
  authMiddleware,
  requireAdmin,
  ADMIN_USER,
};
