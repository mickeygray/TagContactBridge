// routes/auth.js
// ─────────────────────────────────────────────────────────────
// Simplified auth routes.
//
// Primary auth is via nginx SMS gate (deploy panel).
// JWT login kept as fallback for future agents.
// ─────────────────────────────────────────────────────────────

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { authMiddleware, ADMIN_USER } = require("../middleware/authMiddleware");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many login attempts. Please try again later.",
});

// ── GET /api/auth/me — returns current user ──────────────────
// If nginx-validated: returns admin immediately (no DB hit)
// If JWT: looks up user in DB
router.get("/me", authMiddleware, async (req, res) => {
  console.log(`[AUTH /me] req.user:`, JSON.stringify(req.user));
  try {
    // nginx gate → admin user object is already set
    if (req.user.id === "admin") {
      return res.json(ADMIN_USER);
    }

    // JWT path → look up real user
    const user = await User.findById(req.user.id).select("-passwordHash");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// ── POST /api/auth/login — JWT login (future agents) ────────
router.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    user.isOnline = true;
    await user.save();

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── POST /api/auth/logout ────────────────────────────────────
router.post("/logout", async (req, res) => {
  try {
    const token = req.cookies.token;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (user) {
        user.isOnline = false;
        await user.save();
      }
    }
    res.clearCookie("token").json({ message: "Logged out" });
  } catch (err) {
    res.status(500).json({ message: "Logout failed" });
  }
});

module.exports = router;
