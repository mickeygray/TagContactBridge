// clientBridge/routes/metrics.js
// ─────────────────────────────────────────────────────────────
// Metrics API — date-range queries across all data sources.
// All endpoints require auth. Returns JSON for the React dashboard.
// ─────────────────────────────────────────────────────────────

const express = require("express");
const router = express.Router();
const multer = require("multer");
const Papa = require("papaparse");
const { authMiddleware } = require("../../shared/middleware/authMiddleware");
const {
  getDailySnapshot,
  getLeadMetrics,
  getCallMetrics,
  getClientMetrics,
  getMailMetrics,
  getCallRailMetrics,
  importMailStats,
} = require("../services/metricsService");

router.use(authMiddleware);

// Default date range: today
function defaults(query) {
  const today = new Date().toISOString().split("T")[0];
  return {
    startDate: query.startDate || today,
    endDate: query.endDate || today,
    company: query.company || null,
  };
}

// ─── GET /api/metrics/snapshot ────────────────────────────────
// Full dashboard data in one call
router.get("/snapshot", async (req, res) => {
  try {
    const data = await getDailySnapshot(defaults(req.query));
    res.json(data);
  } catch (err) {
    console.error("[METRICS] snapshot error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Individual data source endpoints ────────────────────────

router.get("/leads", async (req, res) => {
  try { res.json(await getLeadMetrics(defaults(req.query))); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/calls", async (req, res) => {
  try { res.json(await getCallMetrics(defaults(req.query))); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/clients", async (req, res) => {
  try { res.json(await getClientMetrics(defaults(req.query))); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/mail", async (req, res) => {
  try { res.json(await getMailMetrics(defaults(req.query))); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/callrail", async (req, res) => {
  try { res.json(await getCallRailMetrics(defaults(req.query))); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/metrics/mail/import ───────────────────────────
// Upload mail house CSV (from Google Sheets export)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post("/mail/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const csv = Papa.parse(req.file.buffer.toString(), { header: true, skipEmptyLines: true });
    if (csv.errors.length > 0) {
      return res.status(400).json({ error: "CSV parse errors", details: csv.errors.slice(0, 5) });
    }

    // Expect columns: date, company, mailsSent, mailsReturned, ncoa, cost
    const rows = csv.data.map((r) => ({
      date: r.date || r.Date,
      company: (r.company || r.Company || "WYNN").toUpperCase(),
      mailsSent: Number(r.mailsSent || r.sent || r.Sent || 0),
      mailsReturned: Number(r.mailsReturned || r.returned || r.Returned || 0),
      ncoa: Number(r.ncoa || r.NCOA || 0),
      cost: Number(r.cost || r.Cost || 0),
    })).filter((r) => r.date);

    const result = await importMailStats(rows);
    res.json({ ok: true, ...result, rowsProcessed: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
