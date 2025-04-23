const express = require("express");
const router = express.Router();
const multer = require("multer");
const FormData = require("form-data");
const axios = require("axios");

const upload = multer();
router.post("/scrub", async (req, res) => {
  try {
    const { leads } = req.body;

    // Validate input
    if (!Array.isArray(leads) || leads.length === 0) {
      return res
        .status(400)
        .json({ error: "No leads provided for scrubbing." });
    }

    // Placeholder for scrubbing logic (e.g., filtering, calling an API, etc.)
    const scrubbedLeads = leads.map((lead) => ({
      ...lead,
      scrubbed: true, // Example: Marking all leads as scrubbed
    }));

    // Send response
    res.json({ success: true, scrubbedLeads });
  } catch (error) {
    console.error("❌ Error scrubbing leads:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
router.post("/uploadDocument", upload.single("file"), async (req, res) => {
  const {
    caseID,
    comment = "Uploaded from mailer list",
    fileCategoryID = 1,
  } = req.body;
  const file = req.file;

  if (!file || !caseID) {
    return res.status(400).json({ error: "File and CaseID are required." });
  }

  try {
    const formData = new FormData();
    formData.append("file", file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });

    // 🧠 Query string instead of headers for metadata
    const url = `https://taxag.irslogics.com/publicapi/2020-02-22/documents/casedocument?apikey=${
      process.env.LOGICS_API_KEY
    }&CaseID=${caseID}&Comment=${encodeURIComponent(
      comment
    )}&FileCategoryID=${fileCategoryID}`;

    const response = await axios.post(url, formData, {
      headers: {
        ...formData.getHeaders(),
      },
    });

    return res.json({ success: true, data: response.data });
  } catch (error) {
    console.error("Error uploading to Logics:", error.response?.data || error);
    return res.status(500).json({ error: "Upload failed" });
  }
});

module.exports = router;
