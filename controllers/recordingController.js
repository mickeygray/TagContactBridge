const express = require("express");
const router = express.Router();
const {
  authMiddleware,
  ensureOnline,
  requireAdmin,
} = require("../middleware/authMiddleware");
const { streamRecording } = require("../controllers/recordingController");

// All users must be authenticated and online
router.get(
  "/:callId",
  authMiddleware,
  ensureOnline,
  // optionally restrict to admins:
  // requireAdmin,
  streamRecording
);

module.exports = router;
