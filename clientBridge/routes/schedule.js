// routes/schedule.js
// ─────────────────────────────────────────────────────────────
// Repurposed for CallFire Auto-Dialer API endpoints
// ─────────────────────────────────────────────────────────────

const express = require("express");
const router = express.Router();
const {
  getWynnLeads,
  getTagLeads,
  startWynnDialer,
  startTagDialer,
  getDialerStatus,
  stopDialer,
  pauseDialer,
  resumeDialer,
} = require("../controllers/callFireController");

// ═══════════════════════════════════════════════════════════════════════════
// CALLFIRE AUTO-DIALER ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// Fetch leads
router.get("/wynn-leads", getWynnLeads);
router.get("/tag-leads", getTagLeads);

// Start dialers
router.post("/start-wynn", startWynnDialer);
router.post("/start-tag", startTagDialer);

// Control
router.get("/status", getDialerStatus);
router.post("/stop", stopDialer);
router.post("/pause", pauseDialer);
router.post("/resume", resumeDialer);

module.exports = router;
