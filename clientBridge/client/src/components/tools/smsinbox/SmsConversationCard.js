import React, { useState, useEffect } from "react";
import { useSms } from "../../../hooks/useSms";

function timeLeft(autoSendAt) {
  if (!autoSendAt) return null;
  const ms = new Date(autoSendAt) - Date.now();
  if (ms <= 0) return "sending...";
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}:${rem.toString().padStart(2, "0")}`;
}

export default function SmsConversationCard({ conversation }) {
  const {
    approveResponse,
    cancelResponse,
    editAndSend,
    regenerateResponse,
    sleepBot,
    wakeBot,
    fetchConversation,
  } = useSms();

  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState("");
  const [countdown, setCountdown] = useState(null);
  const [dncSent, setDncSent] = useState(conversation.logicsDncSent || false);
  const [dncLoading, setDncLoading] = useState(false);

  const c = conversation;
  const lastInbound = [...(c.messages || [])]
    .reverse()
    .find((m) => m.direction === "inbound");
  const pending = c.responseStatus === "pending";

  // Countdown timer
  useEffect(() => {
    if (!c.autoSendAt) {
      setCountdown(null);
      return;
    }
    const tick = () => setCountdown(timeLeft(c.autoSendAt));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [c.autoSendAt]);

  // Sync DNC state if conversation refreshes
  useEffect(() => {
    setDncSent(c.logicsDncSent || false);
  }, [c.logicsDncSent]);

  const handleEdit = () => {
    setEditText(c.proposedResponse || "");
    setEditMode(true);
  };

  const handleEditSend = () => {
    editAndSend(c._id, editText);
    setEditMode(false);
  };

  const handleDnc = async () => {
    if (
      !window.confirm(
        `Mark ${c.leadName || c.customerPhone} as DNC (status 173) in Logics?`,
      )
    )
      return;

    setDncLoading(true);
    try {
      const res = await fetch(`/api/sms/conversations/${c._id}/dnc`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.ok) {
        setDncSent(true);
      } else {
        alert("Failed: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
    setDncLoading(false);
  };

  const typeColor =
    c.contactType === "client"
      ? "#3b82f6"
      : c.contactType === "opt-out"
        ? "#dc2626"
        : c.contactType === "prospect"
          ? "#f59e0b"
          : "#6b7280";

  const statusBadge = {
    pending: { bg: "#fef3c7", color: "#92400e", label: "Pending" },
    sent: { bg: "#d1fae5", color: "#065f46", label: "Sent" },
    cancelled: { bg: "#fee2e2", color: "#991b1b", label: "Cancelled" },
    idle: { bg: "#f3f4f6", color: "#374151", label: "Idle" },
    edited: { bg: "#dbeafe", color: "#1e40af", label: "Edited" },
  }[c.responseStatus] || {
    bg: "#f3f4f6",
    color: "#374151",
    label: c.responseStatus,
  };

  return (
    <div
      className="card border p-4 shadow-sm mb-4"
      style={{ position: "relative" }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <div>
          <span style={{ fontWeight: 600, fontSize: 16 }}>
            {c.leadName || c.customerPhone}
          </span>
          <span
            style={{
              marginLeft: 8,
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 4,
              background: typeColor,
              color: "#fff",
            }}
          >
            {c.contactType}
          </span>
          <span
            style={{
              marginLeft: 6,
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 4,
              background: c.company === "TAG" ? "#7c3aed" : "#0ea5e9",
              color: "#fff",
            }}
          >
            {c.company}
          </span>
        </div>
        <span
          style={{
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 4,
            background: statusBadge.bg,
            color: statusBadge.color,
          }}
        >
          {statusBadge.label}
        </span>
      </div>

      {/* Meta */}
      <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
        <span>{c.customerPhone}</span>
        {c.caseId && <span style={{ marginLeft: 12 }}>Case #{c.caseId}</span>}
        {c.lastInboundAt && (
          <span style={{ marginLeft: 12 }}>
            {new Date(c.lastInboundAt).toLocaleString()}
          </span>
        )}
      </div>

      {/* Their message */}
      {lastInbound && (
        <div
          style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "8px 12px",
            marginBottom: 8,
          }}
        >
          <div style={{ fontSize: 11, color: "#999", marginBottom: 2 }}>
            Their message:
          </div>
          <div style={{ fontSize: 14 }}>"{lastInbound.content}"</div>
        </div>
      )}

      {/* Proposed response */}
      {c.proposedResponse && !editMode && (
        <div
          style={{
            background: pending ? "#fffbeb" : "#f0fdf4",
            border: `1px solid ${pending ? "#fde68a" : "#bbf7d0"}`,
            borderRadius: 8,
            padding: "8px 12px",
            marginBottom: 8,
          }}
        >
          <div style={{ fontSize: 11, color: "#999", marginBottom: 2 }}>
            Proposed response:
          </div>
          <div style={{ fontSize: 14 }}>"{c.proposedResponse}"</div>
        </div>
      )}

      {/* Edit mode */}
      {editMode && (
        <div style={{ marginBottom: 8 }}>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={3}
            style={{
              width: "100%",
              padding: 8,
              border: "1px solid #ccc",
              borderRadius: 6,
              fontSize: 14,
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button className="button primary" onClick={handleEditSend}>
              Send Edited
            </button>
            <button className="button" onClick={() => setEditMode(false)}>
              Cancel Edit
            </button>
          </div>
        </div>
      )}

      {/* Timer */}
      {pending && countdown && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
            fontSize: 13,
            color: "#b45309",
          }}
        >
          <span>⏱</span>
          <span>Auto-send in {countdown}</span>
        </div>
      )}

      {/* Bot sleeping indicator */}
      {c.botSleeping && (
        <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 8 }}>
          🛑 Bot paused — manual takeover
        </div>
      )}

      {/* Actions */}
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {pending && (
          <>
            <button
              className="button primary"
              onClick={() => approveResponse(c._id)}
              style={{ fontSize: 12 }}
            >
              ✓ Send Now
            </button>
            <button
              className="button"
              onClick={handleEdit}
              style={{ fontSize: 12 }}
            >
              ✏️ Edit
            </button>
            <button
              className="button"
              onClick={() => regenerateResponse(c._id)}
              style={{ fontSize: 12 }}
            >
              🔄 Regenerate
            </button>
            <button
              className="button"
              onClick={() => cancelResponse(c._id)}
              style={{ fontSize: 12, color: "#dc2626" }}
            >
              ✗ Cancel
            </button>
          </>
        )}

        {!c.botSleeping ? (
          <button
            className="button"
            onClick={() => sleepBot(c._id)}
            style={{ fontSize: 12 }}
          >
            🛑 Pause Bot
          </button>
        ) : (
          <button
            className="button"
            onClick={() => wakeBot(c._id)}
            style={{ fontSize: 12 }}
          >
            ▶️ Wake Bot
          </button>
        )}

        <button
          className="button"
          onClick={() => fetchConversation(c._id)}
          style={{ fontSize: 12 }}
        >
          💬 View Thread
        </button>

        {/* DNC button — opt-out conversations only */}
        {c.contactType === "opt-out" && !dncSent && (
          <button
            className="button"
            onClick={handleDnc}
            disabled={dncLoading}
            style={{
              fontSize: 12,
              color: "#ef4444",
              borderColor: "#ef4444",
              opacity: dncLoading ? 0.5 : 1,
            }}
          >
            {dncLoading ? "Updating..." : "⛔ DNC in Logics"}
          </button>
        )}
        {dncSent && (
          <span style={{ fontSize: 11, color: "#666" }}>
            ✓ DNC sent to Logics
          </span>
        )}
      </div>
    </div>
  );
}
