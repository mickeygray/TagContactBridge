// client/src/components/tools/ringcentral/ScoredCallsPanel.jsx
// ─────────────────────────────────────────────────────────────
// Scored WYNN outbound call list with detail modal,
// transcript viewer, and manual source name editing.
// Drop into RingBridgeDashboard as a tab panel.
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from "react";

const API = "/ringbridge/api";

// ─── Verdict colors ──────────────────────────────────────────

const VERDICT_META = {
  hot: {
    label: "HOT",
    bg: "rgba(239,68,68,0.15)",
    border: "rgba(239,68,68,0.4)",
    color: "#f87171",
  },
  warm: {
    label: "WARM",
    bg: "rgba(245,158,11,0.15)",
    border: "rgba(245,158,11,0.4)",
    color: "#fbbf24",
  },
  cold: {
    label: "COLD",
    bg: "rgba(59,130,246,0.15)",
    border: "rgba(59,130,246,0.4)",
    color: "#60a5fa",
  },
  dead: {
    label: "DEAD",
    bg: "rgba(107,114,128,0.15)",
    border: "rgba(107,114,128,0.4)",
    color: "#9ca3af",
  },
  fake: {
    label: "FAKE",
    bg: "rgba(168,85,247,0.15)",
    border: "rgba(168,85,247,0.4)",
    color: "#c084fc",
  },
};

function scorePillColor(score) {
  if (score >= 7) return "#22c55e";
  if (score >= 4) return "#f59e0b";
  return "#ef4444";
}

function formatTime(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatDurShort(secs) {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ─── Score Dimension Bar ─────────────────────────────────────

function DimensionBar({ label, score, note }) {
  const pct = (score / 10) * 100;
  const clr = scorePillColor(score);
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 3,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: "#8b96a5",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            color: clr,
          }}
        >
          {score}/10
        </span>
      </div>
      <div
        style={{
          height: 4,
          background: "rgba(255,255,255,0.06)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: clr,
            borderRadius: 2,
            transition: "width 0.4s ease",
          }}
        />
      </div>
      {note && (
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
          {note}
        </div>
      )}
    </div>
  );
}

// ─── Detail Modal ────────────────────────────────────────────

function CallDetailModal({ call, onClose, onSourceSaved }) {
  const [sourceName, setSourceName] = useState(
    call.caseMatch?.sourceName || "",
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const score = call.callScore || {};
  const dims = score.dimensions || {};
  const details = score.key_details || {};
  const vm = VERDICT_META[score.lead_verdict] || VERDICT_META.cold;

  async function saveSource() {
    if (!sourceName.trim()) return;
    setSaving(true);
    try {
      const resp = await fetch(`${API}/admin/contacts/${call._id}/source`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceName: sourceName.trim() }),
      });
      const data = await resp.json();
      if (data.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        if (onSourceSaved) onSourceSaved(call._id, sourceName.trim());
      }
    } catch (err) {
      console.error("Save source failed:", err);
    }
    setSaving(false);
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.modalHeader}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#e6ecf2" }}>
              {call.caseMatch?.name ||
                call.phoneFormatted ||
                call.phone ||
                "Unknown"}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
              {call.agentName} ·{" "}
              {formatDate(call.callStartTime || call.createdAt)}{" "}
              {formatTime(call.callStartTime || call.createdAt)} ·{" "}
              {formatDurShort(call.durationSeconds)}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {call.transcription?.recordingUri && (
              <>
                <button
                  onClick={() => {
                    const audio = new Audio(
                      `${API}/admin/contacts/${call._id}/recording`,
                    );
                    audio
                      .play()
                      .catch(() =>
                        window.open(
                          `${API}/admin/contacts/${call._id}/recording`,
                          "_blank",
                        ),
                      );
                  }}
                  style={styles.recPlayBtn}
                  title="Play recording"
                >
                  ▶
                </button>
                <a
                  href={`${API}/admin/contacts/${call._id}/recording?download=1`}
                  style={styles.recDownloadBtn}
                  title="Download recording"
                >
                  ↓
                </a>
              </>
            )}
            <button onClick={onClose} style={styles.closeBtn}>
              ✕
            </button>
          </div>
        </div>

        <div style={styles.modalBody}>
          {/* Top row: Score + Verdict + Case Info */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            {/* Big score circle */}
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: `rgba(${score.overall >= 7 ? "34,197,94" : score.overall >= 4 ? "245,158,11" : "239,68,68"},0.12)`,
                border: `2px solid ${scorePillColor(score.overall)}`,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: scorePillColor(score.overall),
                }}
              >
                {score.overall || "?"}
              </span>
            </div>

            <div style={{ flex: 1 }}>
              {/* Verdict badge */}
              <span
                style={{
                  display: "inline-block",
                  padding: "3px 10px",
                  borderRadius: 5,
                  background: vm.bg,
                  border: `1px solid ${vm.border}`,
                  color: vm.color,
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                }}
              >
                {vm.label}
              </span>

              {/* Case info */}
              <div style={{ fontSize: 12, color: "#8b96a5", marginTop: 6 }}>
                {call.caseMatch?.caseId ? (
                  <span>
                    {call.caseMatch.domain} #{call.caseMatch.caseId}
                  </span>
                ) : (
                  <span style={{ color: "#4b5563" }}>No Logics case</span>
                )}
                {call.phoneFormatted && (
                  <span style={{ marginLeft: 10, color: "#6b7280" }}>
                    {call.phoneFormatted}
                  </span>
                )}
              </div>

              {/* Key details tags */}
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  marginTop: 8,
                }}
              >
                {details.answered !== undefined && (
                  <Tag
                    label={details.answered ? "Answered" : "No Answer"}
                    color={details.answered ? "#22c55e" : "#ef4444"}
                  />
                )}
                {details.voicemail && <Tag label="Voicemail" color="#f59e0b" />}
                {details.tax_type && details.tax_type !== "none" && (
                  <Tag
                    label={`Tax: ${details.tax_type.toUpperCase()}`}
                    color="#60a5fa"
                  />
                )}
                {details.willing_to_proceed &&
                  details.willing_to_proceed !== "n/a" && (
                    <Tag
                      label={`Proceed: ${details.willing_to_proceed}`}
                      color={
                        details.willing_to_proceed === "yes"
                          ? "#22c55e"
                          : "#9ca3af"
                      }
                    />
                  )}
              </div>
            </div>
          </div>

          {/* Source name editor */}
          <div style={styles.sourceSection}>
            <label
              style={{
                fontSize: 11,
                color: "#8b96a5",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom: 4,
                display: "block",
              }}
            >
              Lead Source
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <select
                value={sourceName}
                onChange={(e) => {
                  setSourceName(e.target.value);
                }}
                style={styles.sourceInput}
              >
                <option value="">— Select source —</option>
                <option value="VF Google">VF Google</option>
                <option value="VF Face/Insta">VF Face/Insta</option>
                <option value="VF TikTok">VF TikTok</option>
                <option value="VF Landing Page">VF Landing Page</option>
                <option value="LD Posting">LD Posting</option>
                <option value="Affiliate">Affiliate</option>
                <option value="Facebook Messenger">Facebook Messenger</option>
              </select>
              <button
                onClick={saveSource}
                disabled={saving || !sourceName.trim()}
                style={{
                  ...styles.sourceBtn,
                  opacity: saving || !sourceName.trim() ? 0.4 : 1,
                  background: saved
                    ? "rgba(34,197,94,0.15)"
                    : "rgba(59,130,246,0.15)",
                  borderColor: saved
                    ? "rgba(34,197,94,0.3)"
                    : "rgba(59,130,246,0.3)",
                  color: saved ? "#22c55e" : "#60a5fa",
                }}
              >
                {saving ? "..." : saved ? "✓" : "Save"}
              </button>
            </div>
          </div>

          {/* Summary */}
          {score.summary && (
            <div style={styles.summaryBox}>
              <div
                style={{
                  fontSize: 11,
                  color: "#8b96a5",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: 6,
                }}
              >
                AI Summary
              </div>
              <div style={{ fontSize: 13, color: "#c5cdd8", lineHeight: 1.5 }}>
                {score.summary}
              </div>
            </div>
          )}

          {/* Red flags */}
          {score.red_flags?.length > 0 && (
            <div style={styles.redFlagBox}>
              <div
                style={{
                  fontSize: 11,
                  color: "#fca5a5",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: 6,
                }}
              >
                Red Flags
              </div>
              {score.red_flags.map((f, i) => (
                <div
                  key={i}
                  style={{ fontSize: 12, color: "#f87171", marginBottom: 2 }}
                >
                  ⚠ {f}
                </div>
              ))}
            </div>
          )}

          {/* Scoring dimensions */}
          <div style={{ marginTop: 16 }}>
            <div
              style={{
                fontSize: 11,
                color: "#8b96a5",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom: 10,
              }}
            >
              Scoring Breakdown
            </div>
            {dims.contactability && (
              <DimensionBar
                label="Contactability"
                score={dims.contactability.score}
                note={dims.contactability.note}
              />
            )}
            {dims.legitimacy && (
              <DimensionBar
                label="Legitimacy"
                score={dims.legitimacy.score}
                note={dims.legitimacy.note}
              />
            )}
            {dims.tax_issue_present && (
              <DimensionBar
                label="Tax Issue Present"
                score={dims.tax_issue_present.score}
                note={dims.tax_issue_present.note}
              />
            )}
            {dims.interest_level && (
              <DimensionBar
                label="Interest Level"
                score={dims.interest_level.score}
                note={dims.interest_level.note}
              />
            )}
            {dims.qualification && (
              <DimensionBar
                label="Qualification"
                score={dims.qualification.score}
                note={dims.qualification.note}
              />
            )}
          </div>

          {/* Transcript */}
          {call.transcription?.text && (
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "#8b96a5",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: 8,
                }}
              >
                Transcript
              </div>
              <div style={styles.transcriptBox}>{call.transcription.text}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Tag({ label, color }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 7px",
        borderRadius: 4,
        background: `${color}18`,
        border: `1px solid ${color}40`,
        color,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: "0.3px",
      }}
    >
      {label}
    </span>
  );
}

// ─── Main Panel ──────────────────────────────────────────────

export default function ScoredCallsPanel() {
  const [calls, setCalls] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({
    verdict: "",
    agent: "",
    source: "",
  });
  const [showArchived, setShowArchived] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (filters.verdict) params.set("verdict", filters.verdict);
      if (filters.agent) params.set("agent", filters.agent);
      if (filters.source) params.set("source", filters.source);
      if (showArchived) params.set("showArchived", "1");

      const resp = await fetch(`${API}/admin/contacts/scored/all?${params}`);
      const data = await resp.json();
      if (data.success) {
        setCalls(data.activities || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error("Failed to fetch scored calls:", err);
    }
    setLoading(false);
  }, [filters, showArchived]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  // Listen for new transcriptions via SSE
  useEffect(() => {
    const evtSource = new EventSource(`${API}/events`);
    evtSource.addEventListener("transcriptionComplete", () => {
      fetchCalls();
    });
    return () => evtSource.close();
  }, [fetchCalls]);

  function handleSourceSaved(id, newSource) {
    setCalls((prev) =>
      prev.map((c) =>
        c._id === id
          ? { ...c, caseMatch: { ...c.caseMatch, sourceName: newSource } }
          : c,
      ),
    );
  }

  async function archiveCalls() {
    if (
      !window.confirm(
        `Archive ${calls.length} scored call(s)? They'll clear from this view but remain in the database and daily reports.`,
      )
    )
      return;
    setArchiving(true);
    try {
      const resp = await fetch(`${API}/admin/contacts/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await resp.json();
      if (data.success) {
        fetchCalls();
      }
    } catch (err) {
      console.error("Archive failed:", err);
    }
    setArchiving(false);
  }

  // Stats
  const avgScore =
    calls.length > 0
      ? (
          calls.reduce((sum, c) => sum + (c.callScore?.overall || 0), 0) /
          calls.length
        ).toFixed(1)
      : "—";
  const verdictCounts = {};
  calls.forEach((c) => {
    const v = c.callScore?.lead_verdict || "unknown";
    verdictCounts[v] = (verdictCounts[v] || 0) + 1;
  });

  return (
    <div style={{ padding: "0 4px" }}>
      {/* Stats bar */}
      <div style={styles.statsBar}>
        <StatBox label="Total Scored" value={total} />
        <StatBox
          label="Avg Score"
          value={avgScore}
          color={scorePillColor(parseFloat(avgScore) || 0)}
        />
        {Object.entries(verdictCounts).map(([v, count]) => {
          const vm = VERDICT_META[v];
          return vm ? (
            <StatBox key={v} label={vm.label} value={count} color={vm.color} />
          ) : null;
        })}
      </div>

      {/* Filters */}
      <div style={styles.filterBar}>
        <select
          value={filters.verdict}
          onChange={(e) =>
            setFilters((f) => ({ ...f, verdict: e.target.value }))
          }
          style={styles.filterSelect}
        >
          <option value="">All Verdicts</option>
          <option value="hot">Hot</option>
          <option value="warm">Warm</option>
          <option value="cold">Cold</option>
          <option value="dead">Dead</option>
          <option value="fake">Fake</option>
        </select>

        <input
          type="text"
          placeholder="Filter agent..."
          value={filters.agent}
          onChange={(e) => setFilters((f) => ({ ...f, agent: e.target.value }))}
          style={styles.filterInput}
        />

        <input
          type="text"
          placeholder="Filter source..."
          value={filters.source}
          onChange={(e) =>
            setFilters((f) => ({ ...f, source: e.target.value }))
          }
          style={styles.filterInput}
        />

        <button onClick={fetchCalls} style={styles.refreshBtn}>
          ↻
        </button>

        <div style={{ flex: 1 }} />

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            fontSize: 11,
            color: "#6b7280",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            style={{ accentColor: "#60a5fa" }}
          />
          Show archived
        </label>

        {calls.length > 0 && !showArchived && (
          <button
            onClick={archiveCalls}
            disabled={archiving}
            style={{
              ...styles.refreshBtn,
              background: "rgba(239,68,68,0.08)",
              borderColor: "rgba(239,68,68,0.25)",
              color: "#f87171",
              opacity: archiving ? 0.5 : 1,
            }}
          >
            {archiving ? "..." : `Clear ${calls.length}`}
          </button>
        )}
      </div>

      {/* Call list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
          Loading scored calls...
        </div>
      ) : calls.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
          No scored calls yet. WYNN outbound calls over 10s will appear here
          once transcribed and scored.
        </div>
      ) : (
        <div style={styles.callList}>
          {calls.map((call) => {
            const score = call.callScore || {};
            const vm = VERDICT_META[score.lead_verdict] || VERDICT_META.cold;
            return (
              <div
                key={call._id}
                style={styles.callRow}
                onClick={() => setSelected(call)}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "rgba(255,255,255,0.04)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                {/* Score pill */}
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: `${scorePillColor(score.overall)}18`,
                    border: `1px solid ${scorePillColor(score.overall)}40`,
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: scorePillColor(score.overall),
                    }}
                  >
                    {score.overall || "?"}
                  </span>
                </div>

                {/* Main info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#e6ecf2",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {call.caseMatch?.name ||
                        call.phoneFormatted ||
                        call.phone ||
                        "Unknown"}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: vm.bg,
                        border: `1px solid ${vm.border}`,
                        color: vm.color,
                        fontFamily: "'JetBrains Mono', monospace",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        flexShrink: 0,
                      }}
                    >
                      {vm.label}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#6b7280",
                      marginTop: 2,
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span>{call.agentName}</span>
                    <span>·</span>
                    <span>{call.phoneFormatted || call.phone}</span>
                    <span>·</span>
                    <span>{formatDurShort(call.durationSeconds)}</span>
                    {call.caseMatch?.caseId && (
                      <>
                        <span>·</span>
                        <span style={{ color: "#4b9cd3" }}>
                          {call.caseMatch.domain} #{call.caseMatch.caseId}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Source + time */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: call.caseMatch?.sourceName ? "#60a5fa" : "#4b5563",
                      marginBottom: 2,
                    }}
                  >
                    {call.caseMatch?.sourceName || "no source"}
                  </div>
                  <div style={{ fontSize: 11, color: "#4b5563" }}>
                    {formatDate(call.callStartTime || call.createdAt)}{" "}
                    {formatTime(call.callStartTime || call.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <CallDetailModal
          call={selected}
          onClose={() => setSelected(null)}
          onSourceSaved={handleSourceSaved}
        />
      )}
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div style={styles.statBox}>
      <div
        style={{
          fontSize: 10,
          color: "#6b7280",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 800,
          fontFamily: "'JetBrains Mono', monospace",
          color: color || "#e6ecf2",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = {
  statsBar: {
    display: "flex",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  statBox: {
    padding: "10px 16px",
    borderRadius: 8,
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.06)",
    minWidth: 80,
  },
  filterBar: {
    display: "flex",
    gap: 8,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  filterSelect: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 6,
    padding: "6px 10px",
    color: "#c5cdd8",
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    outline: "none",
  },
  filterInput: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 6,
    padding: "6px 10px",
    color: "#c5cdd8",
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    outline: "none",
    width: 140,
  },
  refreshBtn: {
    background: "rgba(59,130,246,0.1)",
    border: "1px solid rgba(59,130,246,0.25)",
    borderRadius: 6,
    padding: "6px 12px",
    color: "#60a5fa",
    fontSize: 14,
    cursor: "pointer",
    fontWeight: 700,
  },
  callList: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  callRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 8,
    cursor: "pointer",
    transition: "background 0.15s",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
  },
  // Modal
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: 20,
  },
  modal: {
    background: "#151b23",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    width: "100%",
    maxWidth: 620,
    maxHeight: "85vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "18px 20px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  modalBody: {
    padding: "16px 20px 20px",
    overflowY: "auto",
    flex: 1,
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#6b7280",
    fontSize: 18,
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: 4,
    lineHeight: 1,
  },
  recPlayBtn: {
    background: "rgba(34,197,94,0.1)",
    border: "1px solid rgba(34,197,94,0.3)",
    borderRadius: 6,
    padding: "5px 10px",
    color: "#22c55e",
    fontSize: 12,
    cursor: "pointer",
    fontWeight: 700,
    lineHeight: 1,
  },
  recDownloadBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(59,130,246,0.1)",
    border: "1px solid rgba(59,130,246,0.3)",
    borderRadius: 6,
    padding: "5px 10px",
    color: "#60a5fa",
    fontSize: 14,
    cursor: "pointer",
    fontWeight: 700,
    textDecoration: "none",
    lineHeight: 1,
  },
  sourceSection: {
    padding: "12px 14px",
    background: "rgba(59,130,246,0.04)",
    border: "1px solid rgba(59,130,246,0.12)",
    borderRadius: 8,
    marginBottom: 14,
  },
  sourceInput: {
    flex: 1,
    background: "rgba(0,0,0,0.3)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 6,
    padding: "7px 10px",
    color: "#e6ecf2",
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
    outline: "none",
  },
  sourceBtn: {
    border: "1px solid",
    borderRadius: 6,
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
    transition: "all 0.2s",
  },
  summaryBox: {
    padding: "12px 14px",
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 8,
    marginBottom: 14,
  },
  redFlagBox: {
    padding: "12px 14px",
    background: "rgba(239,68,68,0.04)",
    border: "1px solid rgba(239,68,68,0.12)",
    borderRadius: 8,
    marginBottom: 14,
  },
  transcriptBox: {
    padding: "14px 16px",
    background: "rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.04)",
    borderRadius: 8,
    fontSize: 12,
    color: "#9ca3af",
    lineHeight: 1.7,
    fontFamily: "'JetBrains Mono', monospace",
    maxHeight: 250,
    overflowY: "auto",
    whiteSpace: "pre-wrap",
  },
};
