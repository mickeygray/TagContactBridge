// clientBridge/services/metricsService.js
// ─────────────────────────────────────────────────────────────
// Aggregates data from MongoDB collections, Logics CRM, and
// CallRail for the daily/date-range metrics dashboard.
//
// Data sources:
//   1. LeadCadence (MongoDB) — lead intake volume, source, cadence
//   2. ContactActivity (MongoDB) — calls, scoring, agent performance
//   3. Client (MongoDB) — payments, case lifecycle
//   4. Logics CRM API — case creation, initial payments (per-case)
//   5. CallRail API — call tracking, attribution
//   6. Mail house data — CSV import (stored as DailyMailStats)
//
// All queries accept { startDate, endDate, company } filters.
// ─────────────────────────────────────────────────────────────

const mongoose = require("mongoose");
const LeadCadence = require("../../shared/models/LeadCadence");
const Client = require("../../shared/models/Client");
const axios = require("axios");

// ContactActivity is registered under RB_ContactActivity
const ContactActivity = mongoose.models.RB_ContactActivity ||
  require("../../shared/models/ContactActivity");

// ─── Mail House Stats Schema (CSV import target) ─────────────
const dailyMailStatsSchema = new mongoose.Schema({
  date: { type: Date, required: true, index: true },
  company: { type: String, index: true },
  mailsSent: { type: Number, default: 0 },
  mailsReturned: { type: Number, default: 0 },
  ncoa: { type: Number, default: 0 },
  cost: { type: Number, default: 0 },
  source: { type: String, default: "mailhouse" },
  meta: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

dailyMailStatsSchema.index({ date: 1, company: 1 }, { unique: true });
const DailyMailStats = mongoose.models.DailyMailStats ||
  mongoose.model("DailyMailStats", dailyMailStatsSchema);

// ─── Date helpers ────────────────────────────────────────────

function buildDateRange(startDate, endDate) {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  return { $gte: start, $lte: end };
}

// ─── Lead Metrics ────────────────────────────────────────────

async function getLeadMetrics({ startDate, endDate, company }) {
  const dateFilter = buildDateRange(startDate, endDate);
  const match = { createdAt: dateFilter };
  if (company) match.company = company;

  const [total, bySource, byCompany, qualityBreakdown, cadenceStats] = await Promise.all([
    LeadCadence.countDocuments(match),

    LeadCadence.aggregate([
      { $match: match },
      { $group: { _id: "$source", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),

    LeadCadence.aggregate([
      { $match: match },
      { $group: { _id: "$company", count: { $sum: 1 } } },
    ]),

    LeadCadence.aggregate([
      { $match: match },
      { $group: {
        _id: null,
        total: { $sum: 1 },
        phoneValid: { $sum: { $cond: ["$phoneConnected", 1, 0] } },
        emailValid: { $sum: { $cond: ["$emailValid", 1, 0] } },
        day0Connected: { $sum: { $cond: ["$day0Connected", 1, 0] } },
        dnc: { $sum: { $cond: ["$smsDnc", 1, 0] } },
        active: { $sum: { $cond: ["$active", 1, 0] } },
      }},
    ]),

    LeadCadence.aggregate([
      { $match: match },
      { $group: {
        _id: null,
        avgTexts: { $avg: "$textsSent" },
        avgEmails: { $avg: "$emailsSent" },
        avgRvms: { $avg: "$rvmsSent" },
        avgCalls: { $avg: "$callsMade" },
        totalTexts: { $sum: "$textsSent" },
        totalEmails: { $sum: "$emailsSent" },
        totalRvms: { $sum: "$rvmsSent" },
        totalCalls: { $sum: "$callsMade" },
      }},
    ]),
  ]);

  return {
    total,
    bySource,
    byCompany,
    quality: qualityBreakdown[0] || {},
    cadence: cadenceStats[0] || {},
  };
}

// ─── Call Metrics ────────────────────────────────────────────

async function getCallMetrics({ startDate, endDate, company }) {
  const dateFilter = buildDateRange(startDate, endDate);
  const match = { createdAt: dateFilter };
  if (company) match["caseMatch.domain"] = company;

  const [summary, byAgent, bySource, byVerdict, byDirection, dailyVolume] = await Promise.all([
    ContactActivity.aggregate([
      { $match: match },
      { $group: {
        _id: null,
        totalCalls: { $sum: 1 },
        avgDuration: { $avg: "$durationSeconds" },
        avgScore: { $avg: "$callScore.overall" },
        scored: { $sum: { $cond: [{ $gt: ["$callScore.overall", null] }, 1, 0] } },
        matched: { $sum: { $cond: [{ $eq: ["$enrichmentStatus", "matched"] }, 1, 0] } },
      }},
    ]),

    ContactActivity.aggregate([
      { $match: match },
      { $group: {
        _id: "$agentName",
        calls: { $sum: 1 },
        avgDuration: { $avg: "$durationSeconds" },
        avgScore: { $avg: "$callScore.overall" },
        answered: { $sum: { $cond: ["$callScore.key_details.answered", 1, 0] } },
      }},
      { $sort: { calls: -1 } },
    ]),

    ContactActivity.aggregate([
      { $match: { ...match, "caseMatch.sourceName": { $exists: true } } },
      { $group: {
        _id: "$caseMatch.sourceName",
        calls: { $sum: 1 },
        avgScore: { $avg: "$callScore.overall" },
        hot: { $sum: { $cond: [{ $eq: ["$callScore.lead_verdict", "hot"] }, 1, 0] } },
        dead: { $sum: { $cond: [{ $eq: ["$callScore.lead_verdict", "dead"] }, 1, 0] } },
      }},
      { $sort: { calls: -1 } },
    ]),

    ContactActivity.aggregate([
      { $match: { ...match, "callScore.lead_verdict": { $exists: true } } },
      { $group: { _id: "$callScore.lead_verdict", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),

    ContactActivity.aggregate([
      { $match: match },
      { $group: { _id: "$direction", count: { $sum: 1 } } },
    ]),

    ContactActivity.aggregate([
      { $match: match },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        calls: { $sum: 1 },
        avgScore: { $avg: "$callScore.overall" },
        avgDuration: { $avg: "$durationSeconds" },
      }},
      { $sort: { _id: 1 } },
    ]),
  ]);

  return {
    summary: summary[0] || {},
    byAgent,
    bySource,
    byVerdict,
    byDirection,
    dailyVolume,
  };
}

// ─── Client / Revenue Metrics ────────────────────────────────

async function getClientMetrics({ startDate, endDate, company }) {
  const match = {};
  if (company) match.domain = company;

  // saleDate is stored as Date — filter on it for the date range
  if (startDate && endDate) {
    match.saleDate = buildDateRange(startDate, endDate);
  }

  const [newClients, byStatus, revenue, byDomain] = await Promise.all([
    Client.countDocuments(match),

    Client.aggregate([
      { $match: match },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),

    Client.aggregate([
      { $match: match },
      { $group: {
        _id: null,
        totalInitialPayments: { $sum: "$initialPayment" },
        avgInitialPayment: { $avg: "$initialPayment" },
        totalPayments: { $sum: "$totalPayment" },
        avgInvoiceCount: { $avg: "$invoiceCount" },
        totalDelinquent: { $sum: "$delinquentAmount" },
      }},
    ]),

    Client.aggregate([
      { $match: match },
      { $group: {
        _id: "$domain",
        count: { $sum: 1 },
        revenue: { $sum: "$totalPayment" },
        avgInitial: { $avg: "$initialPayment" },
      }},
    ]),
  ]);

  return {
    newClients,
    byStatus,
    revenue: revenue[0] || {},
    byDomain,
  };
}

// ─── Mail House Stats ────────────────────────────────────────

async function getMailMetrics({ startDate, endDate, company }) {
  const match = {};
  if (startDate && endDate) match.date = buildDateRange(startDate, endDate);
  if (company) match.company = company;

  const [summary, daily] = await Promise.all([
    DailyMailStats.aggregate([
      { $match: match },
      { $group: {
        _id: null,
        totalSent: { $sum: "$mailsSent" },
        totalReturned: { $sum: "$mailsReturned" },
        totalCost: { $sum: "$cost" },
        totalNcoa: { $sum: "$ncoa" },
        days: { $sum: 1 },
      }},
    ]),
    DailyMailStats.find(match).sort({ date: 1 }).lean(),
  ]);

  return {
    summary: summary[0] || {},
    daily,
  };
}

async function importMailStats(rows) {
  // rows: [{ date, company, mailsSent, mailsReturned, ncoa, cost }]
  const ops = rows.map((r) => ({
    updateOne: {
      filter: { date: new Date(r.date), company: r.company || "WYNN" },
      update: { $set: r },
      upsert: true,
    },
  }));
  const result = await DailyMailStats.bulkWrite(ops);
  return { upserted: result.upsertedCount, modified: result.modifiedCount };
}

// ─── CallRail Call Data ──────────────────────────────────────

async function getCallRailMetrics({ startDate, endDate, company }) {
  const config = require("../../shared/config/companyConfig").getCompanyConfig(company || "TAG");
  const accountId = config.callrailAccountId;
  const apiKey = config.callrailKey;

  if (!accountId || !apiKey) return { calls: [], error: "CallRail not configured for this company" };

  try {
    const params = {
      date_range: "custom",
      start_date: startDate,
      end_date: endDate,
      per_page: 250,
      fields: "id,answered,duration,direction,tracking_phone_number,source_name,start_time,customer_phone_number",
    };
    if (config.callrailCompanyId) params.company_id = config.callrailCompanyId;

    const res = await axios.get(
      `https://api.callrail.com/v3/a/${accountId}/calls.json`,
      { headers: { Authorization: `Token token=${apiKey}` }, params }
    );

    const calls = res.data?.calls || [];
    return {
      total: calls.length,
      answered: calls.filter((c) => c.answered).length,
      avgDuration: calls.length > 0
        ? Math.round(calls.reduce((s, c) => s + (c.duration || 0), 0) / calls.length)
        : 0,
      bySource: groupBy(calls, "source_name"),
      calls,
    };
  } catch (err) {
    return { calls: [], error: err.message };
  }
}

function groupBy(arr, key) {
  const map = {};
  for (const item of arr) {
    const k = item[key] || "Unknown";
    map[k] = (map[k] || 0) + 1;
  }
  return Object.entries(map).map(([_id, count]) => ({ _id, count })).sort((a, b) => b.count - a.count);
}

// ─── Combined Daily Snapshot ─────────────────────────────────

async function getDailySnapshot({ startDate, endDate, company }) {
  const params = { startDate, endDate, company };

  const [leads, calls, clients, mail, callrail] = await Promise.all([
    getLeadMetrics(params),
    getCallMetrics(params),
    getClientMetrics(params),
    getMailMetrics(params),
    getCallRailMetrics(params).catch(() => ({ calls: [], error: "CallRail unavailable" })),
  ]);

  return { leads, calls, clients, mail, callrail, dateRange: { startDate, endDate, company } };
}

module.exports = {
  getLeadMetrics,
  getCallMetrics,
  getClientMetrics,
  getMailMetrics,
  getCallRailMetrics,
  getDailySnapshot,
  importMailStats,
  DailyMailStats,
};
