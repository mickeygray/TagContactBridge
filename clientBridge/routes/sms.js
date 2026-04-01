// routes/sms.js
const express = require("express");
const router = express.Router();
const {
  authMiddleware,
  requireAdmin,
} = require("../../shared/middleware/authMiddleware");
const ctrl = require("../controllers/smsController");

router.use(authMiddleware, requireAdmin);

// Dashboard
router.get("/stats", ctrl.getStats);
router.get("/conversations", ctrl.listConversations);
router.get("/conversations/:id", ctrl.getConversation);

// Actions
router.post("/conversations/:id/approve", ctrl.approveResponse);
router.post("/conversations/:id/cancel", ctrl.cancelResponse);
router.post("/conversations/:id/edit", ctrl.editAndSend);
router.post("/conversations/:id/send", ctrl.manualSend);
router.post("/conversations/:id/regenerate", ctrl.regenerate);
router.post("/conversations/:id/sleep", ctrl.sleepBot);
router.post("/conversations/:id/wake", ctrl.wakeBot);
router.post("/conversations/:id/dnc", ctrl.markDnc);
// Settings
router.get("/settings", ctrl.getSettings);
router.put("/settings", ctrl.updateSettings);

module.exports = router;
