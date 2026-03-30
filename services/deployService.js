// services/deployService.js
// ─────────────────────────────────────────────────────────────
// Deploy service — tells EC2 to pull from GitHub.
// ─────────────────────────────────────────────────────────────

const { NodeSSH } = require("node-ssh");
const fs = require("fs");
const path = require("path");
const { execSync, execFileSync } = require("child_process");

function shellEscape(val) {
  if (val === undefined || val === null) return "''";
  return "'" + String(val).replace(/'/g, "'\\''") + "'";
}

const DEPLOY_SECRET = process.env.DEPLOY_SECRET || "";

const SITES = {
  wynn: {
    label: "Wynn Tax Solutions",
    host: process.env.DEPLOY_WYNN_HOST || "",
    user: process.env.DEPLOY_WYNN_USER || "ubuntu",
    pemPath: process.env.DEPLOY_WYNN_PEM || "",
    remotePath: process.env.DEPLOY_WYNN_PATH || "/var/www/WynnTax",
    localRepoPath: process.env.DEPLOY_WYNN_REPO || "",
    pm2Process: process.env.DEPLOY_WYNN_PM2 || "backend",
    branch: process.env.DEPLOY_WYNN_BRANCH || "master",
    url: "https://www.wynntaxsolutions.com",
  },
  tag: {
    label: "Tax Advocate Group",
    host: process.env.DEPLOY_TAG_HOST || "",
    user: process.env.DEPLOY_TAG_USER || "ubuntu",
    pemPath: process.env.DEPLOY_TAG_PEM || "",
    remotePath: process.env.DEPLOY_TAG_PATH || "/var/www/TaxAdvocateGroup",
    localRepoPath: process.env.DEPLOY_TAG_REPO || "",
    pm2Process: process.env.DEPLOY_TAG_PM2 || "backend",
    branch: process.env.DEPLOY_TAG_BRANCH || "master",
    url: "https://www.taxadvocategroup.com",
  },
};

const deployHistory = {};

function getStatus(brand) {
  return (
    deployHistory[brand] || { lastDeploy: null, lastRollback: null, log: [] }
  );
}

function logEvent(brand, event) {
  if (!deployHistory[brand]) {
    deployHistory[brand] = { lastDeploy: null, lastRollback: null, log: [] };
  }
  deployHistory[brand].log.push({ time: new Date().toISOString(), ...event });
  if (deployHistory[brand].log.length > 20) {
    deployHistory[brand].log = deployHistory[brand].log.slice(-20);
  }
}

async function deployBuild(brand, opts = {}, onLog = console.log) {
  const site = SITES[brand];
  if (!site) throw new Error(`Unknown brand: ${brand}`);
  if (!site.host) throw new Error(`No host configured for ${brand}`);
  if (!site.pemPath || !fs.existsSync(site.pemPath)) {
    throw new Error(`PEM not found: ${site.pemPath}`);
  }

  const repoDir = site.localRepoPath;
  const commitMsg = opts.commitMsg || null;
  const dryRun = opts.dryRun || false;
  const startTime = Date.now();
  const ssh = new NodeSSH();
  const branch = site.branch || "master";
  const pm2Name = site.pm2Process || "backend";

  const esc = {
    path: shellEscape(site.remotePath),
    pm2: shellEscape(pm2Name),
    branch: shellEscape(branch),
    url: shellEscape(site.url),
  };

  onLog(`[DEPLOY:${brand}] ══════════════════════════════════════════`);
  onLog(`[DEPLOY:${brand}] Deploy: ${site.label}`);
  onLog(`[DEPLOY:${brand}]   Host:     ${site.user}@${site.host}`);
  onLog(`[DEPLOY:${brand}]   Remote:   ${site.remotePath}`);
  onLog(`[DEPLOY:${brand}]   Branch:   ${branch}`);
  onLog(`[DEPLOY:${brand}]   PM2:      ${pm2Name}`);
  onLog(`[DEPLOY:${brand}]   Dry run:  ${dryRun}`);
  onLog(`[DEPLOY:${brand}] ══════════════════════════════════════════`);

  try {
    // ── Step 1: Local git push ─────────────────────────────────
    onLog(`[DEPLOY:${brand}] Step 1: Local git push`);

    if (repoDir && fs.existsSync(path.join(repoDir, ".git"))) {
      let localBranch = "master";
      try {
        localBranch = execSync("git rev-parse --abbrev-ref HEAD", {
          cwd: repoDir,
          stdio: "pipe",
          encoding: "utf8",
        }).trim();
      } catch {}
      onLog(`[DEPLOY:${brand}]   Branch: ${localBranch}`);

      if (commitMsg) {
        onLog(`[DEPLOY:${brand}]   Committing: "${commitMsg}"`);
        try {
          execSync("git add -A", { cwd: repoDir, stdio: "pipe" });
          const staged = execSync("git diff --cached --stat", {
            cwd: repoDir,
            stdio: "pipe",
            encoding: "utf8",
          }).trim();
          if (staged) {
            const fileCount = staged.split("\n").length - 1;
            onLog(`[DEPLOY:${brand}]   Staged: ${fileCount} file(s)`);
            execFileSync("git", ["commit", "-m", commitMsg], {
              cwd: repoDir,
              stdio: "pipe",
            });
            onLog(`[DEPLOY:${brand}]   ✓ Committed`);
          } else {
            onLog(`[DEPLOY:${brand}]   No changes to commit`);
          }
        } catch (e) {
          const stderr = e.stderr?.toString().slice(-300) || e.message;
          if (!stderr.includes("nothing to commit"))
            throw new Error(`Git commit failed: ${stderr}`);
          onLog(`[DEPLOY:${brand}]   No changes to commit`);
        }
      }

      try {
        const unpushed = execSync(
          `git log origin/${localBranch}..HEAD --oneline`,
          {
            cwd: repoDir,
            stdio: "pipe",
            encoding: "utf8",
          },
        ).trim();
        if (unpushed) {
          const count = unpushed.split("\n").length;
          onLog(`[DEPLOY:${brand}]   Pushing ${count} commit(s)...`);
          execSync("git push", { cwd: repoDir, stdio: "pipe", timeout: 30000 });
          onLog(`[DEPLOY:${brand}]   ✓ Pushed`);
        } else {
          onLog(`[DEPLOY:${brand}]   Already pushed`);
        }
      } catch (e) {
        throw new Error(
          `Git push failed: ${e.stderr?.toString().slice(-300) || e.message}`,
        );
      }

      try {
        const info = execSync('git log -1 --format="%h %s (%cr)"', {
          cwd: repoDir,
          stdio: "pipe",
          encoding: "utf8",
        }).trim();
        onLog(`[DEPLOY:${brand}]   Deploying: ${info}`);
      } catch {}
    } else {
      onLog(
        `[DEPLOY:${brand}]   No local repo configured — assuming already pushed`,
      );
    }

    // ── Step 2: SSH connect ────────────────────────────────────
    onLog(`[DEPLOY:${brand}] Step 2: SSH connect`);
    await ssh.connect({
      host: site.host,
      username: site.user,
      privateKeyPath: site.pemPath,
      readyTimeout: 30000,
    });
    onLog(`[DEPLOY:${brand}]   ✓ Connected`);

    // ── Step 3: Current state ──────────────────────────────────
    onLog(`[DEPLOY:${brand}] Step 3: Current state`);
    const stateResult = await ssh.execCommand(`
      cd ${esc.path}
      CURRENT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
      CURRENT_MSG=$(git log -1 --format="%s" 2>/dev/null || echo "unknown")
      BEHIND=$(git fetch origin ${esc.branch} 2>/dev/null && git rev-list HEAD..origin/${esc.branch} --count 2>/dev/null || echo "?")
      INCOMING=$(git log HEAD..origin/${esc.branch} --oneline 2>/dev/null || echo "")
      echo "CURRENT:$CURRENT"
      echo "CURRENT_MSG:$CURRENT_MSG"
      echo "BEHIND:$BEHIND"
      echo "INCOMING:$INCOMING"
    `);

    const stateOutput = stateResult.stdout;
    const getState = (key) =>
      (stateOutput.match(new RegExp(`${key}:(.+)`)) || [])[1]?.trim() || "";
    const currentSha = getState("CURRENT");
    const currentMsg = getState("CURRENT_MSG");
    const behind = getState("BEHIND");

    onLog(`[DEPLOY:${brand}]   Current:  ${currentSha} — ${currentMsg}`);
    onLog(`[DEPLOY:${brand}]   Behind:   ${behind} commit(s)`);

    if (behind === "0") {
      onLog(`[DEPLOY:${brand}]   Already up to date — nothing to deploy`);
      ssh.dispose();
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      return {
        ok: true,
        brand,
        upToDate: true,
        currentSha,
        duration: `${duration}s`,
        url: site.url,
      };
    }

    if (dryRun) {
      onLog(`[DEPLOY:${brand}] DRY RUN — would deploy ${behind} commit(s)`);
      ssh.dispose();
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      return {
        ok: true,
        dryRun: true,
        brand,
        currentSha,
        behind: parseInt(behind) || 0,
        duration: `${duration}s`,
        url: site.url,
      };
    }

    // ── Step 4: Deploy ─────────────────────────────────────────
    onLog(`[DEPLOY:${brand}] Step 4: Deploy`);
    onLog(
      `[DEPLOY:${brand}]   pm2 stop → git fetch → reset --hard → clean → npm install → pm2 start`,
    );

    const deployResult = await ssh.execCommand(
      `
      set -e
      cd ${esc.path}

      PREV_SHA=$(git rev-parse HEAD)
      echo "PREV_SHA:$PREV_SHA"

      # Stop the specific pm2 process — no || true so failure is visible
      pm2 stop ${esc.pm2} 2>/dev/null || sudo -u ubuntu pm2 stop ${esc.pm2} 2>/dev/null || echo "PM2_STOP_WARN:process may not have been running"
      echo "PM2:stopped"

      # Fetch + hard reset + clean
      sudo chown -R ubuntu:ubuntu ${esc.path}
      git fetch origin ${esc.branch}
      git reset --hard origin/${esc.branch}
      git clean -fd
      echo "GIT:reset"

      NEW_SHA=$(git rev-parse --short HEAD)
      NEW_MSG=$(git log -1 --format="%s")
      echo "NEW_SHA:$NEW_SHA"
      echo "NEW_MSG:$NEW_MSG"

      # npm install if package.json changed
      if ! git diff --quiet $PREV_SHA HEAD -- package.json package-lock.json 2>/dev/null; then
        echo "PACKAGES:changed"
        npm install --production 2>&1 | tail -5
        echo "NPM:installed"
      else
        echo "PACKAGES:unchanged"
        echo "NPM:skipped"
      fi

      # Fix permissions
      if [ -d client/build ]; then
        sudo chmod -R 755 client/build/ 2>/dev/null || true
        sudo chown -R www-data:www-data client/build/ 2>/dev/null || true
        echo "PERMS:fixed"
      else
        echo "PERMS:no-build-dir"
      fi

      # Reload Nginx
      sudo nginx -s reload 2>/dev/null || sudo systemctl reload nginx 2>/dev/null || true
      echo "NGINX:reloaded"

      # Start PM2 — try each method, fail loudly if all fail
      pm2 start ${esc.pm2} 2>/dev/null \
        || sudo -u ubuntu pm2 start ${esc.pm2} 2>/dev/null \
        || pm2 restart ${esc.pm2} 2>/dev/null \
        || { echo "PM2_START_FAILED:true"; exit 1; }

      # Wait for PM2 to settle
      sleep 3

      # ── FIX: Check specifically for THIS process, not all processes ──
      PM2_BACKEND_ONLINE=$(pm2 list 2>/dev/null | grep -E "${pm2Name}.*online" | wc -l | tr -d ' ')
      PM2_ALL_ONLINE=$(pm2 list 2>/dev/null | grep -c "online" || echo "0")
      echo "PM2_BACKEND_ONLINE:$PM2_BACKEND_ONLINE"
      echo "PM2_ALL_ONLINE:$PM2_ALL_ONLINE"

      # Count build files
      PAGE_COUNT=$(find client/build -name 'index.html' 2>/dev/null | wc -l)
      CSS_COUNT=$(find client/build/static/css -name '*.css' 2>/dev/null | wc -l)
      JS_COUNT=$(find client/build/static/js -name '*.js' 2>/dev/null | wc -l)
      echo "PAGES:$PAGE_COUNT"
      echo "CSS:$CSS_COUNT"
      echo "JS:$JS_COUNT"
    `.replace("${pm2Name}", pm2Name),
    );

    const output = deployResult.stdout;
    const get = (key) =>
      (output.match(new RegExp(`${key}:(.+)`)) || [])[1]?.trim() || "";

    const prevSha = get("PREV_SHA")?.slice(0, 7) || currentSha;
    const newSha = get("NEW_SHA");
    const newMsg = get("NEW_MSG");
    const packages = get("PACKAGES");
    const npm = get("NPM");
    const perms = get("PERMS");
    const nginx = get("NGINX");
    // ── FIX: Use per-process check, not total count ──
    const pm2BackendOnline = parseInt(get("PM2_BACKEND_ONLINE") || "0");
    const pm2AllOnline = parseInt(get("PM2_ALL_ONLINE") || "0");
    const pm2StartFailed = output.includes("PM2_START_FAILED:true");
    const pages = parseInt(get("PAGES") || "0");
    const css = parseInt(get("CSS") || "0");
    const js = parseInt(get("JS") || "0");

    onLog(`[DEPLOY:${brand}]   Previous:       ${prevSha}`);
    onLog(`[DEPLOY:${brand}]   Now:            ${newSha} — ${newMsg}`);
    onLog(`[DEPLOY:${brand}]   Packages:       ${packages}`);
    onLog(`[DEPLOY:${brand}]   NPM:            ${npm}`);
    onLog(`[DEPLOY:${brand}]   Permissions:    ${perms}`);
    onLog(`[DEPLOY:${brand}]   Nginx:          ${nginx}`);
    onLog(
      `[DEPLOY:${brand}]   ${pm2Name} online: ${pm2BackendOnline ? "✓ YES" : "✗ NO"} (${pm2AllOnline} total online)`,
    );
    onLog(
      `[DEPLOY:${brand}]   Build:          ${pages} pages, ${css} CSS, ${js} JS`,
    );

    if (deployResult.stderr) {
      const errLines = deployResult.stderr.trim().split("\n").slice(-5);
      for (const line of errLines) {
        if (line.trim()) onLog(`[DEPLOY:${brand}]   stderr: ${line}`);
      }
    }

    // ── Step 5: Verify ─────────────────────────────────────────
    onLog(`[DEPLOY:${brand}] Step 5: Verify`);

    if (pages > 0 && css > 0 && js > 0) {
      onLog(`[DEPLOY:${brand}]   Disk: ✓ ${pages} pages, ${css} CSS, ${js} JS`);
    } else {
      onLog(`[DEPLOY:${brand}]   Disk: ⚠ pages=${pages} css=${css} js=${js}`);
    }

    // Give PM2 a second chance if not online yet
    let finalBackendOnline = pm2BackendOnline;
    if (finalBackendOnline === 0 && !pm2StartFailed) {
      onLog(
        `[DEPLOY:${brand}]   ${pm2Name} not online yet — waiting 5 more seconds...`,
      );
      await new Promise((r) => setTimeout(r, 5000));
      const pm2Retry = await ssh.execCommand(
        `pm2 list 2>/dev/null | grep -E "${pm2Name}.*online" | wc -l | tr -d ' '`,
      );
      finalBackendOnline = parseInt(pm2Retry.stdout.trim() || "0");
    }

    if (finalBackendOnline > 0) {
      onLog(`[DEPLOY:${brand}]   PM2: ✓ ${pm2Name} is online`);
    } else {
      onLog(
        `[DEPLOY:${brand}]   PM2: ✗ ${pm2Name} is NOT online — initiating rollback`,
      );
    }

    // Auto-rollback if the named process is down
    if (finalBackendOnline === 0) {
      onLog(
        `[DEPLOY:${brand}]   ⚠ AUTO-ROLLBACK to ${prevSha} (${pm2Name} not online)`,
      );

      await ssh.execCommand(`
        cd ${esc.path}
        pm2 stop ${esc.pm2} 2>/dev/null || true
        sudo chown -R ubuntu:ubuntu ${esc.path}
        git reset --hard ${shellEscape(prevSha)}
        git clean -fd
        sudo chmod -R 755 client/build/ 2>/dev/null || true
        sudo chown -R www-data:www-data client/build/ 2>/dev/null || true
        sudo nginx -s reload 2>/dev/null || true
        pm2 start ${esc.pm2} 2>/dev/null || pm2 restart ${esc.pm2} 2>/dev/null || true
      `);

      onLog(`[DEPLOY:${brand}]   ✓ Rolled back to ${prevSha}`);
      throw new Error(
        `Deploy failed — ${pm2Name} not online (auto-rolled back)`,
      );
    }

    // ── Done ───────────────────────────────────────────────────
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    onLog(`[DEPLOY:${brand}] ✓ Deploy complete in ${duration}s`);
    onLog(`[DEPLOY:${brand}]   ${prevSha} → ${newSha}`);

    const result = {
      ok: true,
      brand,
      prevSha,
      newSha,
      newMsg,
      packagesChanged: packages === "changed",
      pm2Online: finalBackendOnline,
      pageCount: pages,
      cssFiles: css,
      jsFiles: js,
      verified: finalBackendOnline > 0,
      duration: `${duration}s`,
      url: site.url,
    };

    deployHistory[brand] = { ...getStatus(brand), lastDeploy: result };
    logEvent(brand, { action: "deploy", ...result });
    return result;
  } catch (err) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    onLog(`[DEPLOY:${brand}] ✗ FAILED after ${duration}s: ${err.message}`);
    logEvent(brand, { action: "deploy-failed", error: err.message, duration });
    throw err;
  } finally {
    ssh.dispose();
  }
}

async function rollbackBuild(brand, onLog = console.log) {
  const site = SITES[brand];
  if (!site) throw new Error(`Unknown brand: ${brand}`);
  if (!site.host) throw new Error(`No host configured for ${brand}`);

  const pm2Name = site.pm2Process || "backend";
  const ssh = new NodeSSH();
  const esc = {
    path: shellEscape(site.remotePath),
    pm2: shellEscape(pm2Name),
    url: shellEscape(site.url),
  };

  try {
    onLog(`[ROLLBACK:${brand}] Connecting...`);
    await ssh.connect({
      host: site.host,
      username: site.user,
      privateKeyPath: site.pemPath,
      readyTimeout: 30000,
    });
    onLog(`[ROLLBACK:${brand}] ✓ Connected`);

    const result = await ssh.execCommand(
      `
      set -e
      cd ${esc.path}

      CURRENT=$(git rev-parse --short HEAD)
      echo "CURRENT:$CURRENT"

      PREV=$(git rev-parse --short HEAD~1 2>/dev/null)
      PREV_MSG=$(git log -1 --format="%s" HEAD~1 2>/dev/null)
      if [ -z "$PREV" ]; then
        echo "ERROR:no previous commit"
        exit 1
      fi
      echo "TARGET:$PREV"
      echo "TARGET_MSG:$PREV_MSG"

      pm2 stop ${esc.pm2} 2>/dev/null || true
      sudo chown -R ubuntu:ubuntu ${esc.path}
      git reset --hard $PREV
      git clean -fd

      if [ -d client/build ]; then
        sudo chmod -R 755 client/build/
        sudo chown -R www-data:www-data client/build/ 2>/dev/null || true
      fi

      sudo nginx -s reload 2>/dev/null || sudo systemctl reload nginx 2>/dev/null || true
      pm2 start ${esc.pm2} 2>/dev/null || pm2 restart ${esc.pm2} 2>/dev/null || true

      sleep 2
      PM2_BACKEND_ONLINE=$(pm2 list 2>/dev/null | grep -E "${pm2Name}.*online" | wc -l | tr -d ' ')
      PAGE_COUNT=$(find client/build -name 'index.html' 2>/dev/null | wc -l)
      echo "PM2_BACKEND_ONLINE:$PM2_BACKEND_ONLINE"
      echo "PAGES:$PAGE_COUNT"
    `.replace("${pm2Name}", pm2Name),
    );

    if (result.stdout.includes("ERROR:")) {
      throw new Error("No previous commit to rollback to");
    }

    const output = result.stdout;
    const get = (key) =>
      (output.match(new RegExp(`${key}:(.+)`)) || [])[1]?.trim() || "";

    const current = get("CURRENT");
    const target = get("TARGET");
    const targetMsg = get("TARGET_MSG");
    const pm2BackendOnline = parseInt(get("PM2_BACKEND_ONLINE") || "0");
    const pages = parseInt(get("PAGES") || "0");

    onLog(`[ROLLBACK:${brand}] ✓ Rolled back: ${current} → ${target}`);
    onLog(`[ROLLBACK:${brand}]   Commit: ${targetMsg}`);
    onLog(
      `[ROLLBACK:${brand}]   ${pm2Name} online: ${pm2BackendOnline ? "✓ YES" : "✗ NO"}`,
    );
    onLog(`[ROLLBACK:${brand}]   Pages:  ${pages}`);

    const rollbackResult = {
      ok: true,
      brand,
      from: current,
      to: target,
      toMsg: targetMsg,
      pm2Online: pm2BackendOnline,
      pageCount: pages,
    };

    deployHistory[brand] = {
      ...getStatus(brand),
      lastRollback: rollbackResult,
    };
    logEvent(brand, { action: "rollback", ...rollbackResult });
    return rollbackResult;
  } catch (err) {
    onLog(`[ROLLBACK:${brand}] ✗ ${err.message}`);
    logEvent(brand, { action: "rollback-failed", error: err.message });
    throw err;
  } finally {
    ssh.dispose();
  }
}

async function checkRemote(brand) {
  const site = SITES[brand];
  if (!site || !site.host) return { ok: false, error: "not configured" };

  const pm2Name = site.pm2Process || "backend";
  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: site.host,
      username: site.user,
      privateKeyPath: site.pemPath,
      readyTimeout: 30000,
    });

    const esc = { path: shellEscape(site.remotePath) };
    const result = await ssh.execCommand(
      `
      set -e
      cd ${esc.path}
      echo "SHA:$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
      echo "MSG:$(git log -1 --format='%s' 2>/dev/null || echo unknown)"
      echo "DATE:$(git log -1 --format='%ci' 2>/dev/null || echo unknown)"
      echo "PAGE_COUNT:$(find client/build -name 'index.html' 2>/dev/null | wc -l)"
      echo "CSS_COUNT:$(find client/build/static/css -name '*.css' 2>/dev/null | wc -l)"
      echo "JS_COUNT:$(find client/build/static/js -name '*.js' 2>/dev/null | wc -l)"
      echo "DISK:$(df -h ${esc.path} | tail -1 | awk '{print $4}')"
      echo "NGINX:$(sudo nginx -t 2>&1 | tail -1)"
      echo "PM2_ALL:$(pm2 list 2>/dev/null | grep -c 'online' || echo 0) online"
      echo "PM2_BACKEND:$(pm2 list 2>/dev/null | grep -E '${pm2Name}.*online' | wc -l | tr -d ' ')"
      echo "RECENT:$(git log --oneline -5 2>/dev/null || echo none)"
    `.replace("${pm2Name}", pm2Name),
    );

    const output = result.stdout;
    const get = (key) =>
      (output.match(new RegExp(`${key}:(.+)`)) || [])[1]?.trim() || "";

    return {
      ok: true,
      brand,
      sha: get("SHA"),
      commitMsg: get("MSG"),
      commitDate: get("DATE"),
      pageCount: parseInt(get("PAGE_COUNT") || "0"),
      cssFiles: parseInt(get("CSS_COUNT") || "0"),
      jsFiles: parseInt(get("JS_COUNT") || "0"),
      diskFree: get("DISK"),
      nginx: get("NGINX"),
      pm2: get("PM2_ALL"),
      // ── FIX: expose per-process status for dashboard ──
      pm2Backend:
        parseInt(get("PM2_BACKEND") || "0") > 0
          ? `${pm2Name}: online`
          : `${pm2Name}: OFFLINE`,
      pm2BackendOnline: parseInt(get("PM2_BACKEND") || "0") > 0,
      recentCommits: output
        .split("\n")
        .filter(
          (l) =>
            l.startsWith("RECENT:") ||
            (!l.includes(":") && l.match(/^[a-f0-9]{7}/)),
        )
        .map((l) => l.replace("RECENT:", "").trim())
        .filter(Boolean)
        .slice(0, 5),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    ssh.dispose();
  }
}

module.exports = { deployBuild, rollbackBuild, checkRemote, SITES };
