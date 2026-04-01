// routes/auth.js
// ─────────────────────────────────────────────────────────────
// Auth check endpoint for the React app.
//
// Primary auth is via loginPanel (leadBridge) — email + pin code.
// loginPanel sets deploy_session cookie, nginx validates via
// auth_request to /auth-check, sets X-Auth-Validated header.
//
// GET /api/auth/me — called by useAuth on mount to verify
// the session is valid and get the user object.
// ─────────────────────────────────────────────────────────────

const express = require("express");
const { authMiddleware, ADMIN_USER } = require("../../shared/middleware/authMiddleware");

const router = express.Router();

// ── GET /api/auth/me — returns current user if session valid ──
router.get("/me", authMiddleware, (req, res) => {
  res.json(req.user);
});

module.exports = router;
