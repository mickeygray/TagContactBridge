const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  const token =
    req.cookies.token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : null);

  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(403).json({ message: "Invalid token" });
  }
};
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin")
    return res.status(403).json({ message: "Admin access required" });
  next();
};
const isDomainAllowed = (email) => {
  const allowed = process.env.ALLOWED_DOMAINS.split(",").map((d) =>
    d.trim().toLowerCase()
  );
  const domain = email.split("@")[1].toLowerCase();
  return allowed.includes(domain);
};

const ensureOnline = (req, res, next) => {
  if (!req.user?.isOnline) {
    return res.status(403).json({ message: "Session expired" });
  }
  next();
};
module.exports = {
  authMiddleware,
  requireAdmin,
  isDomainAllowed,
  ensureOnline,
};
