// routes/schedule.js
// ─────────────────────────────────────────────────────────────
// CallFire dialer deprecated — RingBridge CX will handle lead
// contact. Routes kept as stubs returning 410 Gone so frontend
// degrades gracefully during migration.
// ─────────────────────────────────────────────────────────────

const express = require("express");
const router = express.Router();

const gone = (req, res) => res.status(410).json({ error: "CallFire dialer deprecated — use RingBridge CX" });

router.get("/wynn-leads", gone);
router.get("/tag-leads", gone);
router.post("/start-wynn", gone);
router.post("/start-tag", gone);
router.get("/status", gone);
router.post("/stop", gone);
router.post("/pause", gone);
router.post("/resume", gone);

module.exports = router;
