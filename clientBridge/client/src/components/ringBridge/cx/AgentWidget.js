// components/ringBridge/cx/AgentWidget.js
// ─────────────────────────────────────────────────────────────
// Standalone agent control panel. Designed to be:
//   - Pinned as a Chrome tab (bookmark yoursite.com/agent)
//   - Popped out as a narrow window
//   - Embedded in a Chrome extension iframe
//
// No navbar. Same auth cookie as the main app.
// Agent picks their extension on first use (saved to localStorage).
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect } from "react";
import { useCxAgent } from "../../../hooks/useCxAgent";
import { api } from "../../../utils/api";

const STATE_COLORS = {
  Available: "#22c55e",
  Unavailable: "#f59e0b",
  InboundContact: "#3b82f6",
  OutboundContact: "#00d4ff",
  AfterCallWork: "#a855f7",
  LoggedOff: "#5c6775",
  OnCall: "#3b82f6",
  Ringing: "#f59e0b",
  Idle: "#22c55e",
  Unknown: "#5c6775",
};

export default function AgentWidget() {
  const [extensionId, setExtensionId] = useState(
    () => localStorage.getItem("tcb_agent_ext") || ""
  );
  const [agents, setAgents] = useState([]);
  const [dncPhone, setDncPhone] = useState("");
  const [lastAction, setLastAction] = useState(null);

  const { status, loading, setAvailable, setUnavailable, markDnc, freezeProspect } = useCxAgent(extensionId);

  // Fetch available agents for the picker
  useEffect(() => {
    api.get("/ringbridge/api/admin/agents")
      .then((res) => setAgents(res.data?.agents || res.data || []))
      .catch(() => {});
  }, []);

  const selectAgent = (ext) => {
    setExtensionId(ext);
    localStorage.setItem("tcb_agent_ext", ext);
  };

  const handleDnc = async () => {
    if (!dncPhone) return;
    await markDnc(dncPhone, "WYNN");
    setLastAction({ type: "dnc", phone: dncPhone, time: new Date() });
    setDncPhone("");
  };

  const handleFreeze = async () => {
    if (!dncPhone) return;
    await freezeProspect(dncPhone, "WYNN");
    setLastAction({ type: "freeze", phone: dncPhone, time: new Date() });
    setDncPhone("");
  };

  const isAvailable = status?.cxState === "Available" && !status?.widgetOverride;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0e14",
      color: "#e6ecf2",
      fontFamily: "'Inter', -apple-system, sans-serif",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "20px 12px",
    }}>
      {/* Header */}
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 14,
        fontWeight: 700,
        color: "#00ff88",
        letterSpacing: 2,
        marginBottom: 4,
      }}>
        TCB
      </div>
      <div style={{ fontSize: 10, color: "#5c6775", marginBottom: 20, fontFamily: "'JetBrains Mono', monospace" }}>
        AGENT CONTROL
      </div>

      <div style={{ width: "100%", maxWidth: 320 }}>
        {/* Agent Picker */}
        {!extensionId && (
          <div style={{
            background: "#12171f",
            border: "1px solid #1e2530",
            borderRadius: 8,
            padding: 20,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 12, color: "#5c6775", marginBottom: 12, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase" }}>
              Select Your Extension
            </div>
            {agents.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {agents.map((a) => (
                  <button
                    key={a.extensionId || a._id}
                    onClick={() => selectAgent(a.extensionId || a._id)}
                    style={{
                      padding: "10px 14px",
                      background: "#0a0e14",
                      border: "1px solid #1e2530",
                      borderRadius: 6,
                      color: "#e6ecf2",
                      cursor: "pointer",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 12,
                      textAlign: "left",
                    }}
                  >
                    {a.name || a.agentName || a.extensionId}
                    <span style={{ float: "right", color: "#5c6775" }}>ext:{a.extensionId || a._id}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ color: "#5c6775", fontSize: 12 }}>
                Loading agents...
              </div>
            )}
          </div>
        )}

        {/* Status + Controls */}
        {extensionId && (
          <>
            {/* Agent name + change */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {status?.agentName || `Ext ${extensionId}`}
              </div>
              <button
                onClick={() => { setExtensionId(""); localStorage.removeItem("tcb_agent_ext"); }}
                style={{
                  background: "none", border: "none", color: "#5c6775",
                  fontSize: 10, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                SWITCH
              </button>
            </div>

            {/* Big status indicator */}
            <div style={{
              background: "#12171f",
              border: "1px solid #1e2530",
              borderRadius: 12,
              padding: 24,
              textAlign: "center",
              marginBottom: 16,
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                background: STATE_COLORS[status?.cxState] || "#5c6775",
                margin: "0 auto 12px",
                boxShadow: `0 0 20px ${STATE_COLORS[status?.cxState] || "#5c6775"}40`,
              }} />
              <div style={{
                fontSize: 18, fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                color: STATE_COLORS[status?.cxState] || "#5c6775",
                marginBottom: 4,
              }}>
                {status?.cxState || "NOT CONNECTED"}
              </div>
              <div style={{ fontSize: 10, color: "#5c6775", fontFamily: "'JetBrains Mono', monospace" }}>
                EX: {status?.exState || "?"} {status?.widgetOverride ? `| OVERRIDE: ${status.widgetOverride}` : ""}
              </div>
            </div>

            {/* Availability toggle */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button
                onClick={async () => { await setAvailable(); setLastAction({ type: "available", time: new Date() }); }}
                disabled={loading || isAvailable}
                style={{
                  flex: 1, padding: 14, border: "none", borderRadius: 8,
                  fontSize: 13, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
                  fontFamily: "'JetBrains Mono', monospace",
                  background: isAvailable ? "#22c55e" : "#12171f",
                  color: isAvailable ? "#0a0e14" : "#22c55e",
                  border: `1px solid ${isAvailable ? "#22c55e" : "#1e2530"}`,
                }}
              >
                AVAILABLE
              </button>
              <button
                onClick={async () => { await setUnavailable(); setLastAction({ type: "unavailable", time: new Date() }); }}
                disabled={loading || (status?.widgetOverride === "unavailable")}
                style={{
                  flex: 1, padding: 14, border: "none", borderRadius: 8,
                  fontSize: 13, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
                  fontFamily: "'JetBrains Mono', monospace",
                  background: !isAvailable && status?.widgetOverride ? "#f59e0b" : "#12171f",
                  color: !isAvailable && status?.widgetOverride ? "#0a0e14" : "#f59e0b",
                  border: `1px solid ${!isAvailable && status?.widgetOverride ? "#f59e0b" : "#1e2530"}`,
                }}
              >
                UNAVAILABLE
              </button>
            </div>

            {/* Lead controls */}
            <div style={{
              background: "#12171f",
              border: "1px solid #1e2530",
              borderRadius: 8,
              padding: 16,
              marginBottom: 16,
            }}>
              <div style={{
                fontSize: 10, color: "#5c6775", marginBottom: 10,
                fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1,
              }}>
                Lead Controls
              </div>
              <input
                type="tel"
                placeholder="Phone number"
                value={dncPhone}
                onChange={(e) => setDncPhone(e.target.value)}
                style={{
                  width: "100%", padding: 10, marginBottom: 8,
                  background: "#0a0e14", border: "1px solid #1e2530", borderRadius: 6,
                  color: "#e6ecf2", fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 14, letterSpacing: 1, textAlign: "center",
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleDnc}
                  disabled={!dncPhone || loading}
                  style={{
                    flex: 1, padding: 10, borderRadius: 6, border: "1px solid #ef4444",
                    background: "transparent", color: "#ef4444", fontWeight: 600,
                    fontSize: 11, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  DNC
                </button>
                <button
                  onClick={handleFreeze}
                  disabled={!dncPhone || loading}
                  style={{
                    flex: 1, padding: 10, borderRadius: 6, border: "1px solid #f59e0b",
                    background: "transparent", color: "#f59e0b", fontWeight: 600,
                    fontSize: 11, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  FREEZE
                </button>
              </div>
              <div style={{ fontSize: 9, color: "#5c6775", marginTop: 8, lineHeight: 1.4 }}>
                DNC = permanent removal from all contact lists.
                Freeze = pause automated outreach, keep lead for manual follow-up.
              </div>
            </div>

            {/* Last action feedback */}
            {lastAction && (
              <div style={{
                background: lastAction.type === "dnc" ? "rgba(239,68,68,0.08)" :
                  lastAction.type === "freeze" ? "rgba(245,158,11,0.08)" :
                  lastAction.type === "available" ? "rgba(34,197,94,0.08)" :
                  "rgba(245,158,11,0.08)",
                border: `1px solid ${
                  lastAction.type === "dnc" ? "#ef4444" :
                  lastAction.type === "freeze" ? "#f59e0b" :
                  lastAction.type === "available" ? "#22c55e" : "#f59e0b"
                }`,
                borderRadius: 6,
                padding: "8px 12px",
                fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                color: "#c5cdd8",
              }}>
                {lastAction.type === "dnc" && `DNC: ${lastAction.phone}`}
                {lastAction.type === "freeze" && `Frozen: ${lastAction.phone}`}
                {lastAction.type === "available" && "Set to Available"}
                {lastAction.type === "unavailable" && "Set to Unavailable"}
                <span style={{ float: "right", color: "#5c6775" }}>
                  {lastAction.time.toLocaleTimeString()}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
