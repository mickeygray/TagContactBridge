// client/src/components/tools/ringcentral/RingBridgeDashboard.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import "./RingBridgeDashboard.css";
import ScoredCallsPanel from "./ScoredCallsPanel"; // ← ADD THIS
const API = "/ringbridge/api";

const STATUS_META = {
  available: { label: "Available", color: "#22c55e" },
  onCall: { label: "On Call", color: "#ef4444" },
  ringing: { label: "Ringing", color: "#f59e0b" },
  disposition: { label: "Disposition", color: "#a855f7" },
  away: { label: "Away", color: "#6b7280" },
  offline: { label: "Offline", color: "#374151" },
};

const ENRICHMENT_META = {
  matched: { label: "Matched", color: "#22c55e" },
  unmatched: { label: "Unmatched", color: "#6b7280" },
  pending: { label: "Pending", color: "#f59e0b" },
  retried: { label: "Retried", color: "#3b82f6" },
  error: { label: "Error", color: "#ef4444" },
};

function formatDuration(startTime) {
  if (!startTime) return "00:00";
  const elapsed = Math.floor(
    (Date.now() - new Date(startTime).getTime()) / 1000,
  );
  const mins = Math.floor(elapsed / 60)
    .toString()
    .padStart(2, "0");
  const secs = (elapsed % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function formatSecs(s) {
  if (!s) return "\u2014";
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function shortTime(dateStr) {
  if (!dateStr) return "\u2014";
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function shortDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// Agent Card
function AgentCard({ agent, onOverride }) {
  const [timer, setTimer] = useState("00:00");
  const status = agent.status || "offline";
  const meta = STATUS_META[status] || STATUS_META.offline;
  const hasCall = agent.currentCall?.sessionId;
  const stats = agent.dailyStats || {};

  useEffect(() => {
    if (
      !["onCall", "ringing"].includes(status) ||
      !agent.currentCall?.startTime
    )
      return;
    const interval = setInterval(
      () => setTimer(formatDuration(agent.currentCall.startTime)),
      1000,
    );
    return () => clearInterval(interval);
  }, [status, agent.currentCall?.startTime]);

  return (
    <div className={`rb-agent-card rb-status-${status}`}>
      <div className="rb-agent-card-bar" style={{ background: meta.color }} />
      <div className="rb-agent-top">
        <div>
          <div className="rb-agent-name">{agent.name}</div>
          <div
            className="rb-status-badge"
            style={{ color: meta.color, background: `${meta.color}15` }}
          >
            <span
              className="rb-status-dot"
              style={{
                background: meta.color,
                boxShadow: `0 0 6px ${meta.color}`,
              }}
            />
            {meta.label}
          </div>
        </div>
        <span className="rb-agent-company">{agent.company || "TAG"}</span>
      </div>
      {(hasCall || ["onCall", "ringing"].includes(status)) && (
        <div className="rb-call-info">
          <div className="rb-call-row">
            <span className="rb-call-label">
              {agent.currentCall?.direction || "\u2014"}
            </span>
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
        <div className="rb-mini-stat">
          <span className="rb-stat-label">Calls</span>
          <span>{stats.totalCalls || 0}</span>
        </div>
        <div className="rb-mini-stat" style={{ color: "#22c55e" }}>
          <span className="rb-stat-label">Good</span>
          <span>{stats.goodCalls || 0}</span>
        </div>
        <div className="rb-mini-stat" style={{ color: "#ef4444" }}>
          <span className="rb-stat-label">Bad</span>
          <span>{stats.badCalls || 0}</span>
        </div>
        <div className="rb-mini-stat">
          <span className="rb-stat-label">Hot</span>
          <span>{stats.hot || 0}</span>
        </div>
        <div className="rb-mini-stat">
          <span className="rb-stat-label">D1</span>
          <span>{stats.day1 || 0}</span>
        </div>
        <div className="rb-mini-stat">
          <span className="rb-stat-label">Aged</span>
          <span>{stats.aged || 0}</span>
        </div>
      </div>
      <div className="rb-agent-meta">
        <span>EX: {agent.exTelephonyStatus || "\u2014"}</span>
        <span>Pres: {agent.exPresenceStatus || "\u2014"}</span>
        <span>{agent.hasWebhook ? "\u26a1 Webhook" : "\u26a0 No webhook"}</span>
      </div>
      <div className="rb-override-row">
        {["available", "onCall", "disposition", "away", "offline"].map((s) => (
          <button
            key={s}
            className={`rb-override-btn ${status === s ? "active" : ""}`}
            style={{
              borderColor: STATUS_META[s].color,
              color: status === s ? "#0a0e14" : STATUS_META[s].color,
              background: status === s ? STATUS_META[s].color : "transparent",
            }}
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

// Add Agent Modal
function AddAgentModal({
  open,
  onClose,
  onAdd,
  extensions,
  loadingExtensions,
}) {
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
    <div
      className="rb-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="rb-modal">
        <h3>Add Agent</h3>
        <form onSubmit={handleSubmit}>
          <div className="rb-field">
            <label>Extension ID</label>
            <input
              type="text"
              value={extensionId}
              onChange={(e) => setExtensionId(e.target.value)}
              placeholder="e.g. 1234567890"
            />
          </div>
          <div className="rb-field">
            <label>Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Smith"
            />
          </div>
          <div className="rb-field">
            <label>Company</label>
            <select
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            >
              <option value="TAG">TAG</option>
              <option value="WYNN">WYNN</option>
            </select>
          </div>
          {extensions.length > 0 && (
            <div className="rb-extensions-list">
              <label>Or select from account:</label>
              <div className="rb-ext-grid">
                {extensions.map((ext) => (
                  <button
                    type="button"
                    key={ext.id}
                    className="rb-ext-btn"
                    onClick={() => selectExtension(ext)}
                  >
                    <span className="rb-ext-name">{ext.name}</span>
                    <span className="rb-ext-num">
                      ext {ext.extensionNumber}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {loadingExtensions && (
            <div className="rb-loading-text">Loading extensions...</div>
          )}
          <div className="rb-modal-actions">
            <button type="button" className="rb-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="rb-btn-primary"
              disabled={!extensionId || !name}
            >
              Add Agent
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Contact Activity Panel
function ContactActivityPanel() {
  const [activities, setActivities] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState({
    enrichment: "",
    disposition: "",
    phone: "",
  });
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const LIMIT = 30;

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.enrichment) params.set("enrichment", filters.enrichment);
      if (filters.disposition) params.set("disposition", filters.disposition);
      if (filters.phone) params.set("phone", filters.phone);
      params.set("limit", String(LIMIT));
      params.set("skip", String(page * LIMIT));
      const res = await fetch(`${API}/admin/contacts?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setActivities(data.activities);
        setTotal(data.total);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [filters, page]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API}/admin/contacts/stats/summary`);
      const data = await res.json();
      if (data.success) setStats(data);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);
  useEffect(() => {
    fetchStats();
  }, []);

  const handleFilter = (key, value) => {
    setPage(0);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleCsvExport = () => {
    const params = new URLSearchParams();
    if (filters.enrichment) params.set("enrichment", filters.enrichment);
    if (filters.disposition) params.set("disposition", filters.disposition);
    if (filters.phone) params.set("phone", filters.phone);
    window.open(`${API}/admin/contacts/csv?${params.toString()}`, "_blank");
  };

  const handleRetryEnrichment = async (id) => {
    try {
      await fetch(`${API}/admin/contacts/${id}/retry-enrichment`, {
        method: "POST",
      });
      fetchActivities();
    } catch {
      /* ignore */
    }
  };

  const totalPages = Math.ceil(total / LIMIT);
  const s = stats?.today || {};

  return (
    <div className="rb-contacts-panel">
      {stats && (
        <div className="rb-stats-bar">
          <div className="rb-stat-cell">
            <div className="rb-stat-value">{s.total || 0}</div>
            <div className="rb-stat-label">Today</div>
          </div>
          <div className="rb-stat-cell">
            <div className="rb-stat-value" style={{ color: "#22c55e" }}>
              {s.matched || 0}
            </div>
            <div className="rb-stat-label">Matched</div>
          </div>
          <div className="rb-stat-cell">
            <div className="rb-stat-value" style={{ color: "#6b7280" }}>
              {s.unmatched || 0}
            </div>
            <div className="rb-stat-label">Unmatched</div>
          </div>
          <div className="rb-stat-cell">
            <div className="rb-stat-value" style={{ color: "#22c55e" }}>
              {s.good || 0}
            </div>
            <div className="rb-stat-label">Good</div>
          </div>
          <div className="rb-stat-cell">
            <div className="rb-stat-value" style={{ color: "#ef4444" }}>
              {s.bad || 0}
            </div>
            <div className="rb-stat-label">Bad</div>
          </div>
          <div className="rb-stat-cell">
            <div className="rb-stat-value">
              {s.inbound || 0} / {s.outbound || 0}
            </div>
            <div className="rb-stat-label">In / Out</div>
          </div>
          <div className="rb-stat-cell">
            <div className="rb-stat-value">
              {s.avgDuration ? formatSecs(Math.round(s.avgDuration)) : "\u2014"}
            </div>
            <div className="rb-stat-label">Avg Dur</div>
          </div>
          <div className="rb-stat-cell">
            <div className="rb-stat-value">{stats?.allTime?.total || 0}</div>
            <div className="rb-stat-label">All Time</div>
          </div>
        </div>
      )}
      <div className="rb-filter-bar">
        <input
          type="text"
          className="rb-filter-input"
          placeholder="Search phone..."
          value={filters.phone}
          onChange={(e) => handleFilter("phone", e.target.value)}
        />
        <select
          className="rb-filter-select"
          value={filters.enrichment}
          onChange={(e) => handleFilter("enrichment", e.target.value)}
        >
          <option value="">All Enrichment</option>
          <option value="matched">Matched</option>
          <option value="unmatched">Unmatched</option>
          <option value="pending">Pending</option>
          <option value="error">Error</option>
        </select>
        <select
          className="rb-filter-select"
          value={filters.disposition}
          onChange={(e) => handleFilter("disposition", e.target.value)}
        >
          <option value="">All Disposition</option>
          <option value="good">Good</option>
          <option value="bad">Bad</option>
          <option value="none">None</option>
        </select>
        <button className="rb-btn" onClick={fetchActivities} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </button>
        <button className="rb-btn-primary" onClick={handleCsvExport}>
          Export CSV
        </button>
      </div>
      <div className="rb-table-wrap">
        <table className="rb-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Agent</th>
              <th>Dir</th>
              <th>Phone</th>
              <th>Dur</th>
              <th>Disp</th>
              <th>Enrichment</th>
              <th>Case</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {activities.length === 0 && (
              <tr>
                <td colSpan={9} className="rb-table-empty">
                  {loading ? "Loading..." : "No contact activity yet"}
                </td>
              </tr>
            )}
            {activities.map((a) => {
              const eMeta =
                ENRICHMENT_META[a.enrichmentStatus] || ENRICHMENT_META.pending;
              const isExpanded = expanded === a._id;
              return (
                <React.Fragment key={a._id}>
                  <tr
                    className="rb-table-row"
                    onClick={() => setExpanded(isExpanded ? null : a._id)}
                  >
                    <td className="rb-td-time">
                      <span>{shortDate(a.callStartTime || a.createdAt)}</span>
                      <span>{shortTime(a.callStartTime || a.createdAt)}</span>
                    </td>
                    <td>
                      <span className="rb-td-agent">
                        {a.agentName || "\u2014"}
                      </span>
                      <span className="rb-td-sub">{a.company || ""}</span>
                    </td>
                    <td>
                      <span
                        className={`rb-dir-badge rb-dir-${(a.direction || "").toLowerCase()}`}
                      >
                        {a.direction === "Inbound"
                          ? "IN"
                          : a.direction === "Outbound"
                            ? "OUT"
                            : "\u2014"}
                      </span>
                    </td>
                    <td className="rb-td-phone">
                      {a.phoneFormatted || a.phone || "\u2014"}
                    </td>
                    <td>{formatSecs(a.durationSeconds)}</td>
                    <td>
                      {a.disposition === "good" ? (
                        <span className="rb-disp-good">Good</span>
                      ) : a.disposition === "bad" ? (
                        <span className="rb-disp-bad">Bad</span>
                      ) : (
                        <span className="rb-disp-none">{"\u2014"}</span>
                      )}
                    </td>
                    <td>
                      <span
                        className="rb-enrich-badge"
                        style={{ color: eMeta.color, borderColor: eMeta.color }}
                      >
                        {eMeta.label}
                      </span>
                    </td>
                    <td className="rb-td-case">
                      {a.caseMatch?.caseId ? (
                        <span>
                          <strong>{a.caseMatch.domain}</strong> #
                          {a.caseMatch.caseId}
                          <br />
                          <span className="rb-td-sub">{a.caseMatch.name}</span>
                        </span>
                      ) : (
                        "\u2014"
                      )}
                    </td>
                    <td className="rb-td-expand">
                      {isExpanded ? "\u25b2" : "\u25bc"}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="rb-expanded-row">
                      <td colSpan={9}>
                        <div className="rb-expanded-grid">
                          <div className="rb-expanded-col">
                            <div className="rb-expanded-label">Session</div>
                            <div className="rb-expanded-value">
                              {a.callSessionId || "\u2014"}
                            </div>
                            <div className="rb-expanded-label">Start / End</div>
                            <div className="rb-expanded-value">
                              {a.callStartTime
                                ? new Date(a.callStartTime).toLocaleString()
                                : "\u2014"}{" "}
                              {"\u2192"}{" "}
                              {a.callEndTime
                                ? new Date(a.callEndTime).toLocaleString()
                                : "ongoing"}
                            </div>
                          </div>
                          {a.caseMatch?.caseId && (
                            <div className="rb-expanded-col">
                              <div className="rb-expanded-label">
                                Case Match
                              </div>
                              <div className="rb-expanded-value">
                                {a.caseMatch.domain} #{a.caseMatch.caseId}{" "}
                                {"\u2014"} {a.caseMatch.name}
                              </div>
                              <div className="rb-expanded-label">
                                Status / Email
                              </div>
                              <div className="rb-expanded-value">
                                ID {a.caseMatch.statusId || "?"} {"\u2014"}{" "}
                                {a.caseMatch.email || "\u2014"}
                              </div>
                              <div className="rb-expanded-label">
                                Location / Tax
                              </div>
                              <div className="rb-expanded-value">
                                {a.caseMatch.city || "\u2014"},{" "}
                                {a.caseMatch.state || "\u2014"} {"\u2014"} $
                                {a.caseMatch.taxAmount?.toLocaleString() || "0"}
                              </div>
                            </div>
                          )}
                          {a.allMatches?.length > 1 && (
                            <div className="rb-expanded-col">
                              <div className="rb-expanded-label">
                                All Matches ({a.allMatches.length})
                              </div>
                              {a.allMatches.map((m, i) => (
                                <div key={i} className="rb-expanded-value">
                                  {m.domain} #{m.caseId} {"\u2014"} {m.name}{" "}
                                  (status {m.statusId})
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="rb-expanded-col">
                            <div className="rb-expanded-label">Enrichment</div>
                            <div className="rb-expanded-value">
                              {a.enrichmentStatus} (attempts:{" "}
                              {a.enrichmentAttempts || 0})
                              {a.enrichmentError && (
                                <span className="rb-expanded-error">
                                  {" "}
                                  {"\u2014"} {a.enrichmentError}
                                </span>
                              )}
                            </div>
                            {a.enrichmentStatus !== "matched" && a.phone && (
                              <button
                                className="rb-btn rb-btn-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRetryEnrichment(a._id);
                                }}
                              >
                                Retry Enrichment
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="rb-pagination">
          <button
            className="rb-btn rb-btn-sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            {"\u2190"} Prev
          </button>
          <span className="rb-page-info">
            Page {page + 1} of {totalPages} ({total} total)
          </span>
          <button
            className="rb-btn rb-btn-sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next {"\u2192"}
          </button>
        </div>
      )}
    </div>
  );
}

// Main Dashboard
export default function RingBridgeDashboard() {
  const [agents, setAgents] = useState({});
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [health, setHealth] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [extensions, setExtensions] = useState([]);
  const [loadingExtensions, setLoadingExtensions] = useState(false);
  const [activeTab, setActiveTab] = useState("agents");
  const eventSourceRef = useRef(null);

  useEffect(() => {
    const es = new EventSource(`${API}/events`);
    eventSourceRef.current = es;
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener("initialState", (e) => {
      const data = JSON.parse(e.data);
      const map = {};
      data.forEach((a) => {
        map[a.extensionId] = a;
      });
      setAgents(map);
      addEvent("SYSTEM", `Loaded ${data.length} agent(s)`);
    });
    es.addEventListener("agentUpdate", (e) => {
      const data = JSON.parse(e.data);
      setAgents((prev) => ({ ...prev, [data.extensionId]: data }));
      if (data.previousStatus !== data.status)
        addEvent(data.name, `${data.previousStatus} \u2192 ${data.status}`);
    });
    es.addEventListener("contactActivity", (e) => {
      const data = JSON.parse(e.data);
      addEvent(
        data.agentName || "CALL",
        `${data.direction} ${data.phoneFormatted || ""} \u2014 ${formatSecs(data.durationSeconds)}`,
      );
    });
    es.addEventListener("enrichmentUpdate", (e) => {
      const data = JSON.parse(e.data);
      if (data.enrichmentStatus === "matched" && data.caseMatch)
        addEvent(
          "ENRICH",
          `${data.phone} \u2192 ${data.caseMatch.domain} #${data.caseMatch.caseId}`,
        );
    });
    return () => es.close();
  }, []);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API}/health`);
        setHealth(await res.json());
      } catch {
        setHealth(null);
      }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  const addEvent = useCallback((agent, msg) => {
    const time = new Date().toTimeString().split(" ")[0];
    setEvents((prev) => [
      { time, agent, msg, id: Date.now() + Math.random() },
      ...prev.slice(0, 99),
    ]);
  }, []);

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
        addEvent("ERROR", data.error || "Failed");
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
  const refreshAgents = async () => {
    try {
      const res = await fetch(`${API}/admin/agents`);
      const data = await res.json();
      if (data.success) {
        const map = {};
        data.agents.forEach((a) => {
          map[a.extensionId] = a;
        });
        setAgents(map);
      }
    } catch {
      /* ignore */
    }
  };
  const loadExtensions = async () => {
    setLoadingExtensions(true);
    try {
      const res = await fetch(`${API}/admin/extensions`);
      const data = await res.json();
      if (data.success) setExtensions(data.extensions || []);
    } catch {
      /* ignore */
    }
    setLoadingExtensions(false);
  };
  const openAddModal = () => {
    setShowAddModal(true);
    if (extensions.length === 0) loadExtensions();
  };

  const allAgents = Object.values(agents);
  const byStatus = (s) => allAgents.filter((a) => a.status === s).length;
  const totalCalls = allAgents.reduce(
    (sum, a) => sum + (a.dailyStats?.totalCalls || 0),
    0,
  );

  return (
    <div className="rb-dashboard">
      <div className="rb-header">
        <div className="rb-header-left">
          <h1 className="rb-logo">
            Ring<span>Bridge</span>
          </h1>
          <div
            className={`rb-connection-badge ${connected ? "connected" : "disconnected"}`}
          >
            <span className="rb-pulse" />
            {connected ? "SSE Live" : "Disconnected"}
          </div>
          {health && (
            <div
              className={`rb-connection-badge ${health.rcConnected ? "connected" : "offline-mode"}`}
            >
              <span className="rb-pulse" />
              {health.rcConnected ? "RC Auth" : "Offline Mode"}
            </div>
          )}
        </div>
        <div className="rb-header-right">
          <button className="rb-btn" onClick={openAddModal}>
            + Add Agent
          </button>
          <button className="rb-btn" onClick={refreshAgents}>
            Refresh
          </button>
        </div>
      </div>

      <div className="rb-tab-bar">
        <button
          className={`rb-tab ${activeTab === "agents" ? "active" : ""}`}
          onClick={() => setActiveTab("agents")}
        >
          Agents ({allAgents.length})
        </button>
        <button
          className={`rb-tab ${activeTab === "contacts" ? "active" : ""}`}
          onClick={() => setActiveTab("contacts")}
        >
          Contact Activity
        </button>
        <button
          className={`rb-tab ${activeTab === "scored" ? "active" : ""}`}
          onClick={() => setActiveTab("scored")}
        >
          Scored Calls
        </button>
      </div>

      {activeTab === "agents" && (
        <>
          <div className="rb-stats-bar">
            <div className="rb-stat-cell">
              <div className="rb-stat-value">{allAgents.length}</div>
              <div className="rb-stat-label">Agents</div>
            </div>
            <div className="rb-stat-cell">
              <div className="rb-stat-value" style={{ color: "#22c55e" }}>
                {byStatus("available")}
              </div>
              <div className="rb-stat-label">Available</div>
            </div>
            <div className="rb-stat-cell">
              <div className="rb-stat-value" style={{ color: "#ef4444" }}>
                {byStatus("onCall") + byStatus("ringing")}
              </div>
              <div className="rb-stat-label">On Call</div>
            </div>
            <div className="rb-stat-cell">
              <div className="rb-stat-value" style={{ color: "#a855f7" }}>
                {byStatus("disposition")}
              </div>
              <div className="rb-stat-label">Disposition</div>
            </div>
            <div className="rb-stat-cell">
              <div className="rb-stat-value" style={{ color: "#6b7280" }}>
                {byStatus("away") + byStatus("offline")}
              </div>
              <div className="rb-stat-label">Away</div>
            </div>
            <div className="rb-stat-cell">
              <div className="rb-stat-value">{totalCalls}</div>
              <div className="rb-stat-label">Calls Today</div>
            </div>
          </div>
          {allAgents.length === 0 ? (
            <div className="rb-empty-state">
              <h2>No agents configured</h2>
              <p>
                Click <strong>+ Add Agent</strong> to start monitoring.
              </p>
            </div>
          ) : (
            <div className="rb-agent-grid">
              {allAgents.map((agent) => (
                <AgentCard
                  key={agent.extensionId}
                  agent={agent}
                  onOverride={handleOverride}
                />
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === "contacts" && <ContactActivityPanel />}
      {activeTab === "scored" && <ScoredCallsPanel />}
      <div className="rb-event-section">
        <div className="rb-section-title">Live Event Log</div>
        <div className="rb-event-log">
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
