import { useState } from "react";

const phases = [
  {
    id: 1,
    label: "Phase 1",
    title: "Critical Fixes",
    subtitle: "Deploy Immediately",
    color: "#ef4444",
    accent: "#fca5a5",
    steps: [
      {
        id: "p1-files",
        type: "deploy",
        label: "Deploy Service Files",
        items: [
          {
            id: "f1",
            text: "dropRvmService.js → services/dropRvmService.js",
            detail:
              "Success code 1038, permanent DNC codes, company param, verbose logging",
          },
          {
            id: "f2",
            text: "cadenceEngine.js → services/cadenceEngine.js",
            detail:
              "Permanent fail handling, biz hours 8-6, freshness gate, pauseOutreachUntil",
          },
        ],
      },
      {
        id: "p1-webhook",
        type: "code",
        label: "webhook.js Manual Patches",
        items: [
          {
            id: "w1",
            text: "Fix 1 — rvmNum passthrough",
            detail: "dropRvm: add rvmNum, company params to dropVoicemail call",
          },
          {
            id: "w2",
            text: "Fix 2 — tick logging RVM count",
            detail: "Add rvmsDropped || 0 to cron log output",
          },
        ],
      },
      {
        id: "p1-verify",
        type: "verify",
        label: "Verification (2-3 Ticks)",
        items: [
          {
            id: "v1",
            text: "[DROP-RVM] ✓ RVM queued with ApiStatusCode: 1038",
          },
          {
            id: "v2",
            text: "[DROP-RVM] ✗ PERMANENT FAIL: Failed-National DNC (code 1033)",
          },
          {
            id: "v3",
            text: "RVM sequence numbers progressing: #1 → #2 on next tick",
          },
          { id: "v4", text: "No more RVM #1 repeating 11x for same lead" },
          { id: "v5", text: "Audio URL: .../wynn/rvm-1-intro.wav (not empty)" },
        ],
      },
    ],
  },
  {
    id: 2,
    label: "Phase 2",
    title: "Architecture",
    subtitle: "After Phase 1 Stable",
    color: "#f59e0b",
    accent: "#fcd34d",
    steps: [
      {
        id: "p2-files",
        type: "deploy",
        label: "Deploy Service Files",
        items: [
          {
            id: "p2f1",
            text: "statusChecker.js → services/statusChecker.js",
            detail:
              "NEW — Logics status check every 15 min, oldest-first, 13 min time-boxed",
          },
          {
            id: "p2f2",
            text: "migrations.js → config/migrations.js",
            detail:
              "NEW — Backfills company, seeds lastLogicsCheckAt, fixes unique index",
          },
          {
            id: "p2f3",
            text: "connectionChecker.js → services/connectionChecker.js",
            detail: "5+ min call → pauseOutreachUntil tomorrow",
          },
          {
            id: "p2f4",
            text: "LeadCadence.js → models/LeadCadence.js",
            detail:
              "company field, compound unique index, pauseOutreachUntil, lastCallDuration",
          },
          {
            id: "p2f5",
            text: "weeklyDialer.js → services/weeklyDialer.js",
            detail:
              "NEW — Wed/Fri noon RingOut for Day 10+ leads, status 223/57 transitions",
          },
        ],
      },
      {
        id: "p2-webhook",
        type: "code",
        label: "webhook.js Patches",
        items: [
          { id: "p2w1", text: "Add imports: runStatusCheck, runWeeklyDial" },
          {
            id: "p2w2",
            text: "Replace connectDB() with migration-aware startup",
          },
          {
            id: "p2w3",
            text: "Add status checker cron (every 15 min, M-F, LA time)",
          },
          {
            id: "p2w4",
            text: "Add weekly dialer cron (Wed/Fri noon, LA time)",
          },
        ],
      },
      {
        id: "p2-verify",
        type: "verify",
        label: "Verification",
        items: [
          {
            id: "p2v1",
            text: "[MIGRATIONS] ✓ Company field backfilled on first boot",
          },
          {
            id: "p2v2",
            text: "[MIGRATIONS] ✓ lastLogicsCheckAt seeded on first boot",
          },
          {
            id: "p2v3",
            text: "[MIGRATIONS] ✓ Compound unique index created on first boot",
          },
          {
            id: "p2v4",
            text: "[STATUS-CRON] running every 15 min, checking active leads",
          },
          {
            id: "p2v5",
            text: "[CADENCE] Fresh=N Stale=0 — freshness gate passing all leads",
          },
          {
            id: "p2v6",
            text: "[CONNECT-CHECK] ☎ WORKED on 5+ min call detection",
          },
          {
            id: "p2v7",
            text: "Cadence ticks significantly faster (no 325 Logics calls/tick)",
          },
        ],
      },
    ],
  },
  {
    id: 3,
    label: "Phase 3",
    title: "Multi-Company",
    subtitle: "Monday — After P1+P2 Stable",
    color: "#3b82f6",
    accent: "#93c5fd",
    steps: [
      {
        id: "p3-files",
        type: "deploy",
        label: "Deploy Service Files",
        items: [
          {
            id: "p3f1",
            text: "companyConfig.js → config/companyConfig.js",
            detail:
              "NEW — All company-specific settings, FB/TT/payload resolvers",
          },
          {
            id: "p3f2",
            text: "emailService.js → services/emailService.js",
            detail:
              "NEW — 5-email chain, company-aware, replaces sendWelcomeEmail",
          },
          {
            id: "p3f3",
            text: "smsContent.js → services/smsContent.js",
            detail: "Company-aware SMS — pulls name/phone from companyConfig",
          },
          {
            id: "p3f4",
            text: "TAGProspectWelcome templates (5) → Templates/TAGProspectWelcome/handlebars/",
          },
        ],
      },
      {
        id: "p3-webhook",
        type: "code",
        label: "webhook.js Full Multi-Company Patch",
        items: [
          { id: "p3w1", text: "Import companyConfig resolvers" },
          {
            id: "p3w2",
            text: "Replace sendWelcomeEmail/Text/dialLeadNow with company-aware versions",
          },
          { id: "p3w3", text: "Update processLead to accept and flow company" },
          {
            id: "p3w4",
            text: "Update /fb/webhook — resolve company from page_id",
          },
          {
            id: "p3w5",
            text: "Update /tt/webhook — resolve company from advertiser_id",
          },
          {
            id: "p3w6",
            text: "Update /lead-contact — resolve company from payload/headers",
          },
          { id: "p3w7", text: "Update cadenceActions — pass company through" },
        ],
      },
      {
        id: "p3-infra",
        type: "infra",
        label: "Non-JS Infrastructure",
        items: [
          { id: "p3i1", text: "Create audio/wynn/ — move existing WAVs" },
          { id: "p3i2", text: "Create audio/tag/ — record 4 TAG RVM WAVs" },
          {
            id: "p3i3",
            text: "Rename Templates/ProspectWelcome → WynnProspectWelcome",
          },
          {
            id: "p3i4",
            text: "Create Templates/TAGProspectWelcome/ with images/ and attachments/",
          },
          { id: "p3i5", text: "Add all TAG env vars to .env" },
        ],
      },
      {
        id: "p3-api",
        type: "infra",
        label: "API Dashboard Setup",
        items: [
          { id: "p3a1", text: "Drop.co — Create TAG campaign, save token" },
          {
            id: "p3a2",
            text: "CallRail — Get TAG company ID, create tracking number",
          },
          {
            id: "p3a3",
            text: "Facebook — Subscribe TAG page to leadgen webhook, get page token",
          },
          {
            id: "p3a4",
            text: "TikTok — Get TAG advertiser ID, configure webhook",
          },
          { id: "p3a5", text: "RingCentral — Identify TAG caller ID number" },
          {
            id: "p3a6",
            text: "SendGrid — TAG API key / verify taxadvocategroup.com domain",
          },
          {
            id: "p3a7",
            text: "Logics — Create status 223 'Automatic Contact Ended' if not done",
          },
        ],
      },
      {
        id: "p3-verify",
        type: "verify",
        label: "Verification — TAG Test Lead",
        items: [
          {
            id: "p3v1",
            text: "Run curl test: /test-lead?company=tag&doCase=false&doDial=false",
          },
          {
            id: "p3v2",
            text: "TAG welcome email triggers correct template chain",
          },
          {
            id: "p3v3",
            text: "TAG SMS uses correct name/phone from companyConfig",
          },
          { id: "p3v4", text: "TAG RVM audio path: .../tag/rvm-1-intro.wav" },
          {
            id: "p3v5",
            text: "FB webhook resolves company=tag from TAG page_id",
          },
          {
            id: "p3v6",
            text: "TT webhook resolves company=tag from TAG advertiser_id",
          },
        ],
      },
    ],
  },
];

const typeConfig = {
  deploy: { icon: "📦", label: "Deploy" },
  code: { icon: "✏️", label: "Code Patch" },
  verify: { icon: "✅", label: "Verify" },
  infra: { icon: "🔧", label: "Setup" },
};

export default function DeployTracker() {
  const allItemIds = phases.flatMap((p) =>
    p.steps.flatMap((s) => s.items.map((i) => i.id)),
  );
  const [checked, setChecked] = useState({});
  const [notes, setNotes] = useState({});
  const [editingNote, setEditingNote] = useState(null);
  const [noteInput, setNoteInput] = useState("");
  const [activePhase, setActivePhase] = useState(1);
  const [expandedSteps, setExpandedSteps] = useState({});

  const toggle = (id) => setChecked((c) => ({ ...c, [id]: !c[id] }));

  const phaseProgress = (ph) => {
    const ids = ph.steps.flatMap((s) => s.items.map((i) => i.id));
    const done = ids.filter((id) => checked[id]).length;
    return {
      done,
      total: ids.length,
      pct: ids.length ? Math.round((done / ids.length) * 100) : 0,
    };
  };

  const totalProgress = () => {
    const done = allItemIds.filter((id) => checked[id]).length;
    return {
      done,
      total: allItemIds.length,
      pct: allItemIds.length ? Math.round((done / allItemIds.length) * 100) : 0,
    };
  };

  const toggleStep = (id) =>
    setExpandedSteps((e) => ({ ...e, [id]: e[id] === false ? true : false }));
  const phase = phases.find((p) => p.id === activePhase);
  const total = totalProgress();

  return (
    <div
      style={{
        fontFamily: "'IBM Plex Mono', monospace",
        background: "#0a0a0f",
        minHeight: "100vh",
        color: "#e2e8f0",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .item-row:hover { background: rgba(255,255,255,0.03) !important; }
        .phase-tab:hover { opacity: 0.85; }
        .check-box { cursor: pointer; width: 18px; height: 18px; border-radius: 3px; border: 1.5px solid #444; background: transparent; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.15s; }
        .check-box.done { background: #22c55e; border-color: #22c55e; }
        .step-header:hover { background: rgba(255,255,255,0.04); }
      `}</style>

      {/* Header */}
      <div
        style={{
          background: "#0d0d14",
          borderBottom: "1px solid #1e1e2e",
          padding: "20px 28px 16px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "11px",
                letterSpacing: "3px",
                color: "#555",
                textTransform: "uppercase",
                marginBottom: "4px",
              }}
            >
              Wynn / TAG
            </div>
            <div
              style={{
                fontFamily: "'IBM Plex Sans', sans-serif",
                fontSize: "20px",
                fontWeight: 600,
                color: "#f1f5f9",
              }}
            >
              Cadence System Deployment
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: "28px",
                fontWeight: 600,
                color: "#f1f5f9",
                lineHeight: 1,
              }}
            >
              {total.pct}%
            </div>
            <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>
              {total.done} / {total.total} complete
            </div>
          </div>
        </div>
        <div
          style={{
            height: "3px",
            background: "#1a1a2e",
            borderRadius: "2px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${total.pct}%`,
              background: "linear-gradient(90deg, #3b82f6, #22c55e)",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>

      {/* Phase Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid #1a1a2a",
          background: "#0d0d14",
        }}
      >
        {phases.map((p) => {
          const prog = phaseProgress(p);
          const active = activePhase === p.id;
          return (
            <button
              key={p.id}
              className="phase-tab"
              onClick={() => setActivePhase(p.id)}
              style={{
                flex: 1,
                padding: "14px 20px",
                background: active ? "#111120" : "transparent",
                border: "none",
                borderBottom: active
                  ? `2px solid ${p.color}`
                  : "2px solid transparent",
                cursor: "pointer",
                transition: "all 0.15s",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  color: active ? p.accent : "#444",
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  marginBottom: "4px",
                }}
              >
                {p.label}
              </div>
              <div
                style={{
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: active ? "#f1f5f9" : "#555",
                  marginBottom: "6px",
                }}
              >
                {p.title}
              </div>
              <div
                style={{
                  height: "2px",
                  background: "#1a1a2a",
                  borderRadius: "1px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${prog.pct}%`,
                    background: p.color,
                    transition: "width 0.3s",
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: "10px",
                  color: active ? "#666" : "#333",
                  marginTop: "4px",
                }}
              >
                {prog.done}/{prog.total}
              </div>
            </button>
          );
        })}
      </div>

      {/* Steps */}
      <div style={{ padding: "20px 24px", maxWidth: "860px" }}>
        <div
          style={{
            fontSize: "11px",
            color: "#444",
            letterSpacing: "1px",
            marginBottom: "20px",
            textTransform: "uppercase",
          }}
        >
          {phase.subtitle}
        </div>
        {phase.steps.map((step) => {
          const expanded = expandedSteps[step.id] !== false;
          const stepDone = step.items.filter((i) => checked[i.id]).length;
          const tc = typeConfig[step.type];
          return (
            <div
              key={step.id}
              style={{
                marginBottom: "12px",
                border: "1px solid #1a1a2a",
                borderRadius: "6px",
                overflow: "hidden",
                background: "#0d0d14",
              }}
            >
              <div
                className="step-header"
                onClick={() => toggleStep(step.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px 16px",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <span style={{ fontSize: "14px" }}>{tc.icon}</span>
                <div style={{ flex: 1 }}>
                  <span
                    style={{
                      fontSize: "10px",
                      color: phase.accent,
                      textTransform: "uppercase",
                      letterSpacing: "1.5px",
                      marginRight: "10px",
                    }}
                  >
                    {tc.label}
                  </span>
                  <span
                    style={{
                      fontFamily: "'IBM Plex Sans', sans-serif",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#cbd5e1",
                    }}
                  >
                    {step.label}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: stepDone === step.items.length ? "#22c55e" : "#555",
                  }}
                >
                  {stepDone}/{step.items.length}
                </div>
                <div style={{ color: "#333", fontSize: "12px" }}>
                  {expanded ? "▲" : "▼"}
                </div>
              </div>
              {expanded && (
                <div style={{ borderTop: "1px solid #111" }}>
                  {step.items.map((item, ii) => {
                    const done = !!checked[item.id];
                    const hasNote = !!notes[item.id];
                    return (
                      <div
                        key={item.id}
                        className="item-row"
                        style={{
                          padding: "10px 16px 10px 20px",
                          borderBottom:
                            ii < step.items.length - 1
                              ? "1px solid #111"
                              : "none",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "12px",
                        }}
                      >
                        <div
                          className={`check-box${done ? " done" : ""}`}
                          onClick={() => toggle(item.id)}
                        >
                          {done && (
                            <span
                              style={{
                                color: "#fff",
                                fontSize: "11px",
                                fontWeight: 700,
                              }}
                            >
                              ✓
                            </span>
                          )}
                        </div>
                        <div style={{ flex: 1, paddingTop: "1px" }}>
                          <div
                            style={{
                              fontSize: "12px",
                              color: done ? "#555" : "#94a3b8",
                              textDecoration: done ? "line-through" : "none",
                              lineHeight: 1.5,
                            }}
                          >
                            {item.text}
                          </div>
                          {item.detail && (
                            <div
                              style={{
                                fontSize: "11px",
                                color: "#3a3a5c",
                                marginTop: "3px",
                              }}
                            >
                              {item.detail}
                            </div>
                          )}
                          {hasNote && editingNote !== item.id && (
                            <div
                              style={{
                                fontSize: "11px",
                                color: "#a78bfa",
                                marginTop: "5px",
                                padding: "5px 8px",
                                background: "rgba(167,139,250,0.07)",
                                borderRadius: "3px",
                                borderLeft: "2px solid #7c3aed",
                              }}
                            >
                              📝 {notes[item.id]}
                            </div>
                          )}
                          {editingNote === item.id && (
                            <div
                              style={{
                                marginTop: "6px",
                                display: "flex",
                                gap: "6px",
                              }}
                            >
                              <input
                                value={noteInput}
                                onChange={(e) => setNoteInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    setNotes((n) => ({
                                      ...n,
                                      [item.id]: noteInput,
                                    }));
                                    setEditingNote(null);
                                  }
                                  if (e.key === "Escape") setEditingNote(null);
                                }}
                                placeholder="Add note… (Enter to save)"
                                autoFocus
                                style={{
                                  flex: 1,
                                  background: "#111",
                                  border: "1px solid #333",
                                  borderRadius: "3px",
                                  padding: "5px 8px",
                                  color: "#e2e8f0",
                                  fontSize: "11px",
                                  fontFamily: "inherit",
                                  outline: "none",
                                }}
                              />
                              <button
                                onClick={() => {
                                  setNotes((n) => ({
                                    ...n,
                                    [item.id]: noteInput,
                                  }));
                                  setEditingNote(null);
                                }}
                                style={{
                                  background: "#7c3aed",
                                  border: "none",
                                  borderRadius: "3px",
                                  padding: "4px 10px",
                                  color: "#fff",
                                  fontSize: "10px",
                                  cursor: "pointer",
                                }}
                              >
                                Save
                              </button>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setEditingNote(item.id);
                            setNoteInput(notes[item.id] || "");
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: hasNote ? "#7c3aed" : "#2a2a3e",
                            fontSize: "13px",
                            padding: "0 2px",
                            flexShrink: 0,
                          }}
                          title="Add note"
                        >
                          📝
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
