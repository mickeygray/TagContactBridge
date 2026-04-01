// routes/admin.js
const express = require("express");
const router = express.Router();
const ConsentRecord = require("../../shared/models/ConsentRecord");

// ─── GET /api/admin/consent-records ──────────────────────────
// Search consent records by email, phone, caseId, or date range
// Query params: email, phone, caseId, source, company, from, to, limit
// ─────────────────────────────────────────────────────────────

router.get("/consent-records", async (req, res) => {
  try {
    const {
      email,
      phone,
      caseId,
      source,
      company,
      from,
      to,
      limit = 50,
    } = req.query;

    const query = {};

    if (email) query.email = { $regex: email, $options: "i" };
    if (phone)
      query.phone = { $regex: phone.replace(/\D/g, ""), $options: "i" };
    if (caseId) query.caseId = { $regex: caseId, $options: "i" };
    if (source) query.source = source;
    if (company) query.company = company;

    if (from || to) {
      query.receivedAt = {};
      if (from) query.receivedAt.$gte = new Date(from);
      if (to) query.receivedAt.$lte = new Date(to);
    }

    const records = await ConsentRecord.find(query)
      .sort({ receivedAt: -1 })
      .limit(Math.min(Number(limit), 200))
      .lean();

    res.json({ ok: true, count: records.length, records });
  } catch (err) {
    console.error("[ADMIN] consent-records error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/admin/consent-records/:id ──────────────────────
// Get a single consent record by MongoDB ID
// ─────────────────────────────────────────────────────────────

router.get("/consent-records/:id", async (req, res) => {
  try {
    const record = await ConsentRecord.findById(req.params.id).lean();
    if (!record) return res.status(404).json({ ok: false, error: "Not found" });
    res.json({ ok: true, record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/admin/consent-records/stats ────────────────────
// Summary stats for the vault
// ─────────────────────────────────────────────────────────────

router.get("/consent-stats", async (req, res) => {
  try {
    const total = await ConsentRecord.countDocuments();
    const withTrustedForm = await ConsentRecord.countDocuments({
      trustedFormCertUrl: { $ne: "" },
    });
    const withJornaya = await ConsentRecord.countDocuments({
      jornayaLeadId: { $ne: "" },
    });
    const bySource = await ConsentRecord.aggregate([
      { $group: { _id: "$source", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const byCompany = await ConsentRecord.aggregate([
      { $group: { _id: "$company", count: { $sum: 1 } } },
    ]);

    res.json({
      ok: true,
      stats: {
        total,
        withTrustedForm,
        withJornaya,
        bySource,
        byCompany,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
