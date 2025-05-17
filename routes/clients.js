const express = require("express");
const { authMiddleware } = require("../middleware/authMiddleware");
const ctrl = require("../controllers/clientController");
const router = express.Router();

router.use(authMiddleware);

// document upload
router.post(
  "/uploadDocument",

  ctrl.upload.single("file"),
  ctrl.uploadDocumentHandler
);

// enrichment / zero invoice / tasks / activities
router.post("/enrichClient", ctrl.enrichClientHandler);
router.post("/zeroInvoice", ctrl.zeroInvoiceHandler);
router.post("/createTask", ctrl.createTaskHandler);
router.post("/createActivity", ctrl.createActivityHandler);
// scheduled-client CRUD
router.post("/", ctrl.createScheduledClientHandler);
router.post("/reviewSaleDate", ctrl.processReviewedSaleDateClientHandler);
router.post("/reviewCreateDate", ctrl.processReviewedCreateDateClientHandler);
router.delete("/delete", ctrl.deleteClientHandler);

module.exports = router;
