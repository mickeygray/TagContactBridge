// components/clientBridge/metrics/MetricsDashboard.js
// Placeholder — will aggregate data from ContactActivity, LeadCadence, Prospect, Client
import React from "react";

export default function MetricsDashboard() {
  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Metrics</h1>
      </div>

      <div className="card" style={{ textAlign: "center", padding: 60 }}>
        <div style={{ fontSize: 48, marginBottom: 16, color: "var(--accent-terminal)" }}>
          &#9776;
        </div>
        <div style={{ fontSize: "var(--text-lg)", fontWeight: 700, marginBottom: 8 }}>
          Metrics Dashboard
        </div>
        <div style={{ color: "var(--text-muted)", maxWidth: 500, margin: "0 auto", lineHeight: 1.6 }}>
          Daily operations dashboard aggregating call volume, lead quality,
          conversion rates, revenue pipeline, and agent performance.
          Data sources: ContactActivity, LeadCadence, Prospect, Client,
          CallRail, and Logics CRM.
        </div>

        <div className="stats-grid" style={{ marginTop: 32 }}>
          <div className="stat-box">
            <div className="stat-value" style={{ color: "var(--accent-blue)" }}>--</div>
            <div className="stat-label">Calls Today</div>
          </div>
          <div className="stat-box">
            <div className="stat-value" style={{ color: "var(--accent-green)" }}>--</div>
            <div className="stat-label">New Leads</div>
          </div>
          <div className="stat-box">
            <div className="stat-value" style={{ color: "var(--accent-yellow)" }}>--</div>
            <div className="stat-label">Conversions</div>
          </div>
          <div className="stat-box">
            <div className="stat-value" style={{ color: "var(--accent-purple)" }}>--</div>
            <div className="stat-label">Avg Score</div>
          </div>
        </div>
      </div>
    </div>
  );
}
