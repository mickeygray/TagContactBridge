// client/src/components/tools/ringcentral/RingBridgeDashboard.jsx
// ─────────────────────────────────────────────────────────────
// Real-time agent status dashboard.
// Connects to RingBridge SSE at /ringbridge/api/events
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useCallback } from "react";
import "./RingBridgeDashboard.css";

const API = "/ringbridge/api";

// ─── Status helpers ──────────────────────────────────────────

const STATUS_META = {
  available: { label: "Available", color: "#22c55e" },
  onCall: { label: "On Call", color: "#ef4444" },
  ringing: { label: "Ringing", color: "#f59e0b" },
  disposition: { label: "Disposition", color: "#a855f7" },
  away: { label: "Away", color: "#6b7280" },
  offline: { label: "Offline", color: "#374151" },
};

function formatDuration(startTime) {
  if (!startTime) return "00:00";
  const elapsed = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
  const mins = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const secs = (elapsed % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

// ─── Agent Card ──────────────────────────────────────────────

function AgentCard({ agent, onOverride }) {
  const [timer, setTimer] = useState("00:00");
  const status = agent.status || "offline";
  const meta = STATUS_META[status] || STATUS_META.offline;
  const hasCall = agent.currentCall?.sessionId;
  const stats = agent.dailyStats || {};

  // Live call timer
  useEffect(() => {
    if (!["onCall", "ringing"].includes(status) || !agent.currentCall?.startTime) return;
    const interval = setInterval(() => {
      setTimer(formatDuration(agent.currentCall.startTime));
    }, 1000);
    return () => clearInterval(interval);
  }, [status, agent.currentCall?.startTime]);

  return (
    <div className={`rb-agent-card rb-status-${status}`}>
      <div className="rb-agent-card-bar" style={{ background: meta.color }} />

      <div className="rb-agent-top">
        <div>
          <div className="rb-agent-name">{agent.name}</div>
          <div className="rb-status-badge" style={{ color: meta.color, background: `${meta.color}15` }}>
            <span className="rb-status-dot" style={{ background: meta.color, boxShadow: `0 0 6px ${meta.color}` }} />
            {meta.label}
          </div>
        </div>
        <span className="rb-agent-company">{agent.company || "TAG"}</span>
      </div>

      {(hasCall || ["onCall", "ringing"].includes(status)) && (
        <div className="rb-call-info">
          <div className="rb-call-row">
            <span className="rb-call-label">{agent.currentCall?.direction || "—"}</span>
            <span className="rb-call-timer">{timer}</span>
          </div>
          {agent.currentCall?.from && (
            <div className="rb-call-row">
              <span className="rb-call-label">From</span>
              <span className="rb-call-value">
                {agent.currentCall.fromName || ""} {agent.currentCall.from}
              </span>
            </div>
          )}
          {agent.currentCall?.to && (
            <div className="rb-call-row">
              <span className="rb-call-label">To</span>
              <span className="rb-call-value">{agent.currentCall.to}</span>
            </div>
          )}
        </div>
      )}

      <div className="rb-agent-stats">
        <div className="rb-mini-stat"><span className="rb-stat-label">Calls</span><span>{stats.totalCalls || 0}</span></div>
        <div className="rb-mini-stat" style={{ color: "#22c55e" }}><span className="rb-stat-label">Good</span><span>{stats.goodCalls || 0}</span></div>
        <div className="rb-mini-stat" style={{ color: "#ef4444" }}><span className="rb-stat-label">Bad</span><span>{stats.badCalls || 0}</span></div>
        <div className="rb-mini-stat"><span className="rb-stat-label">Hot</span><span>{stats.hot || 0}</span></div>
        <div className="rb-mini-stat"><span className="rb-stat-label">D1</span><span>{stats.day1 || 0}</span></div>
        <div className="rb-mini-stat"><span className="rb-stat-label">Aged</span><span>{stats.aged || 0}</span></div>
      </div>

      <div className="rb-agent-meta">
        <span>EX: {agent.exTelephonyStatus || "—"}</span>
        <span>Pres: {agent.exPresenceStatus || "—"}</span>
        <span>{agent.hasWebhook ? "⚡ Webhook" : "⚠ No webhook"}</span>
      </div>

      {/* Quick override buttons for testing */}
      <div className="rb-override-row">
        {["available", "onCall", "disposition", "away", "offline"].map((s) => (
          <button
            key={s}
            className={`rb-override-btn ${status === s ? "active" : ""}`}
            style={{ borderColor: STATUS_META[s].color, color: status === s ? "#0a0e14" : STATUS_META[s].color, background: status === s ? STATUS_META[s].color : "transparent" }}
            onClick={() => onOverride(agent.extensionId, s)}
            title={`Set ${s}`}
          >
            {s.slice(0, 3).toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Add Agent Modal ─────────────────────────────────────────

function AddAgentModal({ open, onClose, onAdd, extensions, loadingExtensions }) {
  const [extensionId, setExtensionId] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("TAG");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!extensionId || !name) return;
    onAdd({ extensionId, name, company });
    setExtensionId("");
    setName("");
    onClose();
  };

  const selectExtension = (ext) => {
    setExtensionId(ext.id);
    setName(ext.name);
  };

  if (!open) return null;

  return (
    <div className="rb-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rb-modal">
        <h3>Add Agent</h3>
        <form onSubmit={handleSubmit}>
          <div className="rb-field">
            <label>Extension ID</label>
            <input type="text" value={extensionId} onChange={(e) => setExtensionId(e.target.value)} placeholder="e.g. 1234567890" />
          </div>
          <div className="rb-field">
            <label>Display Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. John Smith" />
          </div>
          <div className="rb-field">
            <label>Company</label>
            <select value={company} onChange={(e) => setCompany(e.target.value)}>
              <option value="TAG">TAG — Tax Advocate Group</option>
              <option value="WYNN">WYNN — Wynn Tax Solutions</option>
            </select>
          </div>

          {/* Extension discovery */}
          {extensions.length > 0 && (
            <div className="rb-extensions-list">
              <label>Or select from account:</label>
              <div className="rb-ext-grid">
                {extensions.map((ext) => (
                  <button type="button" key={ext.id} className="rb-ext-btn" onClick={() => selectExtension(ext)}>
                    <span className="rb-ext-name">{ext.name}</span>
                    <span className="rb-ext-num">ext {ext.extensionNumber}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {loadingExtensions && <div className="rb-loading-text">Loading extensions...</div>}

          <div className="rb-modal-actions">
            <button type="button" className="rb-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="rb-btn-primary" disabled={!extensionId || !name}>Add Agent</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────

export default function RingBridgeDashboard() {
  const [agents, setAgents] = useState({});
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [health, setHealth] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [extensions, setExtensions] = useState([]);
  const [loadingExtensions, setLoadingExtensions] = useState(false);
  const eventSourceRef = useRef(null);
  const eventLogRef = useRef(null);

  // SSE connection
  useEffect(() => {
    const es = new EventSource(`${API}/events`);
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.addEventListener("initialState", (e) => {
      const data = JSON.parse(e.data);
      const map = {};
      data.forEach((a) => { map[a.extensionId] = a; });
      setAgents(map);
      addEvent("SYSTEM", `Loaded ${data.length} agent(s)`);
    });

    es.addEventListener("agentUpdate", (e) => {
      const data = JSON.parse(e.data);
      setAgents((prev) => ({ ...prev, [data.extensionId]: data }));
      if (data.previousStatus !== data.status) {
        addEvent(data.name, `${data.previousStatus} → ${data.status}`);
      }
    });

    return () => es.close();
  }, []);

  // Health check
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API}/health`);
        const data = await res.json();
        setHealth(data);
      } catch { setHealth(null); }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  const addEvent = useCallback((agent, msg) => {
    const time = new Date().toTimeString().split(" ")[0];
    setEvents((prev) => [{ time, agent, msg, id: Date.now() + Math.random() }, ...prev.slice(0, 99)]);
  }, []);

  // Actions
  const handleAddAgent = async ({ extensionId, name, company }) => {
    try {
      const res = await fetch(`${API}/admin/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extensionId, name, company }),
      });
      const data = await res.json();
      if (data.success) {
        addEvent("SYSTEM", `Added agent: ${name}`);
        refreshAgents();
      } else {
        addEvent("ERROR", data.error || "Failed to add agent");
      }
    } catch (err) {
      addEvent("ERROR", err.message);
    }
  };

  const handleOverride = async (extensionId, status) => {
    try {
      await fetch(`${API}/admin/agents/${extensionId}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch (err) {
      addEvent("ERROR", err.message);
    }
  };

  const handleDeleteAgent = async (extensionId) => {
    if (!window.confirm("Remove this agent?")) return;
    try {
      await fetch(`${API}/admin/agents/${extensionId}`, { method: "DELETE" });
      setAgents((prev) => {
        const next = { ...prev };
        delete next[extensionId];
        return next;
      });
      addEvent("SYSTEM", `Removed agent ext ${extensionId}`);
    } catch (err) {
      addEvent("ERROR", err.message);
    }
  };

  const refreshAgents = async () => {
    try {
      const res = await fetch(`${API}/admin/agents`);
      const data = await res.json();
      if (data.success) {
        const map = {};
        data.agents.forEach((a) => { map[a.extensionId] = a; });
        setAgents(map);
        addEvent("SYSTEM", "Refreshed");
      }
    } catch (err) {
      addEvent("ERROR", err.message);
    }
  };

  const loadExtensions = async () => {
    setLoadingExtensions(true);
    try {
      const res = await fetch(`${API}/admin/extensions`);
      const data = await res.json();
      if (data.success) setExtensions(data.extensions || []);
    } catch { /* ignore */ }
    setLoadingExtensions(false);
  };

  const openAddModal = () => {
    setShowAddModal(true);
    if (extensions.length === 0) loadExtensions();
  };

  // Stats
  const allAgents = Object.values(agents);
  const byStatus = (s) => allAgents.filter((a) => a.status === s).length;
  const totalCalls = allAgents.reduce((sum, a) => sum + (a.dailyStats?.totalCalls || 0), 0);

  return (
    <div className="rb-dashboard">
      {/* Header */}
      <div className="rb-header">
        <div className="rb-header-left">
          <h1 className="rb-logo">Ring<span>Bridge</span></h1>
          <div className={`rb-connection-badge ${connected ? "connected" : "disconnected"}`}>
            <span className="rb-pulse" />
            {connected ? "SSE Live" : "Disconnected"}
          </div>
          {health && (
            <div className={`rb-connection-badge ${health.rcConnected ? "connected" : "offline-mode"}`}>
              <span className="rb-pulse" />
              {health.rcConnected ? "RC Auth" : "Offline Mode"}
            </div>
          )}
        </div>
        <div className="rb-header-right">
          <button className="rb-btn" onClick={openAddModal}>+ Add Agent</button>
          <button className="rb-btn" onClick={refreshAgents}>Refresh</button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="rb-stats-bar">
        <div className="rb-stat-cell">
          <div className="rb-stat-value">{allAgents.length}</div>
          <div className="rb-stat-label">Agents</div>
        </div>
        <div className="rb-stat-cell">
          <div className="rb-stat-value" style={{ color: "#22c55e" }}>{byStatus("available")}</div>
          <div className="rb-stat-label">Available</div>
        </div>
        <div className="rb-stat-cell">
          <div className="rb-stat-value" style={{ color: "#ef4444" }}>{byStatus("onCall") + byStatus("ringing")}</div>
          <div className="rb-stat-label">On Call</div>
        </div>
        <div className="rb-stat-cell">
          <div className="rb-stat-value" style={{ color: "#a855f7" }}>{byStatus("disposition")}</div>
          <div className="rb-stat-label">Disposition</div>
        </div>
        <div className="rb-stat-cell">
          <div className="rb-stat-value" style={{ color: "#6b7280" }}>{byStatus("away") + byStatus("offline")}</div>
          <div className="rb-stat-label">Away</div>
        </div>
        <div className="rb-stat-cell">
          <div className="rb-stat-value">{totalCalls}</div>
          <div className="rb-stat-label">Calls Today</div>
        </div>
      </div>

      {/* Agent Grid */}
      {allAgents.length === 0 ? (
        <div className="rb-empty-state">
          <h2>No agents configured</h2>
          <p>
            Click <strong>+ Add Agent</strong> to start monitoring.<br />
            RingBridge will discover extensions on your RC account automatically.
          </p>
        </div>
      ) : (
        <div className="rb-agent-grid">
          {allAgents.map((agent) => (
            <AgentCard key={agent.extensionId} agent={agent} onOverride={handleOverride} />
          ))}
        </div>
      )}

      {/* Event Log */}
      <div className="rb-event-section">
        <div className="rb-section-title">Live Event Log</div>
        <div className="rb-event-log" ref={eventLogRef}>
          {events.length === 0 ? (
            <div className="rb-event-row">
              <span className="rb-event-time">--:--:--</span>
              <span className="rb-event-agent">SYSTEM</span>
              <span className="rb-event-msg">Waiting for events...</span>
            </div>
          ) : (
            events.map((ev) => (
              <div key={ev.id} className="rb-event-row">
                <span className="rb-event-time">{ev.time}</span>
                <span className="rb-event-agent">{ev.agent}</span>
                <span className="rb-event-msg">{ev.msg}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Agent Modal */}
      <AddAgentModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddAgent}
        extensions={extensions}
        loadingExtensions={loadingExtensions}
      />
    </div>
  );
}
