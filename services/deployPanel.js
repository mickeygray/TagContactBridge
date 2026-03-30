// services/deployPanel.js
// ─────────────────────────────────────────────────────────────
// Deploy dashboard — email-based auth via SendGrid.
//
// Access: https://tag-webhook.ngrok.app/panel
// Auth:   Code sent via email, valid 10 minutes
// Session: signed cookie, valid 8 hours
// ─────────────────────────────────────────────────────────────

const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { getCompanyConfig } = require("../config/companyConfig");

// ─── Config ──────────────────────────────────────────────────

const PANEL_EMAIL = process.env.ADMIN_EMAIL;
const PANEL_PHONE = process.env.DEPLOY_PANEL_PHONE || ""; // kept for display only
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;
const COOKIE_NAME = "deploy_session";

let pendingCode = null;
let pendingCodeExpires = 0;
let sessions = {};

// ─── Email sender (SendGrid via nodemailer) ──────────────────

async function sendEmailCode(code) {
  if (!PANEL_EMAIL) throw new Error("DEPLOY_PANEL_EMAIL not set");

  const config = getCompanyConfig("TAG");
  const transport = nodemailer.createTransport({
    host: process.env.SENDGRID_GATEWAY || "smtp.sendgrid.net",
    port: Number(process.env.SENDGRID_PORT) || 587,
    secure: false,
    auth: {
      user: "apikey",
      pass:
        config.sendgridApiKey ||
        process.env.TAG_API_KEY ||
        process.env.WYNN_API_KEY,
    },
  });

  await transport.sendMail({
    from: `Deploy Panel <${config.fromEmail || "inquiry@taxadvocategroup.com"}>`,
    to: PANEL_EMAIL,
    subject: `Deploy Code: ${code}`,
    text: `Your deploy panel verification code is: ${code}\n\nExpires in 10 minutes.\n\nIf you didn't request this, ignore this email.`,
    html: `
      <div style="font-family:monospace;padding:20px;background:#0a0a0a;color:#e0e0e0;border-radius:8px;max-width:400px;">
        <h2 style="color:#00ff88;margin:0 0 8px;">DEPLOY PANEL</h2>
        <p style="color:#888;margin:0 0 20px;">Verification code:</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#fff;background:#141414;padding:16px;border-radius:8px;text-align:center;border:1px solid #333;">
          ${code}
        </div>
        <p style="color:#666;font-size:12px;margin:16px 0 0;">Expires in 10 minutes.</p>
      </div>
    `,
  });

  console.log(`[PANEL] Code sent via email to ${PANEL_EMAIL}`);
}

// ─── Auth helpers ────────────────────────────────────────────

function generateCode() {
  return crypto.randomInt(100000, 999999).toString();
}

function generateSession() {
  return crypto.randomBytes(32).toString("hex");
}

function isValidSession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token || !sessions[token]) return false;
  if (Date.now() > sessions[token].expires) {
    delete sessions[token];
    return false;
  }
  return true;
}

// ─── Mount routes ────────────────────────────────────────────

function mountDeployPanel(app, deployService) {
  const { deployBuild, rollbackBuild, checkRemote, SITES } = deployService;

  app.get("/panel", (req, res) => {
    if (isValidSession(req)) {
      res.send(dashboardHTML());
    } else {
      res.send(loginHTML());
    }
  });

  app.post("/panel/send-code", async (req, res) => {
    try {
      const code = generateCode();
      pendingCode = code;
      pendingCodeExpires = Date.now() + CODE_TTL_MS;

      await sendEmailCode(code);

      res.json({ ok: true, message: "Code sent to email" });
    } catch (err) {
      console.error("[PANEL] Email send failed:", err.message);
      res
        .status(500)
        .json({ ok: false, error: "Failed to send code: " + err.message });
    }
  });

  app.post("/panel/verify", (req, res) => {
    const { code } = req.body || {};

    console.log(
      `[PANEL] Verify attempt: received="${code}" expected="${pendingCode}" expired=${Date.now() > pendingCodeExpires}`,
    );

    if (!pendingCode || Date.now() > pendingCodeExpires) {
      return res.status(401).json({ ok: false, error: "Code expired" });
    }

    if (String(code).trim() !== String(pendingCode).trim()) {
      return res.status(401).json({ ok: false, error: "Wrong code" });
    }

    pendingCode = null;
    const token = generateSession();
    sessions[token] = {
      expires: Date.now() + SESSION_TTL_MS,
      created: new Date().toISOString(),
    };

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "Lax",
      maxAge: SESSION_TTL_MS,
      path: "/",
    });

    console.log("[PANEL] ✓ Authenticated");
    res.json({ ok: true });
  });

  app.post("/panel/action", async (req, res) => {
    if (!isValidSession(req)) {
      return res.status(401).json({ ok: false, error: "Not authenticated" });
    }

    const { action, brand, commitMsg } = req.body || {};

    if (!brand || !SITES[brand]) {
      return res.status(400).json({ ok: false, error: "Invalid brand" });
    }

    const logs = [];
    const onLog = (line) => {
      logs.push(line);
      console.log(line);
    };

    try {
      let result;

      switch (action) {
        case "deploy":
          result = await deployBuild(
            brand,
            { commitMsg: commitMsg || null },
            onLog,
          );
          break;

        case "deploy-dry":
          result = await deployBuild(
            brand,
            { dryRun: true, commitMsg: commitMsg || null },
            onLog,
          );
          break;

        case "restart":
          const { NodeSSH } = require("node-ssh");
          const site = SITES[brand];
          const ssh = new NodeSSH();
          await ssh.connect({
            host: site.host,
            username: site.user,
            privateKeyPath: site.pemPath,
            readyTimeout: 30000,
          });
          const restartResult = await ssh.execCommand(
            `sudo -u ubuntu pm2 restart ${site.pm2Process || "all"} && sudo -u ubuntu pm2 status || pm2 restart ${site.pm2Process || "all"} && pm2 status`,
          );
          ssh.dispose();
          result = { ok: true, output: restartResult.stdout };
          onLog(
            `[RESTART:${brand}] ${restartResult.code === 0 ? "✓" : "✗"} PM2 restart`,
          );
          break;

        case "rollback":
          result = await rollbackBuild(brand, onLog);
          break;

        default:
          return res.status(400).json({ ok: false, error: "Unknown action" });
      }

      res.json({ ok: true, result, logs });
    } catch (err) {
      res.json({ ok: false, error: err.message, logs });
    }
  });

  app.get("/panel/status/:brand", async (req, res) => {
    if (!isValidSession(req)) {
      return res.status(401).json({ ok: false, error: "Not authenticated" });
    }
    const info = await checkRemote(req.params.brand);
    res.json(info);
  });

  app.get("/auth-check", (req, res) => {
    if (isValidSession(req)) return res.sendStatus(200);
    return res.sendStatus(401);
  });

  app.get("/panel/logout", (req, res) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) delete sessions[token];
    res.clearCookie(COOKIE_NAME, { path: "/" });
    res.redirect("/panel");
  });
}

// ═════════════════════════════════════════════════════════════
// HTML TEMPLATES
// ═════════════════════════════════════════════════════════════

function loginHTML() {
  const emailHint = PANEL_EMAIL
    ? PANEL_EMAIL.replace(/(.{2}).*(@.*)/, "$1***$2")
    : "not configured";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Deploy Panel</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'DM Sans', sans-serif;
      background: #0a0a0a;
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .login-box {
      background: #141414;
      border: 1px solid #222;
      border-radius: 12px;
      padding: 40px;
      width: 340px;
      text-align: center;
    }
    .login-box h1 {
      font-family: 'JetBrains Mono', monospace;
      font-size: 18px;
      color: #00ff88;
      margin-bottom: 8px;
      letter-spacing: 2px;
    }
    .login-box p {
      font-size: 13px;
      color: #666;
      margin-bottom: 24px;
    }
    .email-hint {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: #555;
      margin-bottom: 16px;
    }
    .step { display: none; }
    .step.active { display: block; }
    button {
      font-family: 'DM Sans', sans-serif;
      width: 100%;
      padding: 12px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-send { background: #00ff88; color: #0a0a0a; }
    .btn-send:hover { background: #00cc6a; }
    .btn-send:disabled { background: #333; color: #666; cursor: not-allowed; }
    .btn-verify { background: #fff; color: #0a0a0a; }
    .btn-verify:hover { background: #ddd; }
    input {
      font-family: 'JetBrains Mono', monospace;
      width: 100%;
      padding: 14px;
      border: 1px solid #333;
      border-radius: 8px;
      background: #0a0a0a;
      color: #fff;
      font-size: 24px;
      text-align: center;
      letter-spacing: 12px;
      margin-bottom: 16px;
      outline: none;
    }
    input:focus { border-color: #00ff88; }
    input::placeholder { letter-spacing: 2px; font-size: 14px; color: #444; }
    .error { color: #ff4444; font-size: 13px; margin-top: 12px; }
    .sending { color: #00ff88; font-size: 13px; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="login-box">
    <h1>DEPLOY</h1>
    <p>Email verification required</p>
    <div class="email-hint">${emailHint}</div>

    <div id="step1" class="step active">
      <button class="btn-send" onclick="sendCode()" id="sendBtn">Send Code to Email</button>
      <div id="sendStatus"></div>
    </div>

    <div id="step2" class="step">
      <input type="text" id="codeInput" maxlength="6" placeholder="000000" autofocus
        onkeyup="if(this.value.length===6)verify()">
      <button class="btn-verify" onclick="verify()">Verify</button>
      <div id="verifyStatus"></div>
    </div>
  </div>

  <script>
    async function sendCode() {
      const btn = document.getElementById('sendBtn');
      const status = document.getElementById('sendStatus');
      btn.disabled = true;
      status.className = 'sending';
      status.textContent = 'Sending...';
      try {
        const res = await fetch('/panel/send-code', { method: 'POST' });
        const data = await res.json();
        if (data.ok) {
          document.getElementById('step1').classList.remove('active');
          document.getElementById('step2').classList.add('active');
          document.getElementById('codeInput').focus();
        } else {
          status.className = 'error';
          status.textContent = data.error || 'Failed to send';
          btn.disabled = false;
        }
      } catch (err) {
        status.className = 'error';
        status.textContent = 'Network error';
        btn.disabled = false;
      }
    }
    async function verify() {
      const code = document.getElementById('codeInput').value.trim();
      const status = document.getElementById('verifyStatus');
      if (code.length !== 6) return;
      status.className = 'sending';
      status.textContent = 'Verifying...';
      try {
        const res = await fetch('/panel/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const data = await res.json();
        if (data.ok) {
          window.location.reload();
        } else {
          status.className = 'error';
          status.textContent = data.error || 'Invalid code';
          document.getElementById('codeInput').value = '';
          document.getElementById('codeInput').focus();
        }
      } catch (err) {
        status.className = 'error';
        status.textContent = 'Network error';
      }
    }
  </script>
</body>
</html>`;
}

function dashboardHTML() {
  const brands = Object.entries(require("./deployService").SITES)
    .filter(([, s]) => s.host && s.pemPath)
    .map(([key, s]) => ({ key, label: s.label, url: s.url }));

  const brandOptions = brands
    .map((b) => `<option value="${b.key}">${b.label}</option>`)
    .join("");

  const brandCards = brands
    .map(
      (b) => `
    <div class="status-card" id="status-${b.key}">
      <div class="card-header">
        <span class="brand-name">${b.label}</span>
        <a href="${b.url}" target="_blank" class="site-link">${b.url.replace("https://", "")}</a>
      </div>
      <div class="card-body" id="info-${b.key}">
        <span class="loading">Loading...</span>
      </div>
    </div>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Deploy Panel</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'DM Sans', sans-serif; background: #0a0a0a; color: #e0e0e0; min-height: 100vh; padding: 20px; }
    .header { display: flex; align-items: center; justify-content: space-between; padding: 16px 0; border-bottom: 1px solid #1a1a1a; margin-bottom: 24px; }
    .header h1 { font-family: 'JetBrains Mono', monospace; font-size: 16px; color: #00ff88; letter-spacing: 3px; }
    .logout { color: #555; font-size: 12px; text-decoration: none; }
    .logout:hover { color: #ff4444; }
    .status-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-bottom: 32px; }
    .status-card { background: #141414; border: 1px solid #222; border-radius: 10px; overflow: hidden; }
    .card-header { padding: 14px 16px; border-bottom: 1px solid #1a1a1a; display: flex; justify-content: space-between; align-items: center; }
    .brand-name { font-weight: 600; font-size: 14px; }
    .site-link { font-size: 11px; color: #555; text-decoration: none; }
    .site-link:hover { color: #00ff88; }
    .card-body { padding: 14px 16px; font-family: 'JetBrains Mono', monospace; font-size: 12px; line-height: 1.8; }
    .stat { display: flex; justify-content: space-between; }
    .stat-label { color: #666; }
    .stat-value { color: #ccc; }
    .stat-ok { color: #00ff88; }
    .stat-warn { color: #ffaa00; }
    .loading { color: #444; }
    .action-panel { background: #141414; border: 1px solid #222; border-radius: 10px; padding: 24px; max-width: 600px; }
    .action-panel h2 { font-size: 14px; font-weight: 600; margin-bottom: 16px; color: #999; }
    .form-row { display: flex; gap: 10px; margin-bottom: 12px; }
    select, .commit-input { font-family: 'DM Sans', sans-serif; padding: 10px 14px; border: 1px solid #333; border-radius: 8px; background: #0a0a0a; color: #fff; font-size: 13px; outline: none; }
    select { width: 160px; }
    select:focus, .commit-input:focus { border-color: #00ff88; }
    .commit-input { flex: 1; }
    .commit-input::placeholder { color: #444; }
    .action-buttons { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn { font-family: 'DM Sans', sans-serif; padding: 10px 20px; border: 1px solid #333; border-radius: 8px; background: #1a1a1a; color: #ccc; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s; }
    .btn:hover { border-color: #555; color: #fff; }
    .btn:disabled { opacity: 0.3; cursor: not-allowed; }
    .btn-deploy { background: #00ff88; color: #0a0a0a; border-color: #00ff88; font-weight: 600; }
    .btn-deploy:hover { background: #00cc6a; border-color: #00cc6a; }
    .btn-rollback { border-color: #ff4444; color: #ff4444; }
    .btn-rollback:hover { background: #ff4444; color: #0a0a0a; }
    .btn-dry { border-color: #00aaff; color: #00aaff; }
    .btn-dry:hover { background: #00aaff; color: #0a0a0a; }
    .log-panel { margin-top: 24px; background: #0a0a0a; border: 1px solid #222; border-radius: 10px; max-height: 400px; overflow-y: auto; display: none; }
    .log-header { padding: 10px 16px; border-bottom: 1px solid #1a1a1a; font-size: 12px; color: #555; font-family: 'JetBrains Mono', monospace; display: flex; justify-content: space-between; }
    .log-body { padding: 12px 16px; font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.7; white-space: pre-wrap; color: #888; }
    .log-body .ok { color: #00ff88; }
    .log-body .err { color: #ff4444; }
    .log-body .info { color: #00aaff; }
    .running-indicator { display: inline-block; width: 8px; height: 8px; background: #00ff88; border-radius: 50%; animation: pulse 1s infinite; }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
    @media (max-width: 500px) {
      .form-row { flex-direction: column; }
      select { width: 100%; }
      .action-buttons { flex-direction: column; }
      .btn { width: 100%; text-align: center; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>DEPLOY PANEL</h1>
    <a href="/panel/logout" class="logout">logout</a>
  </div>
  <div style="margin-bottom:16px;">
    <a href="/dashboard" style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#00aaff;text-decoration:none;border:1px solid #222;padding:6px 14px;border-radius:6px;">Dashboard →</a>
  </div>

  <div class="status-cards">${brandCards}</div>

  <div class="action-panel">
    <h2>Deploy Action</h2>
    <div class="form-row">
      <select id="brand">${brandOptions}</select>
      <input type="text" class="commit-input" id="commitMsg" placeholder="Commit message (optional)">
    </div>
    <div class="action-buttons">
      <button class="btn btn-deploy" onclick="runAction('deploy')">Deploy</button>
      <button class="btn btn-dry" onclick="runAction('deploy-dry')">Dry Run</button>
      <button class="btn" onclick="runAction('restart')">Restart PM2</button>
      <button class="btn btn-rollback" onclick="runAction('rollback')">Rollback</button>
    </div>
  </div>

  <div class="log-panel" id="logPanel">
    <div class="log-header">
      <span id="logTitle">Output</span>
      <span id="logStatus"></span>
    </div>
    <div class="log-body" id="logBody"></div>
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', () => {
      ${brands.map((b) => `loadStatus('${b.key}');`).join("\n      ")}
    });

    async function loadStatus(brand) {
      const el = document.getElementById('info-' + brand);
      try {
        const res = await fetch('/panel/status/' + brand);
        const data = await res.json();
        if (data.ok) {
el.innerHTML = [
  stat('Commit', data.sha + ' — ' + (data.commitMsg||'').slice(0,40), 'ok'),
  stat('Pages', data.pageCount, 'ok'),
  stat('CSS/JS', (data.cssFiles||0) + ' / ' + (data.jsFiles||0), (data.cssFiles>0&&data.jsFiles>0)?'ok':'warn'),
  stat('Deployed', data.commitDate ? timeAgo(data.commitDate) : 'unknown'),
  stat('Disk', data.diskFree),
  stat('Nginx', data.nginx?.includes('successful') ? 'OK' : (data.nginx||'?'), data.nginx?.includes('successful')?'ok':'warn'),
  stat('PM2 All', data.pm2 || '?', data.pm2?.includes('online')?'ok':'warn'),
  stat('Backend', data.pm2Backend || '?', data.pm2BackendOnline ? 'ok' : 'warn'),
].join('');
        } else {
          el.innerHTML = '<span class="stat-warn">' + (data.error||'Error') + '</span>';
        }
      } catch (err) {
        el.innerHTML = '<span class="stat-warn">Connection failed</span>';
      }
    }

    function stat(label, value, cls) {
      return '<div class="stat"><span class="stat-label">' + label + '</span><span class="stat-value' + (cls?' stat-'+cls:'') + '">' + value + '</span></div>';
    }

    function timeAgo(dateStr) {
      const diff = Date.now() - new Date(dateStr).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 60) return mins + 'm ago';
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return hrs + 'h ago';
      return Math.floor(hrs/24) + 'd ago';
    }

    let running = false;

    async function runAction(action) {
      if (running) return;
      running = true;
      const brand = document.getElementById('brand').value;
      const commitMsg = document.getElementById('commitMsg').value.trim();
      if (action === 'rollback' && !confirm('Rollback ' + brand + ' to previous build?')) { running = false; return; }
      const logPanel = document.getElementById('logPanel');
      const logBody = document.getElementById('logBody');
      const logTitle = document.getElementById('logTitle');
      const logStatus = document.getElementById('logStatus');
      logPanel.style.display = 'block';
      logBody.textContent = '';
      logTitle.textContent = action.toUpperCase() + ' → ' + brand;
      logStatus.innerHTML = '<span class="running-indicator"></span> Running';
      document.querySelectorAll('.btn').forEach(b => b.disabled = true);
      try {
        const res = await fetch('/panel/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, brand, commitMsg: commitMsg || undefined }),
        });
        const data = await res.json();
        if (data.logs?.length) logBody.innerHTML = data.logs.map(colorLog).join('\\n');
        if (data.ok) {
          logStatus.innerHTML = '<span class="ok">✓ Done</span>';
          if (data.result?.dryRun) logBody.innerHTML += '\\n<span class="info">DRY RUN — no changes made.</span>';
        } else {
          logStatus.innerHTML = '<span class="err">✗ Failed</span>';
          logBody.innerHTML += '\\n<span class="err">' + (data.error||'Unknown error') + '</span>';
        }
        loadStatus(brand);
      } catch (err) {
        logStatus.innerHTML = '<span class="err">✗ Network error</span>';
        logBody.innerHTML += '<span class="err">' + err.message + '</span>';
      }
      document.querySelectorAll('.btn').forEach(b => b.disabled = false);
      running = false;
      logPanel.scrollTop = logPanel.scrollHeight;
    }

    function colorLog(line) {
      const escaped = line.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      if (escaped.includes('✓')) return '<span class="ok">' + escaped + '</span>';
      if (escaped.includes('✗') || escaped.includes('FAIL')) return '<span class="err">' + escaped + '</span>';
      if (escaped.includes('Step') || escaped.includes('DRY RUN') || escaped.includes('BACKEND')) return '<span class="info">' + escaped + '</span>';
      return escaped;
    }
  </script>
</body>
</html>`;
}

module.exports = { mountDeployPanel };
