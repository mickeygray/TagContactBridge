const express = require("express");
const {
  authMiddleware,
  requireAdmin,
  ensureOnline,
} = require("../middleware/authMiddleware");
const {
  createScheduledClientHandler,
  updateScheduledClientHandler,
  deleteScheduledClientHandler,
  uploadDocumentHandler,
  upload,
} = require("../controllers/clientController");

const router = express.Router();

// Protect all client actions
router.use(authMiddleware, ensureOnline);

// Upload a case document to Logics
router.post(
  "/uploadDocument",
  requireAdmin,
  upload.single("file"),
  uploadDocumentHandler
);
// Scheduled client CRUD operations
// Create scheduled client (practitioner call)
router.post("/", createScheduledClientHandler);

// Update scheduled client by ID
router.put("/:id", updateScheduledClientHandler);

// Delete scheduled client by ID
router.delete("/:id", deleteScheduledClientHandler);

router.post("/", async (req, res) => {
  try {
    const token = crypto.randomBytes(24).toString("hex");
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 60);

    const caseID = parseInt(req.body.caseNumber);
    let invoiceCount = 0;
    let lastInvoiceAmount = 0;

    // 🧾 Fetch invoice data from Logics
    try {
      const invoiceData = await fetchInvoices(caseID, req.body.domain || "TAG");
      invoiceCount = invoiceData.length;
      lastInvoiceAmount = invoiceData.at(-1)?.Amount || 0;
    } catch (err) {
      console.warn("⚠️ Could not fetch invoice data from Logics:", err.message);
    }

    // 🧾 Create new client
    const newClient = new Client({
      ...req.body,
      token,
      tokenExpiresAt,
      invoiceCount,
      lastInvoiceAmount,
      saleDate: new Date(), // ✅ Automatically set today's date as sale date
    });

    await newClient.save();

    // 📤 Auto-send prac email
    const domain = req.body.domain || "TAG";

    const templatePath = path.join(__dirname, "../Templates/prac-call.hbs");
    const source = fs.readFileSync(templatePath, "utf8");
    const compiledTemplate = hbs.compile(source);

    const html = compiledTemplate({
      name: req.body.name,
      caseNumber: req.body.caseNumber,
      link: `https://${
        domain === "WYNN" ? "wynntaxsolutions.com" : "taxadvocategroup.com"
      }/schedule-my-call/${token}`,
    });

    await sendEmail({
      to: req.body.email,
      subject: "Let’s Schedule Your Practitioner Call",
      html,
      domain,
    });

    res.status(200).json(newClient);
  } catch (error) {
    console.error("❌ Error saving scheduled client:", error);
    res.status(500).json({ message: "Failed to save client." });
  }
});

// @route   PUT /api/scheduledmessages/:id
// @desc    Update scheduled client
router.put("/:id", async (req, res) => {
  try {
    const updated = await Client.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    res.status(200).json(updated);
  } catch (error) {
    console.error("Error updating scheduled client:", error);
    res.status(500).json({ message: "Failed to update client." });
  }
});

// @route   DELETE /api/scheduledmessages/:id
// @desc    Delete scheduled client
router.delete("/:id", async (req, res) => {
  try {
    await Client.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Client deleted" });
  } catch (error) {
    console.error("Error deleting scheduled client:", error);
    res.status(500).json({ message: "Failed to delete client." });
  }
});

module.exports = router;
