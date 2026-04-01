// client/src/components/tools/deploypanel/DeployPanel.jsx
// ─────────────────────────────────────────────────────────────
// Deploy panel moved into React.
// Talks to existing /panel/* endpoints (proxied to :4000 by nginx).
// Auth still uses the deploy_session cookie — set via /panel login.
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from "react";
import "./DeployPanel.css";

// ─── Status Card ─────────────────────────────────────────────

function StatusCard({ brand }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/panel/status/${brand.key}`);
      const data = await res.json();
      if (data.ok) setInfo(data);
      else setInfo({ error: data.error || "Error" });
    } catch {
      setInfo({ error: "Connection failed" });
    }
    setLoading(false);
  }, [brand.key]);

  useEffect(() => { load(); }, [load]);

  const timeAgo = (dateStr) => {
    if (!dateStr) return "unknown";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="dp-status-card">
      <div className="dp-card-header">
        <span className="dp-brand-name">{brand.label}</span>
        <a href={brand.url} target="_blank" rel="noreferrer" className="dp-site-link">
          {brand.url?.replace("https://", "")}
        </a>
      </div>
      <div className="dp-card-body">
        {loading ? (
          <span className="dp-loading">Loading...</span>
        ) : info?.error ? (
          <span className="dp-warn">{info.error}</span>
        ) : (
          <>
            <Stat label="Commit" value={`${info.sha || "?"} — ${(info.commitMsg || "").slice(0, 40)}`} ok />
            <Stat label="Pages" value={info.pageCount} ok />
            <Stat label="CSS/JS" value={`${info.cssFiles || 0} / ${info.jsFiles || 0}`} ok={info.cssFiles > 0 && info.jsFiles > 0} />
            <Stat label="Deployed" value={timeAgo(info.commitDate)} />
            <Stat label="Disk" value={info.diskFree} />
            <Stat label="Nginx" value={info.nginx?.includes("successful") ? "OK" : info.nginx || "?"} ok={info.nginx?.includes("successful")} />
            <Stat label="PM2 All" value={info.pm2 || "?"} ok={info.pm2?.includes("online")} />
            <Stat label="Backend" value={info.pm2Backend || "?"} ok={info.pm2BackendOnline} />
          </>
        )}
      </div>
      <button className="dp-refresh-btn" onClick={load} title="Refresh">↻</button>
    </div>
  );
}

function Stat({ label, value, ok }) {
  return (
    <div className="dp-stat">
      <span className="dp-stat-label">{label}</span>
      <span className={`dp-stat-value ${ok ? "dp-stat-ok" : ok === false ? "dp-stat-warn" : ""}`}>{value}</span>
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────

export default function DeployPanel() {
  const [brands, setBrands] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState("");
  const [commitMsg, setCommitMsg] = useState("");
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [logStatus, setLogStatus] = useState(null);
  const [showLog, setShowLog] = useState(false);

  // Discover brands from the first status call
  useEffect(() => {
    const discoverBrands = async () => {
      try {
        // We get brand info from the deploy panel HTML embedded data
        // or we can just hardcode the known brands and check which respond
        const knownBrands = [
          { key: "TAG", label: "Tax Advocate Group", url: "https://taxadvocategroup.com" },
          { key: "WYNN", label: "Wynn Tax Solutions", url: "https://wynntaxsolutions.com" },
        ];

        const available = [];
        for (const brand of knownBrands) {
          try {
            const res = await fetch(`/panel/status/${brand.key}`);
            if (res.ok) available.push(brand);
          } catch { /* skip unavailable */ }
        }

        setBrands(available.length > 0 ? available : knownBrands);
        if (available.length > 0) setSelectedBrand(available[0].key);
        else setSelectedBrand(knownBrands[0].key);
      } catch {
        const fallback = [
          { key: "TAG", label: "Tax Advocate Group", url: "https://taxadvocategroup.com" },
          { key: "WYNN", label: "Wynn Tax Solutions", url: "https://wynntaxsolutions.com" },
        ];
        setBrands(fallback);
        setSelectedBrand(fallback[0].key);
      }
    };
    discoverBrands();
  }, []);

  const runAction = async (action) => {
    if (running) return;
    if (action === "rollback" && !window.confirm(`Rollback ${selectedBrand} to previous build?`)) return;

    setRunning(true);
    setLogs([]);
    setShowLog(true);
    setLogStatus("running");

    try {
      const res = await fetch("/panel/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          brand: selectedBrand,
          commitMsg: commitMsg.trim() || undefined,
        }),
      });
      const data = await res.json();

      if (data.logs?.length) setLogs(data.logs);

      if (data.ok) {
        setLogStatus("success");
        if (data.result?.dryRun) setLogs((prev) => [...prev, "DRY RUN — no changes made."]);
      } else {
        setLogStatus("error");
        setLogs((prev) => [...prev, data.error || "Unknown error"]);
      }
    } catch (err) {
      setLogStatus("error");
      setLogs((prev) => [...prev, `Network error: ${err.message}`]);
    }

    setRunning(false);
  };

  const colorLog = (line) => {
    if (line.includes("✓")) return "dp-log-ok";
    if (line.includes("✗") || line.includes("FAIL")) return "dp-log-err";
    if (line.includes("Step") || line.includes("DRY RUN") || line.includes("BACKEND")) return "dp-log-info";
    return "";
  };

  return (
    <div className="dp-panel">
      <div className="dp-header">
        <h1 className="dp-title">DEPLOY PANEL</h1>
      </div>

      {/* Status Cards */}
      <div className="dp-status-cards">
        {brands.map((brand) => (
          <StatusCard key={brand.key} brand={brand} />
        ))}
      </div>

      {/* Action Panel */}
      <div className="dp-action-panel">
        <h2>Deploy Action</h2>
        <div className="dp-form-row">
          <select value={selectedBrand} onChange={(e) => setSelectedBrand(e.target.value)} className="dp-select">
            {brands.map((b) => (
              <option key={b.key} value={b.key}>{b.label}</option>
            ))}
          </select>
          <input
            type="text"
            className="dp-commit-input"
            placeholder="Commit message (optional)"
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
          />
        </div>
        <div className="dp-action-buttons">
          <button className="dp-btn dp-btn-deploy" onClick={() => runAction("deploy")} disabled={running}>
            Deploy
          </button>
          <button className="dp-btn dp-btn-dry" onClick={() => runAction("deploy-dry")} disabled={running}>
            Dry Run
          </button>
          <button className="dp-btn" onClick={() => runAction("restart")} disabled={running}>
            Restart PM2
          </button>
          <button className="dp-btn dp-btn-rollback" onClick={() => runAction("rollback")} disabled={running}>
            Rollback
          </button>
        </div>
      </div>

      {/* Log Output */}
      {showLog && (
        <div className="dp-log-panel">
          <div className="dp-log-header">
            <span>Output</span>
            <span>
              {logStatus === "running" && <span className="dp-running-dot" />}
              {logStatus === "running" && " Running"}
              {logStatus === "success" && <span className="dp-log-ok">✓ Done</span>}
              {logStatus === "error" && <span className="dp-log-err">✗ Failed</span>}
            </span>
          </div>
          <div className="dp-log-body">
            {logs.map((line, i) => (
              <div key={i} className={colorLog(line)}>{line}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
