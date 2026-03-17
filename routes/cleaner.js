/**
 * routes/cleaner.js
 */

const express = require("express");
const router = express.Router();
const {
  authMiddleware,
  requireAdmin,
} = require("../middleware/authMiddleware");
const {
  cleanClients,
  cleanStatus,
  cleanProspectsPhone,
  cleanProspectsEmail,
} = require("../controllers/listCleanerController");

router.use(authMiddleware, requireAdmin);

router.post("/clients", cleanClients);
router.get("/status/:jobId", cleanStatus);
router.post("/prospects-phone", cleanProspectsPhone);
router.post("/prospects-email", cleanProspectsEmail);

module.exports = router;
