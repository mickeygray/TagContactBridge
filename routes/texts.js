const express = require("express");
const router = express.Router();
const sendTextMessage = require("../utils/sendTextMessage");
const {
  authMiddleware,
  ensureOnline,
  requireAdmin,
} = require("../middleware/authMiddleware");

const { getStats } = require("../utils/textStats");
// Protect it
router.use(authMiddleware, ensureOnline, requireAdmin);

router.post("/send", async (req, res, next) => {
  const { messagesPayload } = req.body;
  if (!Array.isArray(messagesPayload)) {
    return res.status(400).json({ message: "Invalid payload" });
  }
  const stats = getStats();
  try {
    // Fire off all sends in parallel (or with a small concurrency cap)
    const results = await Promise.all(messagesPayload.map(sendTextMessage));
    const stats = getStats();
    res.json({ results, stats });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
