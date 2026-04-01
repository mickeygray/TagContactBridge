// client/src/components/tools/schedulemanager/CallFireDialer.jsx
// ─────────────────────────────────────────────────────────────
// CallFire Auto-Dialer - Uses ScheduleContext for state management
// ─────────────────────────────────────────────────────────────

import React, { useContext, useEffect, useRef } from "react";
import ScheduleContext from "../../../context/schedule/scheduleContext";

const CallFireDialer = () => {
  const context = useContext(ScheduleContext);

  // Ref for tracking isRunning without triggering effect re-runs
  // Must be declared before any conditional returns
  const isRunningRef = useRef(false);

  // Extract values with defaults for when context is null
  const {
    mode = "wynn",
    isRunning = false,
    isPaused = false,
    leadsCount = 0,
    stats = { queued: 0, processed: 0, failed: 0, total: 0 },
    tagFilters = { startDate: "", endDate: "", sourceName: "all" },
    logs = [],
    loading = false,
    error = null,
    setMode = () => {},
    fetchWynnLeads = () => {},
    startWynnDialer = () => {},
    setTagFilters = () => {},
    fetchTagLeads = () => {},
    startTagDialer = () => {},
    pauseDialer = () => {},
    resumeDialer = () => {},
    stopDialer = () => {},
    clearError = () => {},
  } = context || {};

  // Keep ref in sync with isRunning - must be before conditional return
  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  // Cleanup on unmount only - must be before conditional return
  useEffect(() => {
    return () => {
      if (isRunningRef.current) {
        stopDialer();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TAG source options
  const tagSources = [
    { value: "all", label: "All Sources" },
    { value: "ABC", label: "ABC" },
    { value: "BCD - OG", label: "BCD - OG" },
  ];

  // Progress calculation
  const progressPercent =
    stats.total > 0 ? Math.round((stats.processed / stats.total) * 100) : 0;

  // Show error if no context - AFTER all hooks
  if (!context) {
    return (
      <div className="callfire-dialer">
        <h2>🔥 CallFire Auto-Dialer</h2>
        <div className="error-banner">
          ⚠️ Error: ScheduleContext not available. Make sure this component is
          wrapped in ScheduleState provider.
        </div>
      </div>
    );
  }

  return (
    <div className="callfire-dialer">
      <h2>🔥 CallFire Auto-Dialer</h2>

      {/* Mode Tabs */}
      <div className="mode-tabs">
        <button
          className={`tab ${mode === "wynn" ? "active" : ""}`}
          onClick={() => setMode("wynn")}
          disabled={isRunning}
        >
          Wynn Digital Leads
        </button>
        <button
          className={`tab ${mode === "tag" ? "active" : ""}`}
          onClick={() => setMode("tag")}
          disabled={isRunning}
        >
          TAG Prospects
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-banner">
          ⚠️ {error}
          <button onClick={clearError}>✕</button>
        </div>
      )}

      {/* Wynn Mode */}
      {mode === "wynn" && !isRunning && (
        <div className="mode-panel">
          <p className="mode-description">
            Auto-dial Wynn Tax digital leads (VF source, status 1-2) from
            MongoDB/Logics. These leads have the cadence engine baked in until
            they're processed.
          </p>
          <button
            className="btn primary"
            onClick={fetchWynnLeads}
            disabled={loading}
          >
            {loading ? "Loading..." : "🔍 Fetch Leads"}
          </button>

          {leadsCount > 0 && (
            <div className="leads-preview">
              <p>
                <strong>{leadsCount}</strong> leads ready to dial
              </p>
              <button className="btn success" onClick={startWynnDialer}>
                ▶️ Start Dialer
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAG Mode */}
      {mode === "tag" && !isRunning && (
        <div className="mode-panel">
          <p className="mode-description">
            Pull TAG prospects by date range and source. Scrubs against
            validation before sending to CallFire.
          </p>

          <div className="filter-row">
            <div className="filter-group">
              <label>Start Date</label>
              <input
                type="date"
                value={tagFilters.startDate}
                onChange={(e) => setTagFilters({ startDate: e.target.value })}
              />
            </div>
            <div className="filter-group">
              <label>End Date</label>
              <input
                type="date"
                value={tagFilters.endDate}
                onChange={(e) => setTagFilters({ endDate: e.target.value })}
              />
            </div>
            <div className="filter-group">
              <label>Source</label>
              <select
                value={tagFilters.sourceName}
                onChange={(e) => setTagFilters({ sourceName: e.target.value })}
              >
                {tagSources.map((src) => (
                  <option key={src.value} value={src.value}>
                    {src.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            className="btn primary"
            onClick={fetchTagLeads}
            disabled={loading}
          >
            {loading ? "Loading..." : "🔍 Fetch Prospects"}
          </button>

          {leadsCount > 0 && (
            <div className="leads-preview">
              <p>
                <strong>{leadsCount}</strong> prospects ready to dial
              </p>
              <button className="btn success" onClick={startTagDialer}>
                ▶️ Start Dialer
              </button>
            </div>
          )}
        </div>
      )}

      {/* Running State */}
      {isRunning && (
        <div className="running-panel">
          <div className="status-badge">
            {isPaused ? "⏸️ PAUSED" : "🔥 RUNNING"}
          </div>

          <div className="progress-section">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="progress-text">
              {stats.processed} / {stats.total} ({progressPercent}%)
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat">
              <span className="stat-value">{stats.queued}</span>
              <span className="stat-label">Queued</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.processed}</span>
              <span className="stat-label">Processed</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.failed}</span>
              <span className="stat-label">Failed</span>
            </div>
          </div>

          <div className="controls">
            {isPaused ? (
              <button className="btn primary" onClick={resumeDialer}>
                ▶️ Resume
              </button>
            ) : (
              <button className="btn warning" onClick={pauseDialer}>
                ⏸️ Pause
              </button>
            )}
            <button className="btn danger" onClick={stopDialer}>
              ⏹️ Stop
            </button>
          </div>
        </div>
      )}

      {/* Activity Log */}
      <div className="log-section">
        <h3>📋 Activity Log</h3>
        <div className="log-container">
          {logs.length === 0 ? (
            <div className="log-empty">No activity yet</div>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} className={`log-entry log-${log.type}`}>
                <span className="log-time">{log.timestamp}</span>
                <span className="log-message">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default CallFireDialer;
