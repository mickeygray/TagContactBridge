// shared/middleware/authMiddleware.js
// ─────────────────────────────────────────────────────────────
// Auth strategy:
//   1. nginx validates SMS session via auth_request → sets X-Auth-Validated header
//      IMPORTANT: nginx MUST strip X-Auth-Validated from client requests
//      before proxying. Without this, clients can spoof auth.
//   2. If header present → auto-admin, no JWT needed
//   3. If no header → fall through to JWT (for future agents or local dev)
// ─────────────────────────────────────────────────────────────

const jwt = require("jsonwebtoken");

// Fail fast if JWT_SECRET is missing
if (!process.env.JWT_SECRET && process.env.NODE_ENV === "production") {
  console.error("[AUTH] FATAL: JWT_SECRET not configured");
  process.exit(1);
}

const ADMIN_USER = Object.freeze({
  id: "admin",
  role: "admin",
  name: process.env.ADMIN_NAME || "Mickey",
  email: process.env.ADMIN_EMAIL || "mgray@taxadvocategroup.com",
  isOnline: true,
});

const authMiddleware = (req, res, next) => {
  // Path 1: nginx SMS gate validated — auto-admin
  // Security: nginx must proxy_set_header X-Auth-Validated "" to strip client spoofing
  if (req.headers["x-auth-validated"] === "true") {
    req.user = { ...ADMIN_USER };
    return next();
  }

  // Path 2: JWT token (future agents, local dev without nginx)
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : null);

  if (!token) return res.status(401).json({ message: "Not authenticated" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
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
