import React, { useEffect, useState } from "react";
import { useSms } from "../../../hooks/useSms";
import SmsConversationCard from "./SmsConversationCard";
import SmsThread from "./SmsThread";

export default function SmsInbox() {
  const {
    conversations,
    totalConversations,
    currentPage,
    totalPages,
    activeConversation,
    stats,
    settings,
    filters,
    loading,
    fetchConversations,
    fetchStats,
    fetchSettings,
    updateSettings,
    setFilter,
    startPolling,
    stopPolling,
  } = useSms();

  const [showSettings, setShowSettings] = useState(false);
  const [delayValue, setDelayValue] = useState(300); // seconds

  // Initial load
  useEffect(() => {
    fetchConversations();
    fetchStats();
    fetchSettings();
    startPolling();
    return () => stopPolling();
    // eslint-disable-next-line
  }, []);

  // Refetch when filters change
  useEffect(() => {
    fetchConversations(1);
    // eslint-disable-next-line
  }, [filters.status, filters.company, filters.contactType]);

  // Sync delay slider with settings
  useEffect(() => {
    if (settings?.autoSendDelaySeconds != null) {
      setDelayValue(settings.autoSendDelaySeconds);
    }
  }, [settings]);

  const handleDelayChange = (e) => {
    setDelayValue(Number(e.target.value));
  };

  const handleDelaySave = () => {
    updateSettings({ autoSendDelayMs: delayValue * 1000 });
  };

  const handleToggleAutoSend = () => {
    updateSettings({ autoSendEnabled: !settings?.autoSendEnabled });
  };

  const delayLabel = (sec) => {
    if (sec === 0) return "Never (manual only)";
    if (sec < 60) return `${sec}s`;
    return `${Math.floor(sec / 60)}m ${sec % 60 ? (sec % 60) + "s" : ""}`;
  };

  return (
    <div style={{ padding: 0 }}>
      {/* Stats Bar */}
      {stats && (
        <div
          style={{
            display: "flex",
            gap: 16,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <div
            className="card border p-3"
            style={{ flex: 1, minWidth: 120, textAlign: "center" }}
          >
            <div style={{ fontSize: 24, fontWeight: 700, color: "#f59e0b" }}>
              {stats.pending}
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>Pending</div>
          </div>
          <div
            className="card border p-3"
            style={{ flex: 1, minWidth: 120, textAlign: "center" }}
          >
            <div style={{ fontSize: 24, fontWeight: 700, color: "#3b82f6" }}>
              {stats.todayInbound}
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>Today Inbound</div>
          </div>
          <div
            className="card border p-3"
            style={{ flex: 1, minWidth: 120, textAlign: "center" }}
          >
            <div style={{ fontSize: 24, fontWeight: 700, color: "#10b981" }}>
              {stats.todaySent}
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>Today Sent</div>
          </div>
          <div
            className="card border p-3"
            style={{ flex: 1, minWidth: 120, textAlign: "center" }}
          >
            <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.total}</div>
            <div style={{ fontSize: 12, color: "#666" }}>Total Threads</div>
          </div>
          <div
            className="card border p-3"
            style={{ flex: 1, minWidth: 120, textAlign: "center" }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: stats.businessHours ? "#10b981" : "#ef4444",
              }}
            >
              {stats.businessHours ? "● Open" : "● Closed"}
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>Business Hours</div>
          </div>
        </div>
      )}

      {/* Filters + Settings Toggle */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <select
          value={filters.status}
          onChange={(e) => setFilter({ status: e.target.value })}
          className="input"
          style={{ width: 130, fontSize: 13 }}
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="sent">Sent</option>
          <option value="cancelled">Cancelled</option>
          <option value="idle">Idle</option>
        </select>

        <select
          value={filters.company}
          onChange={(e) => setFilter({ company: e.target.value })}
          className="input"
          style={{ width: 110, fontSize: 13 }}
        >
          <option value="all">All Brands</option>
          <option value="WYNN">WYNN</option>
          <option value="TAG">TAG</option>
        </select>

        <select
          value={filters.contactType}
          onChange={(e) => setFilter({ contactType: e.target.value })}
          className="input"
          style={{ width: 120, fontSize: 13 }}
        >
          <option value="all">All Types</option>
          <option value="prospect">Prospects</option>
          <option value="client">Clients</option>
          <option value="opt-out">Opt-Outs</option>
          <option value="unknown">Unknown</option>
        </select>

        <input
          type="text"
          placeholder="Search name/phone..."
          value={filters.search}
          onChange={(e) => setFilter({ search: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") fetchConversations(1);
          }}
          className="input"
          style={{ flex: 1, minWidth: 160, fontSize: 13 }}
        />

        <button
          className="button"
          onClick={() => fetchConversations(1)}
          style={{ fontSize: 13 }}
        >
          🔍
        </button>

        <button
          className="button"
          onClick={() => setShowSettings(!showSettings)}
          style={{ fontSize: 13 }}
        >
          ⚙️ Settings
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && settings && (
        <div className="card border p-4 mb-4" style={{ background: "#f9fafb" }}>
          <h4 style={{ marginBottom: 12, fontSize: 14 }}>
            🤖 Auto-Responder Settings
          </h4>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <label style={{ fontSize: 13, fontWeight: 500 }}>Auto-Send:</label>
            <button
              className={`button ${settings.autoSendEnabled ? "primary" : ""}`}
              onClick={handleToggleAutoSend}
              style={{ fontSize: 12 }}
            >
              {settings.autoSendEnabled ? "● Enabled" : "○ Disabled"}
            </button>
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 500 }}>
              Delay: {delayLabel(delayValue)}
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                type="range"
                min={0}
                max={600}
                step={5}
                value={delayValue}
                onChange={handleDelayChange}
                style={{ flex: 1 }}
              />
              <button
                className="button primary"
                onClick={handleDelaySave}
                style={{ fontSize: 12 }}
              >
                Save
              </button>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10,
                color: "#999",
                marginTop: 2,
              }}
            >
              <span>Never</span>
              <span>5s</span>
              <span>1m</span>
              <span>5m</span>
              <span>10m</span>
            </div>
          </div>
        </div>
      )}

      {/* Conversation Cards */}
      {loading && conversations.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
          Loading conversations...
        </div>
      ) : conversations.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
          No conversations found.
        </div>
      ) : (
        <>
          {conversations.map((c) => (
            <SmsConversationCard key={c._id} conversation={c} />
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 8,
                marginTop: 16,
              }}
            >
              <button
                className="button"
                disabled={currentPage <= 1}
                onClick={() => fetchConversations(currentPage - 1)}
                style={{ fontSize: 12 }}
              >
                ← Prev
              </button>
              <span style={{ fontSize: 13, alignSelf: "center" }}>
                {currentPage} / {totalPages} ({totalConversations} total)
              </span>
              <button
                className="button"
                disabled={currentPage >= totalPages}
                onClick={() => fetchConversations(currentPage + 1)}
                style={{ fontSize: 12 }}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* Thread sidebar */}
      {activeConversation && <SmsThread />}
    </div>
  );
}
