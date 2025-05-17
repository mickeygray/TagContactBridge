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
  downloadAndEmailDaily,
} = require("../controllers/listController");

// helper to list all non-zip files under a dir

// Protect bulk-list operations
router.use(authMiddleware, requireAdmin);

// Bulk import leads into both TAG & WYNN
// POST /api/list/postNCOA

router.post("/download-and-email-daily", downloadAndEmailDaily);
router.post("/postNCOA", postNCOA);

// Bulk add clients based on createDate (placeholder)
// POST /api/list/addCreateDateClients
router.post("/addCreateDateClients", addCreateDateClients);

router.post("/parseZeros", parseZeroInvoices);

// Placeholder: build marketing schedule list
// GET /api/list/buildSchedule
router.post("/buildPeriod", buildSchedule);

router.get("/reviewClients", async (req, res, next) => {
  try {
    const clients = await Client.find({ status: "inReview" })
      .sort({ reviewDate: 1 })
      .lean();
    res.json(clients);
  } catch (err) {
    next(err);
  }
});
router.post("/validate", buildDialerList);

router.post("/filterList", filterList);
module.exports = router;
