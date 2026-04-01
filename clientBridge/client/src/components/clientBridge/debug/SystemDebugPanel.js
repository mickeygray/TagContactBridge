// components/clientBridge/debug/SystemDebugPanel.js
// Real-time system log viewer. Connects to SSE stream from all three bridges.
// Errors/warnings auto-surface as toasts. This panel shows the full firehose.

import React, { useState, useEffect } from "react";
import { useSystemLog } from "../../../hooks/useSystemLog";
import { api } from "../../../utils/api";

const LEVEL_COLORS = {
  error: "var(--accent-red)",
  warn: "var(--accent-yellow)",
  info: "var(--accent-blue)",
  debug: "var(--text-muted)",
};

const BRIDGE_COLORS = {
  leadBridge: "var(--accent-green)",
  clientBridge: "var(--accent-cyan)",
  ringBridge: "var(--accent-purple)",
};

export default function SystemDebugPanel() {
  const { logs, connected, clearLogs } = useSystemLog();
  const [filter, setFilter] = useState({ bridge: "", level: "", search: "" });
  const [stats, setStats] = useState(null);
  const [paused, setPaused] = useState(false);
  const [displayLogs, setDisplayLogs] = useState([]);

  // Fetch stats on mount
  useEffect(() => {
    api.get("/api/logs/stats").then((res) => setStats(res.data)).catch(() => {});
  }, []);

  // Apply filters
  useEffect(() => {
    if (paused) return;
    let filtered = logs;
    if (filter.bridge) filtered = filtered.filter((l) => l.bridge === filter.bridge);
    if (filter.level) filtered = filtered.filter((l) => l.level === filter.level);
    if (filter.search) {
      const s = filter.search.toLowerCase();
      filtered = filtered.filter(
        (l) => l.message.toLowerCase().includes(s) || l.category.toLowerCase().includes(s)
      );
    }
    setDisplayLogs(filtered.slice(0, 200));
  }, [logs, filter, paused]);

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1 className="dashboard-title">System Debug</h1>
        <div className="flex gap-2 items-center">
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: connected ? "var(--accent-green)" : "var(--accent-red)",
            display: "inline-block",
          }} />
          <span className="text-xs text-muted text-mono">
            {connected ? "LIVE" : "DISCONNECTED"}
          </span>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="stats-grid" style={{ marginBottom: 16 }}>
          <div className="stat-box">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Total Entries</div>
          </div>
          <div className="stat-box">
            <div className="stat-value" style={{ color: "var(--accent-red)" }}>{stats.errors24h}</div>
            <div className="stat-label">Errors (24h)</div>
          </div>
          {(stats.byLevel || []).map((b) => (
            <div className="stat-box" key={b._id}>
              <div className="stat-value" style={{ color: LEVEL_COLORS[b._id] || "var(--text-primary)" }}>{b.count}</div>
              <div className="stat-label">{(b._id || "unknown").toUpperCase()} (24h)</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="flex gap-3 items-center flex-wrap">
          <select
            value={filter.bridge}
            onChange={(e) => setFilter({ ...filter, bridge: e.target.value })}
            style={{ width: 150 }}
          >
            <option value="">All Bridges</option>
            <option value="leadBridge">leadBridge</option>
            <option value="clientBridge">clientBridge</option>
            <option value="ringBridge">ringBridge</option>
          </select>
          <select
            value={filter.level}
            onChange={(e) => setFilter({ ...filter, level: e.target.value })}
            style={{ width: 120 }}
          >
            <option value="">All Levels</option>
            <option value="error">Error</option>
            <option value="warn">Warn</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
          <input
            type="text"
            placeholder="Search..."
            value={filter.search}
            onChange={(e) => setFilter({ ...filter, search: e.target.value })}
            style={{ flex: 1, minWidth: 150 }}
          />
          <button
            className={`btn btn-sm ${paused ? "btn-yellow" : "btn-blue"}`}
            onClick={() => setPaused(!paused)}
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button className="btn btn-sm" onClick={clearLogs}>Clear</button>
        </div>
      </div>

      {/* Log entries */}
      <div className="card" style={{ padding: 0, maxHeight: "60vh", overflow: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 80 }}>Time</th>
              <th style={{ width: 100 }}>Bridge</th>
              <th style={{ width: 60 }}>Level</th>
              <th style={{ width: 120 }}>Category</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {displayLogs.map((entry, i) => (
              <tr key={`${entry.timestamp}-${i}`}>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                  {formatTime(entry.timestamp)}
                </td>
                <td>
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-xs)",
                    color: BRIDGE_COLORS[entry.bridge] || "var(--text-muted)",
                  }}>
                    {entry.bridge?.replace("Bridge", "")}
                  </span>
                </td>
                <td>
                  <span className="badge" style={{
                    borderColor: LEVEL_COLORS[entry.level],
                    color: LEVEL_COLORS[entry.level],
                    background: `${LEVEL_COLORS[entry.level]}11`,
                  }}>
                    {entry.level}
                  </span>
                </td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>
                  {entry.category}
                </td>
                <td style={{ fontSize: "var(--text-sm)" }}>
                  {entry.message}
                  {entry.data && (
                    <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)", marginLeft: 8 }}>
                      {typeof entry.data === "string" ? entry.data : JSON.stringify(entry.data).slice(0, 100)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {displayLogs.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
                {connected ? "No log entries yet" : "Connecting to log stream..."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
