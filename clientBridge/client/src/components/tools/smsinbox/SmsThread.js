import React, { useState, useEffect, useRef } from "react";
import { useSms } from "../../../hooks/useSms";

export default function SmsThread() {
  const {
    activeConversation: convo,
    clearActiveConversation,
    manualSend,
    approveResponse,
    cancelResponse,
    regenerateResponse,
  } = useSms();

  const [reply, setReply] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [convo?.messages?.length]);

  if (!convo) return null;

  const handleReply = () => {
    if (!reply.trim()) return;
    manualSend(convo._id, reply.trim());
    setReply("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleReply();
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: 420,
        height: "100vh",
        background: "#fff",
        boxShadow: "-4px 0 20px rgba(0,0,0,0.15)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>
            {convo.leadName || convo.customerPhone}
          </div>
          <div style={{ fontSize: 12, color: "#666" }}>
            {convo.customerPhone}
            {convo.caseId && ` · Case #${convo.caseId}`}
            {` · ${convo.company}`}
          </div>
        </div>
        <button
          onClick={clearActiveConversation}
          style={{
            background: "none",
            border: "none",
            fontSize: 20,
            cursor: "pointer",
            color: "#666",
          }}
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {(convo.messages || []).map((msg, i) => {
          const isInbound = msg.direction === "inbound";
          const isPending = msg.status === "pending";
          const isCancelled = msg.status === "cancelled";

          return (
            <div
              key={i}
              style={{
                alignSelf: isInbound ? "flex-start" : "flex-end",
                maxWidth: "80%",
              }}
            >
              <div
                style={{
                  background: isInbound
                    ? "#f3f4f6"
                    : isPending
                      ? "#fffbeb"
                      : isCancelled
                        ? "#fee2e2"
                        : "#dbeafe",
                  border: `1px solid ${
                    isInbound
                      ? "#e5e7eb"
                      : isPending
                        ? "#fde68a"
                        : isCancelled
                          ? "#fecaca"
                          : "#bfdbfe"
                  }`,
                  borderRadius: 12,
                  padding: "8px 12px",
                  fontSize: 14,
                  opacity: isCancelled ? 0.5 : 1,
                  textDecoration: isCancelled ? "line-through" : "none",
                }}
              >
                {msg.editedContent || msg.content}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "#999",
                  marginTop: 2,
                  textAlign: isInbound ? "left" : "right",
                }}
              >
                {new Date(msg.timestamp).toLocaleTimeString()}
                {msg.aiGenerated && " · AI"}
                {isPending && " · pending"}
                {isCancelled && " · cancelled"}
                {msg.status === "sent" && " · sent"}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Pending actions */}
      {convo.responseStatus === "pending" && convo.proposedResponse && (
        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid #fde68a",
            background: "#fffbeb",
            display: "flex",
            gap: 6,
          }}
        >
          <button
            className="button primary"
            onClick={() => approveResponse(convo._id)}
            style={{ fontSize: 12 }}
          >
            ✓ Send
          </button>
          <button
            className="button"
            onClick={() => regenerateResponse(convo._id)}
            style={{ fontSize: 12 }}
          >
            🔄
          </button>
          <button
            className="button"
            onClick={() => cancelResponse(convo._id)}
            style={{ fontSize: 12, color: "#dc2626" }}
          >
            ✗
          </button>
        </div>
      )}

      {/* Reply box */}
      <div
        style={{
          padding: "8px 16px 12px",
          borderTop: "1px solid #e5e7eb",
          display: "flex",
          gap: 8,
        }}
      >
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a reply..."
          rows={2}
          style={{
            flex: 1,
            padding: 8,
            border: "1px solid #ccc",
            borderRadius: 8,
            fontSize: 14,
            resize: "none",
          }}
        />
        <button
          className="button primary"
          onClick={handleReply}
          disabled={!reply.trim()}
          style={{ alignSelf: "flex-end", fontSize: 13 }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
