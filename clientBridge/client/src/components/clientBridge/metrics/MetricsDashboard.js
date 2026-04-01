// components/clientBridge/metrics/MetricsDashboard.js
// ─────────────────────────────────────────────────────────────
// Daily operations snapshot — stretches across any date range.
// Data: leads, calls, clients/revenue, mail, CallRail attribution.
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useRef } from "react";
import { useMetrics } from "../../../hooks/useMetrics";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#00d4ff", "#6b7280"];
const VERDICT_COLORS = { hot: "#22c55e", warm: "#f59e0b", cold: "#3b82f6", dead: "#6b7280", fake: "#ef4444" };

const chartTooltipStyle = {
  contentStyle: { background: "#12171f", border: "1px solid #1e2530", borderRadius: 6, fontSize: 12 },
  labelStyle: { color: "#c5cdd8" },
};

export default function MetricsDashboard() {
  const { snapshot, loading, dateRange, setDateRange, fetchSnapshot, importMailCSV } = useMetrics();
  const fileRef = useRef(null);

  useEffect(() => {
    fetchSnapshot(dateRange);
  }, []); // eslint-disable-line

  const handleFetch = () => fetchSnapshot(dateRange);

  const handleMailImport = (e) => {
    if (e.target.files?.[0]) {
      importMailCSV(e.target.files[0]).then(() => fetchSnapshot(dateRange));
    }
  };

  // Quick date presets
  const setPreset = (days) => {
    const end = new Date().toISOString().split("T")[0];
    const start = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
    setDateRange({ startDate: start, endDate: end });
    fetchSnapshot({ startDate: start, endDate: end, company: dateRange.company });
  };

  const s = snapshot || {};

  return (
    <div className="dashboard">
      {/* Header + Date Controls */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="dashboard-title" style={{ marginRight: "auto" }}>Metrics</span>

          <button className="btn btn-sm" onClick={() => setPreset(0)}>Today</button>
          <button className="btn btn-sm" onClick={() => setPreset(7)}>7d</button>
          <button className="btn btn-sm" onClick={() => setPreset(30)}>30d</button>
          <button className="btn btn-sm" onClick={() => setPreset(90)}>90d</button>

          <input type="date" value={dateRange.startDate}
            onChange={(e) => setDateRange({ startDate: e.target.value })}
            style={{ width: 140 }} />
          <input type="date" value={dateRange.endDate}
            onChange={(e) => setDateRange({ endDate: e.target.value })}
            style={{ width: 140 }} />
          <select value={dateRange.company || ""}
            onChange={(e) => setDateRange({ company: e.target.value })}
            style={{ width: 120 }}>
            <option value="">All</option>
            <option value="TAG">TAG</option>
            <option value="WYNN">WYNN</option>
          </select>
          <button className="btn btn-solid btn-sm" onClick={handleFetch} disabled={loading}>
            {loading ? "Loading..." : "Go"}
          </button>

          <input type="file" accept=".csv" ref={fileRef} onChange={handleMailImport}
            style={{ display: "none" }} />
          <button className="btn btn-sm btn-purple" onClick={() => fileRef.current?.click()}>
            Import Mail CSV
          </button>
        </div>
      </div>

      {loading && !snapshot && (
        <div className="card" style={{ textAlign: "center", padding: 60 }}>
          <div className="spinner" style={{ margin: "0 auto" }} />
        </div>
      )}

      {snapshot && (
        <>
          {/* Top-line KPIs */}
          <div className="stats-grid" style={{ gridTemplateColumns: "repeat(6, 1fr)", marginBottom: 16 }}>
            <StatBox label="New Leads" value={s.leads?.total || 0} color="var(--accent-blue)" />
            <StatBox label="Total Calls" value={s.calls?.summary?.totalCalls || 0} color="var(--accent-cyan)" />
            <StatBox label="Avg Score" value={(s.calls?.summary?.avgScore || 0).toFixed(1)} color="var(--accent-yellow)" />
            <StatBox label="New Clients" value={s.clients?.newClients || 0} color="var(--accent-green)" />
            <StatBox label="Initial Payments" value={`$${(s.clients?.revenue?.totalInitialPayments || 0).toLocaleString()}`} color="var(--accent-terminal)" />
            <StatBox label="Mail Sent" value={s.mail?.summary?.totalSent || 0} color="var(--accent-purple)" />
          </div>

          <div className="two-col">
            {/* Left column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Daily Call Volume Chart */}
              {s.calls?.dailyVolume?.length > 1 && (
                <div className="card">
                  <div className="card-header"><span className="card-title">Call Volume</span></div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={s.calls.dailyVolume}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2530" />
                      <XAxis dataKey="_id" tick={{ fill: "#5c6775", fontSize: 10 }} />
                      <YAxis tick={{ fill: "#5c6775", fontSize: 10 }} />
                      <Tooltip {...chartTooltipStyle} />
                      <Bar dataKey="calls" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Lead Sources */}
              {s.leads?.bySource?.length > 0 && (
                <div className="card">
                  <div className="card-header"><span className="card-title">Lead Sources</span></div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={s.leads.bySource.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2530" />
                      <XAxis type="number" tick={{ fill: "#5c6775", fontSize: 10 }} />
                      <YAxis type="category" dataKey="_id" tick={{ fill: "#c5cdd8", fontSize: 10 }} width={120} />
                      <Tooltip {...chartTooltipStyle} />
                      <Bar dataKey="count" fill="#22c55e" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Agent Performance */}
              {s.calls?.byAgent?.length > 0 && (
                <div className="card">
                  <div className="card-header"><span className="card-title">Agent Performance</span></div>
                  <table className="table">
                    <thead>
                      <tr><th>Agent</th><th>Calls</th><th>Avg Duration</th><th>Avg Score</th><th>Answered</th></tr>
                    </thead>
                    <tbody>
                      {s.calls.byAgent.map((a) => (
                        <tr key={a._id}>
                          <td style={{ fontWeight: 600 }}>{a._id || "Unknown"}</td>
                          <td>{a.calls}</td>
                          <td>{formatDuration(a.avgDuration)}</td>
                          <td style={{ color: scoreColor(a.avgScore) }}>{(a.avgScore || 0).toFixed(1)}</td>
                          <td>{a.answered || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Right column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Lead Verdict Pie */}
              {s.calls?.byVerdict?.length > 0 && (
                <div className="card">
                  <div className="card-header"><span className="card-title">Lead Verdicts</span></div>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={s.calls.byVerdict} dataKey="count" nameKey="_id" cx="50%" cy="50%"
                        outerRadius={80} innerRadius={40} paddingAngle={2} label={({ _id, count }) => `${_id} (${count})`}>
                        {s.calls.byVerdict.map((v, i) => (
                          <Cell key={v._id} fill={VERDICT_COLORS[v._id] || COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip {...chartTooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Lead Quality */}
              {s.leads?.quality?.total > 0 && (
                <div className="card">
                  <div className="card-header"><span className="card-title">Lead Quality</span></div>
                  <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                    <MiniStat label="Phone Valid" value={pct(s.leads.quality.phoneValid, s.leads.quality.total)} />
                    <MiniStat label="Email Valid" value={pct(s.leads.quality.emailValid, s.leads.quality.total)} />
                    <MiniStat label="Day 0 Connect" value={pct(s.leads.quality.day0Connected, s.leads.quality.total)} />
                    <MiniStat label="Active" value={s.leads.quality.active || 0} />
                    <MiniStat label="DNC" value={s.leads.quality.dnc || 0} />
                    <MiniStat label="Total" value={s.leads.quality.total || 0} />
                  </div>
                </div>
              )}

              {/* Cadence Stats */}
              {s.leads?.cadence?.totalTexts > 0 && (
                <div className="card">
                  <div className="card-header"><span className="card-title">Outreach Totals</span></div>
                  <div className="stats-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                    <MiniStat label="Texts" value={s.leads.cadence.totalTexts || 0} />
                    <MiniStat label="Emails" value={s.leads.cadence.totalEmails || 0} />
                    <MiniStat label="RVMs" value={s.leads.cadence.totalRvms || 0} />
                    <MiniStat label="Calls" value={s.leads.cadence.totalCalls || 0} />
                  </div>
                </div>
              )}

              {/* Revenue by Domain */}
              {s.clients?.byDomain?.length > 0 && (
                <div className="card">
                  <div className="card-header"><span className="card-title">Revenue by Brand</span></div>
                  <table className="table">
                    <thead>
                      <tr><th>Brand</th><th>Clients</th><th>Revenue</th><th>Avg Initial</th></tr>
                    </thead>
                    <tbody>
                      {s.clients.byDomain.map((d) => (
                        <tr key={d._id}>
                          <td><span className="badge badge-blue">{d._id}</span></td>
                          <td>{d.count}</td>
                          <td style={{ color: "var(--accent-terminal)" }}>${(d.revenue || 0).toLocaleString()}</td>
                          <td>${(d.avgInitial || 0).toFixed(0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Source Quality (calls scored by vendor) */}
              {s.calls?.bySource?.length > 0 && (
                <div className="card">
                  <div className="card-header"><span className="card-title">Source Quality</span></div>
                  <table className="table">
                    <thead>
                      <tr><th>Source</th><th>Calls</th><th>Avg Score</th><th>Hot</th><th>Dead</th></tr>
                    </thead>
                    <tbody>
                      {s.calls.bySource.slice(0, 10).map((src) => (
                        <tr key={src._id}>
                          <td style={{ fontSize: "var(--text-xs)" }}>{src._id || "Unknown"}</td>
                          <td>{src.calls}</td>
                          <td style={{ color: scoreColor(src.avgScore) }}>{(src.avgScore || 0).toFixed(1)}</td>
                          <td style={{ color: "var(--accent-green)" }}>{src.hot || 0}</td>
                          <td style={{ color: "var(--accent-red)" }}>{src.dead || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Mail Stats (full width) */}
          {s.mail?.daily?.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header"><span className="card-title">Mail Volume</span></div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={s.mail.daily.map((d) => ({ ...d, date: new Date(d.date).toLocaleDateString() }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2530" />
                  <XAxis dataKey="date" tick={{ fill: "#5c6775", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#5c6775", fontSize: 10 }} />
                  <Tooltip {...chartTooltipStyle} />
                  <Legend />
                  <Line type="monotone" dataKey="mailsSent" stroke="#a855f7" strokeWidth={2} dot={false} name="Sent" />
                  <Line type="monotone" dataKey="mailsReturned" stroke="#ef4444" strokeWidth={2} dot={false} name="Returned" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────

function StatBox({ label, value, color }) {
  return (
    <div className="stat-box">
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div style={{ textAlign: "center", padding: 6 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{value}</div>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

function pct(num, total) {
  if (!total) return "0%";
  return `${Math.round((num / total) * 100)}%`;
}

function formatDuration(seconds) {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function scoreColor(score) {
  if (!score) return "var(--text-muted)";
  if (score >= 7) return "var(--accent-green)";
  if (score >= 4) return "var(--accent-yellow)";
  return "var(--accent-red)";
}
