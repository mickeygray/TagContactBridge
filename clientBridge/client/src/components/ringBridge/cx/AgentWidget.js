// components/ringBridge/cx/AgentWidget.js
// ─────────────────────────────────────────────────────────────
// Minimal agent-facing widget for CX platform control.
// Two modes:
//   1. Embedded in main dashboard (/dashboard with agent's extensionId)
//   2. Standalone page (/agent/:extensionId) for Chrome extension iframe
//
// Shows:
//   - EX state (on call, available, DND)
//   - CX state (available for leads, unavailable)
//   - Available / Unavailable toggle
//   - DNC / Freeze buttons (after a call)
//   - Last call info
// ─────────────────────────────────────────────────────────────

import React, { useState } from "react";
import { useCxAgent } from "../../../hooks/useCxAgent";

const STATE_COLORS = {
  Available: "var(--accent-green)",
  Unavailable: "var(--accent-yellow)",
  InboundContact: "var(--accent-blue)",
  OutboundContact: "var(--accent-cyan)",
  AfterCallWork: "var(--accent-purple)",
  LoggedOff: "var(--text-muted)",
  OnCall: "var(--accent-blue)",
  Ringing: "var(--accent-yellow)",
  Idle: "var(--accent-green)",
  Unknown: "var(--text-muted)",
};

export default function AgentWidget({ extensionId }) {
  const { status, loading, setAvailable, setUnavailable, markDnc, freezeProspect } = useCxAgent(extensionId);
  const [dncPhone, setDncPhone] = useState("");
  const [showControls, setShowControls] = useState(false);

  if (!extensionId) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}>
        No extension ID — configure agent mapping
      </div>
    );
  }

  if (!status) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}>
        Agent not mapped to CX platform
      </div>
    );
  }

  const isAvailable = status.cxState === "Available" && !status.widgetOverride;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Agent: {status.agentName || extensionId}</span>
        <div className="flex gap-2 items-center">
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: STATE_COLORS[status.cxState] || "var(--text-muted)",
          }} />
          <span className="text-xs text-mono" style={{ color: STATE_COLORS[status.cxState] }}>
            CX: {status.cxState}
          </span>
        </div>
      </div>

      {/* State indicators */}
      <div className="stats-grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 12 }}>
        <div className="stat-box">
          <div className="stat-value" style={{ fontSize: 14, color: STATE_COLORS[status.exState] }}>
            {status.exState || "Unknown"}
          </div>
          <div className="stat-label">EX Status</div>
        </div>
        <div className="stat-box">
          <div className="stat-value" style={{ fontSize: 14, color: STATE_COLORS[status.cxState] }}>
            {status.cxState || "Unknown"}
          </div>
          <div className="stat-label">CX Status</div>
        </div>
      </div>

      {status.widgetOverride && (
        <div style={{
          padding: "6px 10px", marginBottom: 12, borderRadius: "var(--radius-sm)",
          background: "rgba(245, 158, 11, 0.08)", border: "1px solid var(--accent-yellow)",
          fontSize: "var(--text-xs)", color: "var(--accent-yellow)", fontFamily: "var(--font-mono)",
        }}>
          Manual override: {status.widgetOverride}
        </div>
      )}

      {/* Primary toggle */}
      <div className="flex gap-2" style={{ marginBottom: 12 }}>
        <button
          className={`btn ${isAvailable ? "btn-green" : ""}`}
          style={{ flex: 1 }}
          onClick={setAvailable}
          disabled={loading || isAvailable}
        >
          Available
        </button>
        <button
          className={`btn ${!isAvailable ? "btn-yellow" : ""}`}
          style={{ flex: 1 }}
          onClick={setUnavailable}
          disabled={loading || (!isAvailable && status.widgetOverride === "unavailable")}
        >
          Unavailable
        </button>
      </div>

      {/* Lead controls */}
      <button
        className="btn btn-sm w-full"
        onClick={() => setShowControls(!showControls)}
        style={{ marginBottom: showControls ? 12 : 0 }}
      >
        {showControls ? "Hide" : "Lead Controls"}
      </button>

      {showControls && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            type="text"
            placeholder="Phone number"
            value={dncPhone}
            onChange={(e) => setDncPhone(e.target.value)}
            style={{ fontFamily: "var(--font-mono)" }}
          />
          <div className="flex gap-2">
            <button
              className="btn btn-sm btn-red"
              style={{ flex: 1 }}
              onClick={() => { markDnc(dncPhone, "WYNN"); setDncPhone(""); }}
              disabled={!dncPhone || loading}
            >
              DNC
            </button>
            <button
              className="btn btn-sm btn-yellow"
              style={{ flex: 1 }}
              onClick={() => { freezeProspect(dncPhone, "WYNN"); setDncPhone(""); }}
              disabled={!dncPhone || loading}
            >
              Freeze
            </button>
          </div>
          <div className="text-xs text-muted">
            DNC = remove from all contact. Freeze = pause outreach, keep lead active.
          </div>
        </div>
      )}
    </div>
  );
}
