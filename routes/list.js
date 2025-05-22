const express = require("express");
const router = express.Router();
const Client = require("../models/Client");
const {
  authMiddleware,
  requireAdmin,
} = require("../middleware/authMiddleware");
const {
  postNCOA,
  buildSchedule,
  addCreateDateClients,
  parseZeroInvoices,
  buildDialerList,
  filterList,
  buildLienList,
  downloadAndEmailDaily,
  unifiedClientSearch,
} = require("../controllers/listController");

// helper to list all non-zip files under a dir

// Protect bulk-list operations
router.use(authMiddleware, requireAdmin);

// Bulk import leads into both TAG & WYNN
// POST /api/list/postNCOA

router.post("/download-and-email-daily", downloadAndEmailDaily);
router.post("/postNCOA", postNCOA);
router.post("/search", unifiedClientSearch);
// Bulk add clients based on createDate (placeholder)
// POST /api/list/addCreateDateClients
router.post("/addCreateDateClients", addCreateDateClients);

router.post("/parseZeros", parseZeroInvoices);
router.post("/buildLienList", buildLienList);
// Placeholder: build marketing schedule list
// GET /api/list/buildSchedule
router.post("/buildPeriod", buildSchedule);

router.post("/validate", buildDialerList);

router.post("/filterList", filterList);
module.exports = router;
