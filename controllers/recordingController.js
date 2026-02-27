// UNUSED — Route commented out in server.js; no frontend calls /api/calls.
// Also has a circular self-import bug (requires itself).
// Kept for reference.
/*
const express = require("express");
const router = express.Router();
const {
  authMiddleware,
  ensureOnline,
  requireAdmin,
} = require("../middleware/authMiddleware");
const { streamRecording } = require("../controllers/recordingController");

router.get(
  "/:callId",
  authMiddleware,
  ensureOnline,
  streamRecording
);

module.exports = router;
*/
