/**
 * routes/listCleaner.js
 */

const express = require("express");
const router = express.Router();
const {
  authMiddleware,
  requireAdmin,
} = require("../middleware/authMiddleware");
const {
  cleanClients,
  // cleanProspectsPhone,  // UNUSED — no frontend calls /cleaner/prospects-phone
  // cleanProspectsEmail,  // UNUSED — no frontend calls /cleaner/prospects-email
} = require("../controllers/listCleanerController");

router.use(authMiddleware, requireAdmin);

router.post("/clients", cleanClients);
// UNUSED — no frontend calls these endpoints
// router.post("/prospects-phone", cleanProspectsPhone);
// router.post("/prospects-email", cleanProspectsEmail);

module.exports = router;
