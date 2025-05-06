const express = require("express");
const router = express.Router();
const sendTextMessage = require("../utils/sendTextMessage");
const {
  authMiddleware,
  requireAdmin,
} = require("../middleware/authMiddleware");

const { getStats } = require("../utils/textStats");
// Protect it
router.use(authMiddleware, requireAdmin);
router.post("/send", async (req, res, next) => {
  const { messagesPayload } = req.body;
  if (!Array.isArray(messagesPayload)) {
    return res
      .status(400)
      .json({ message: "Invalid payload – expected messagesPayload array" });
  }

  try {
    const results = [];
    // send them one by one (you can parallelize with Promise.all, but let's keep it simple)
    for (const msg of messagesPayload) {
      const outcome = await sendTextMessage(msg);
      results.push(outcome);
    }
    return res.json({ results });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
