// ringBridge/services/dailyReportService.js
// ─────────────────────────────────────────────────────────────
// Daily vendor lead quality report for WYNN outbound calls.
//
// CSV attachment: clean numeric data for Excel (no prose).
// Email body: rich HTML with summaries, red flags, details.
//
// Cron: runs daily at configurable hour (default 7 PM CT).
// Also triggerable via POST /api/admin/report/send
// ─────────────────────────────────────────────────────────────

const sendEmail = require("../../utils/sendEmail");
const ContactActivity = require("../models/ContactActivity");
const log = require("../utils/logger");

// ─── Config ──────────────────────────────────────────────────

const REPORT_TO_EMAILS = (process.env.RB_REPORT_TO || "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);
const REPORT_CRON_HOUR = parseInt(process.env.RB_REPORT_HOUR) || 19;
const REPORT_CRON_MINUTE = parseInt(process.env.RB_REPORT_MINUTE) || 0;
const TIMEZONE = process.env.RB_REPORT_TZ || "America/Chicago";

// ─── Cron ────────────────────────────────────────────────────
// Interval-based — checks every minute. No extra dependency.

let lastReportDate = null;

function startCron() {
  log.info(
    `[Report] Scheduled ${REPORT_CRON_HOUR}:${String(REPORT_CRON_MINUTE).padStart(2, "0")} ${TIMEZONE} → ${REPORT_TO_EMAILS.join(", ")}`,
  );

  setInterval(() => {
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: TIMEZONE }),
    );
    const today = now.toISOString().split("T")[0];

    if (
      now.getHours() === REPORT_CRON_HOUR &&
      now.getMinutes() === REPORT_CRON_MINUTE &&
      lastReportDate !== today
    ) {
      lastReportDate = today;
      log.info("[Report] Cron triggered");
      generateAndSend().catch((err) =>
        log.error(`[Report] Failed: ${err.message}`),
      );
    }
  }, 60000);
}

// ─── Main ────────────────────────────────────────────────────

async function generateAndSend(options = {}) {
  const { dateOverride = null, recipients = null } = options;

  const toEmails = recipients || REPORT_TO_EMAILS;
  if (toEmails.length === 0)
    throw new Error("No recipients (set RB_REPORT_TO)");

  // Report date
  const reportDate =
    dateOverride ||
    new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }))
      .toISOString()
      .split("T")[0];

  const dayStart = new Date(`${reportDate}T00:00:00`);
  const dayEnd = new Date(`${reportDate}T23:59:59.999`);

  log.info(`[Report] Building for ${reportDate}...`);

  // Query
  const scored = await ContactActivity.find({
    direction: "Outbound",
    "caseMatch.domain": "WYNN",
    createdAt: { $gte: dayStart, $lte: dayEnd },
    "callScore.overall": { $exists: true, $ne: null },
  })
    .sort({ createdAt: 1 })
    .lean();

  const unscored = await ContactActivity.find({
    direction: "Outbound",
    "caseMatch.domain": "WYNN",
    createdAt: { $gte: dayStart, $lte: dayEnd },
    $or: [
      { "callScore.overall": { $exists: false } },
      { "callScore.overall": null },
    ],
  })
    .sort({ createdAt: 1 })
    .lean();

  if (scored.length === 0 && unscored.length === 0) {
    log.info(`[Report] No WYNN outbound calls on ${reportDate}`);
    return { sent: false, reason: "No calls" };
  }

  // Sort scored calls by source name, then by time within each source
  scored.sort((a, b) => {
    const srcA = a.caseMatch?.sourceName || "";
    const srcB = b.caseMatch?.sourceName || "";
    if (srcA !== srcB) return srcA.localeCompare(srcB);
    return (a.callStartTime || a.createdAt) - (b.callStartTime || b.createdAt);
  });

  const stats = computeStats(scored);
  const html = buildHTML(reportDate, scored, unscored, stats);
  const csv = buildCSV(scored);

  const csvBuffer = Buffer.from(csv);

  for (const recipient of toEmails) {
    await sendEmail({
      to: recipient,
      from: "mgray@taxadvocategroup.com",
      subject: `Lead Quality Report — ${reportDate} | ${scored.length} calls, avg ${stats.avgScore}/10`,
      html,
      text: `Vendor Lead Quality Report — ${reportDate}\n${scored.length} scored calls, avg ${stats.avgScore}/10\nSee attached CSV.`,
      domain: "WYNN",
      attachments: [
        {
          filename: `vendor-lead-scores-${reportDate}.csv`,
          content: csvBuffer,
          contentType: "text/csv",
        },
      ],
    });
  }
  // Archive scored calls so the live dashboard clears
  try {
    const archiveResult = await ContactActivity.updateMany(
      {
        direction: "Outbound",
        "transcription.status": "completed",
        "callScore.overall": { $exists: true },
        archivedAt: { $exists: false },
        createdAt: { $lte: endOfDay },
      },
      { $set: { archivedAt: new Date() } },
    );
    log.info(
      `[REPORT] Archived ${archiveResult.modifiedCount} scored calls after report`,
    );
  } catch (archiveErr) {
    log.warn(`[REPORT] Archive after send failed: ${archiveErr.message}`);
  }
  log.success(
    `[Report] Sent to ${toEmails.join(", ")} — ${scored.length} scored, ${unscored.length} unscored`,
  );

  return {
    sent: true,
    date: reportDate,
    recipients: toEmails,
    scored: scored.length,
    unscored: unscored.length,
    avgScore: stats.avgScore,
  };
}

// ─── Stats ───────────────────────────────────────────────────

function computeStats(calls) {
  if (calls.length === 0) {
    return {
      avgScore: "0.0",
      verdicts: {},
      avgDuration: 0,
      totalCalls: 0,
      dimensions: {},
      answered: 0,
      voicemail: 0,
    };
  }

  const scores = calls.map((c) => c.callScore?.overall || 0);
  const avgScore = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(
    1,
  );

  const verdicts = {};
  calls.forEach((c) => {
    const v = c.callScore?.lead_verdict || "unknown";
    verdicts[v] = (verdicts[v] || 0) + 1;
  });

  const dims = [
    "contactability",
    "legitimacy",
    "tax_issue_present",
    "interest_level",
    "qualification",
  ];
  const dimensions = {};
  dims.forEach((d) => {
    const vals = calls
      .map((c) => c.callScore?.dimensions?.[d]?.score)
      .filter((v) => v != null);
    dimensions[d] =
      vals.length > 0
        ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
        : "—";
  });

  const durations = calls.map((c) => c.durationSeconds || 0);
  const avgDuration = Math.round(
    durations.reduce((a, b) => a + b, 0) / durations.length,
  );

  const answered = calls.filter(
    (c) => c.callScore?.key_details?.answered === true,
  ).length;
  const voicemail = calls.filter(
    (c) => c.callScore?.key_details?.voicemail === true,
  ).length;

  return {
    avgScore,
    verdicts,
    avgDuration,
    totalCalls: calls.length,
    dimensions,
    answered,
    voicemail,
  };
}

// ─── CSV — clean, numeric, Excel-friendly ────────────────────
// NO prose, NO multi-sentence fields. Just filterable data.

function buildCSV(calls) {
  const headers = [
    "Date",
    "Time",
    "Agent",
    "Phone",
    "Duration_Sec",
    "Score",
    "Verdict",
    "Disposition",
    "Contactability",
    "Legitimacy",
    "Tax_Issue",
    "Interest",
    "Qualification",
    "Answered",
    "Voicemail",
    "Tax_Type",
    "Willing_To_Proceed",
    "Case_ID",
    "Case_Name",
    "Source",
    "Red_Flag_Count",
  ];

  const rows = calls.map((a) => {
    const dt = a.callStartTime
      ? new Date(a.callStartTime)
      : new Date(a.createdAt);
    const s = a.callScore || {};
    const d = s.dimensions || {};
    const k = s.key_details || {};
    return [
      dt.toLocaleDateString("en-US"),
      dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      a.agentName || "",
      a.phoneFormatted || a.phone || "",
      a.durationSeconds || 0,
      s.overall || "",
      s.lead_verdict || "",
      a.disposition || "",
      d.contactability?.score || "",
      d.legitimacy?.score || "",
      d.tax_issue_present?.score || "",
      d.interest_level?.score || "",
      d.qualification?.score || "",
      k.answered ? "Y" : "N",
      k.voicemail ? "Y" : "N",
      k.tax_type || "",
      k.willing_to_proceed || "",
      a.caseMatch?.caseId || "",
      csvSafe(a.caseMatch?.name || ""),
      csvSafe(a.caseMatch?.sourceName || ""),
      (s.red_flags || []).length,
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

// Only escape if absolutely needed — keeps CSV clean
function csvSafe(val) {
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""').replace(/\n/g, " ")}"`;
  }
  return s;
}

// ─── HTML Email — rich narrative detail ──────────────────────

function buildHTML(date, scored, unscored, stats) {
  const vc = {
    hot: "#22c55e",
    warm: "#f59e0b",
    cold: "#3b82f6",
    dead: "#6b7280",
    fake: "#ef4444",
    unknown: "#9ca3af",
  };

  // Header stats
  const verdictBadges = Object.entries(stats.verdicts)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([v, n]) =>
        `<span style="display:inline-block;padding:4px 12px;border-radius:4px;background:${vc[v] || "#6b7280"}18;color:${vc[v] || "#6b7280"};font-weight:700;font-size:14px;margin:2px 4px;">${v.toUpperCase()} ${n}</span>`,
    )
    .join("");

  const scoreColor =
    parseFloat(stats.avgScore) >= 7
      ? "#22c55e"
      : parseFloat(stats.avgScore) >= 4
        ? "#f59e0b"
        : "#ef4444";

  // Call detail rows — each one gets the full summary + red flags
  const callBlocks = scored
    .map((a) => {
      const s = a.callScore || {};
      const d = s.dimensions || {};
      const k = s.key_details || {};
      const time = a.callStartTime
        ? new Date(a.callStartTime).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            timeZone: "America/Chicago",
          })
        : "—";
      const sc =
        (s.overall || 0) >= 7
          ? "#22c55e"
          : (s.overall || 0) >= 4
            ? "#f59e0b"
            : "#ef4444";
      const verdictColor = vc[s.lead_verdict] || "#6b7280";

      const redFlagHTML =
        (s.red_flags || []).length > 0
          ? `<div style="margin-top:6px;padding:6px 10px;background:#fef2f2;border-radius:4px;border-left:3px solid #ef4444;font-size:12px;color:#b91c1c;">${(s.red_flags || []).map((f) => `⚠ ${esc(f)}`).join("<br>")}</div>`
          : "";

      const detailPills = [
        k.answered ? "✅ Answered" : "❌ No Answer",
        k.voicemail ? "📱 Voicemail" : null,
        k.tax_type ? `Tax: ${k.tax_type.toUpperCase()}` : null,
        k.tax_amount_mentioned ? `Owes: ${esc(k.tax_amount_mentioned)}` : null,
        k.willing_to_proceed && k.willing_to_proceed !== "n/a"
          ? `Proceed: ${k.willing_to_proceed}`
          : null,
      ]
        .filter(Boolean)
        .map(
          (p) =>
            `<span style="display:inline-block;padding:2px 8px;border-radius:3px;background:#f3f4f6;font-size:11px;color:#4b5563;margin:2px 3px;">${p}</span>`,
        )
        .join("");

      return `
    <div style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:12px;overflow:hidden;">
      <!-- Call header -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#f9fafb;border-bottom:1px solid #e5e7eb;">
        <div>
          <span style="font-weight:700;font-size:14px;color:#111;">${esc(a.agentName || "—")}</span>
          <span style="color:#6b7280;font-size:13px;margin-left:8px;">${time}</span>
          <span style="font-family:monospace;font-size:13px;color:#374151;margin-left:12px;">${esc(a.phoneFormatted || a.phone || "—")}</span>
          <span style="color:#9ca3af;font-size:12px;margin-left:8px;">${formatDur(a.durationSeconds)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-weight:800;font-size:22px;color:${sc};">${s.overall || "—"}</span>
          <span style="display:inline-block;padding:3px 10px;border-radius:4px;background:${verdictColor}18;color:${verdictColor};font-weight:700;font-size:12px;text-transform:uppercase;">${esc(s.lead_verdict || "—")}</span>
        </div>
      </div>
      <!-- Summary -->
      <div style="padding:12px 16px;">
        <div style="font-size:13px;color:#374151;line-height:1.5;">${esc(s.summary || "No summary available.")}</div>
        ${redFlagHTML}
        <!-- Dimension scores -->
        <div style="margin-top:10px;display:flex;gap:4px;flex-wrap:wrap;">
          ${dimPill("Contact", d.contactability?.score)}
          ${dimPill("Legit", d.legitimacy?.score)}
          ${dimPill("Tax Issue", d.tax_issue_present?.score)}
          ${dimPill("Interest", d.interest_level?.score)}
          ${dimPill("Qualified", d.qualification?.score)}
        </div>
        <!-- Detail pills -->
        <div style="margin-top:6px;">${detailPills}</div>
        ${a.caseMatch?.caseId ? `<div style="margin-top:6px;font-size:11px;color:#9ca3af;">Logics: WYNN #${a.caseMatch.caseId} — ${esc(a.caseMatch.name || "")} | Source: ${esc(a.caseMatch.sourceName || "—")}</div>` : ""}
      </div>
    </div>`;
    })
    .join("");

  // Unscored calls (short list)
  let unscoredHTML = "";
  if (unscored.length > 0) {
    const unscoredRows = unscored
      .map((a) => {
        const time = a.callStartTime
          ? new Date(a.callStartTime).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              timeZone: "America/Chicago",
            })
          : "—";
        const reason = a.transcription?.status || "not processed";
        return `<tr>
        <td style="padding:6px 8px;font-size:12px;color:#6b7280;">${time}</td>
        <td style="padding:6px 8px;font-size:12px;">${esc(a.agentName || "—")}</td>
        <td style="padding:6px 8px;font-size:12px;font-family:monospace;">${esc(a.phoneFormatted || a.phone || "—")}</td>
        <td style="padding:6px 8px;font-size:12px;">${formatDur(a.durationSeconds)}</td>
        <td style="padding:6px 8px;font-size:12px;color:#9ca3af;">${esc(reason)}</td>
      </tr>`;
      })
      .join("");

    unscoredHTML = `
    <div style="margin-top:24px;">
      <h3 style="font-size:14px;color:#6b7280;margin-bottom:8px;">Unscored Calls (${unscored.length})</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;">
        <tr style="background:#f9fafb;">
          <th style="padding:8px;text-align:left;font-size:11px;color:#9ca3af;text-transform:uppercase;">Time</th>
          <th style="padding:8px;text-align:left;font-size:11px;color:#9ca3af;text-transform:uppercase;">Agent</th>
          <th style="padding:8px;text-align:left;font-size:11px;color:#9ca3af;text-transform:uppercase;">Phone</th>
          <th style="padding:8px;text-align:left;font-size:11px;color:#9ca3af;text-transform:uppercase;">Duration</th>
          <th style="padding:8px;text-align:left;font-size:11px;color:#9ca3af;text-transform:uppercase;">Reason</th>
        </tr>
        ${unscoredRows}
      </table>
    </div>`;
  }

  return `
  <!DOCTYPE html>
  <html><head><meta charset="utf-8"></head>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f3f4f6;margin:0;padding:20px;">
    <div style="max-width:700px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

      <!-- Banner -->
      <div style="background:#0f172a;padding:20px 24px;">
        <div style="font-size:18px;font-weight:700;color:#fff;">Vendor Lead Quality Report</div>
        <div style="font-size:13px;color:#94a3b8;margin-top:2px;">${date} — Wynn Tax Solutions</div>
      </div>

      <!-- Summary stats -->
      <div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="text-align:center;padding:8px;">
              <div style="font-size:36px;font-weight:800;color:${scoreColor};">${stats.avgScore}</div>
              <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Avg Score</div>
            </td>
            <td style="text-align:center;padding:8px;">
              <div style="font-size:36px;font-weight:800;color:#111;">${stats.totalCalls}</div>
              <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Scored</div>
            </td>
            <td style="text-align:center;padding:8px;">
              <div style="font-size:36px;font-weight:800;color:#111;">${stats.answered}</div>
              <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Answered</div>
            </td>
            <td style="text-align:center;padding:8px;">
              <div style="font-size:36px;font-weight:800;color:#111;">${formatDur(stats.avgDuration)}</div>
              <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Avg Duration</div>
            </td>
          </tr>
        </table>

        <!-- Verdicts -->
        <div style="margin-top:12px;text-align:center;">${verdictBadges}</div>

        <!-- Dimension averages -->
        <div style="margin-top:12px;display:flex;justify-content:center;gap:6px;flex-wrap:wrap;">
          ${dimPill("Contact", stats.dimensions.contactability)}
          ${dimPill("Legit", stats.dimensions.legitimacy)}
          ${dimPill("Tax Issue", stats.dimensions.tax_issue_present)}
          ${dimPill("Interest", stats.dimensions.interest_level)}
          ${dimPill("Qualified", stats.dimensions.qualification)}
        </div>
      </div>

      <!-- Call details -->
      <div style="padding:20px 24px;">
        <h3 style="font-size:14px;color:#374151;margin-bottom:12px;">Scored Calls (${scored.length})</h3>
        ${callBlocks}
        ${unscoredHTML}
      </div>

      <!-- Footer -->
      <div style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
        <div style="font-size:11px;color:#9ca3af;">RingBridge — Automated Vendor Lead Quality Report</div>
        <div style="font-size:11px;color:#d1d5db;margin-top:2px;">CSV data attached for Excel analysis</div>
      </div>
    </div>
  </body></html>`;
}

// ─── Helpers ─────────────────────────────────────────────────

function dimPill(label, score) {
  if (score == null || score === "—")
    return `<span style="display:inline-block;padding:3px 8px;border-radius:4px;background:#f3f4f6;font-size:11px;color:#9ca3af;">${label}: —</span>`;
  const n = parseFloat(score);
  const color = n >= 7 ? "#22c55e" : n >= 4 ? "#f59e0b" : "#ef4444";
  return `<span style="display:inline-block;padding:3px 8px;border-radius:4px;background:${color}12;font-size:11px;"><span style="color:#6b7280;">${label}:</span> <span style="font-weight:700;color:${color};">${score}</span></span>`;
}

function formatDur(s) {
  if (!s) return "0:00";
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = {
  startCron,
  generateAndSend,
};
