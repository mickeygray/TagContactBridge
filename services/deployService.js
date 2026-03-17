// services/deployService.js
// ─────────────────────────────────────────────────────────────
// Deploy service — builds React locally then SSH/SCPs the
// build folder to EC2 instances.
//
// SAFETY FEATURES:
//   - Atomic swap: unpack to temp dir, verify, then mv (no gap)
//   - Permission fix: chown/chmod so Nginx can read everything
//   - Post-deploy verification: curl the site, check for 200 + HTML
//   - Auto-rollback: if verification fails, reverts immediately
//   - Keeps last 3 backups for manual rollback
//
// FLOW:
//   git push (local commits) → git pull (other machines) →
//   npm run build (local) → tar → SCP → unpack to temp →
//   verify temp → atomic mv swap → fix permissions →
//   nginx reload → pm2 restart → verify live → done
//   (if verify fails → auto rollback)
//
// STANDALONE:  node scripts/deploy.js deploy wynn
// INTEGRATED:  mountDeployRoutes(app)
// ─────────────────────────────────────────────────────────────

const { NodeSSH } = require("node-ssh");
const path = require("path");
const fs = require("fs");
const { execSync, execFileSync } = require("child_process");
const express = require("express");

// ─── Safety Helpers ─────────────────────────────────────────

/**
 * Escape a string for safe use in a remote shell command.
 * Wraps in single quotes, escaping any internal single quotes.
 */
function shellEscape(val) {
  if (val === undefined || val === null) return "''";
  return "'" + String(val).replace(/'/g, "'\\''") + "'";
}

/**
 * Verify tar is available on this machine before we need it.
 */
function checkTarAvailable() {
  try {
    execSync("tar --version", { stdio: "pipe" });
    return true;
  } catch {
    throw new Error(
      "tar is not available on this machine. Install tar or use Windows 10+ which includes it.",
    );
  }
}

const DEPLOY_SECRET = process.env.DEPLOY_SECRET || "";

// ─── Site Config ─────────────────────────────────────────────

const SITES = {
  wynn: {
    label: "Wynn Tax Solutions",
    host: process.env.DEPLOY_WYNN_HOST || "",
    user: process.env.DEPLOY_WYNN_USER || "ubuntu",
    pemPath: process.env.DEPLOY_WYNN_PEM || "",
    remotePath: process.env.DEPLOY_WYNN_PATH || "/var/www/WynnTax/client",
    localBuildPath: process.env.DEPLOY_WYNN_LOCAL_BUILD || "",
    localRepoPath: process.env.DEPLOY_WYNN_REPO || "", // git repo root
    pm2Process: process.env.DEPLOY_WYNN_PM2 || "all",
    url: "https://www.wynntaxsolutions.com",
  },
  tag: {
    label: "Tax Advocate Group",
    host: process.env.DEPLOY_TAG_HOST || "",
    user: process.env.DEPLOY_TAG_USER || "ubuntu",
    pemPath: process.env.DEPLOY_TAG_PEM || "",
    remotePath:
      process.env.DEPLOY_TAG_PATH || "/var/www/TaxAdvocateGroup/client",
    localBuildPath: process.env.DEPLOY_TAG_LOCAL_BUILD || "",
    localRepoPath: process.env.DEPLOY_TAG_REPO || "",
    pm2Process: process.env.DEPLOY_TAG_PM2 || "all",
    url: "https://www.taxadvocategroup.com",
  },
};

// ─── Deploy State ────────────────────────────────────────────

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

// ─── Local Helpers ───────────────────────────────────────────

function countLocalPages(dir) {
  let count = 0;
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      if (f.isDirectory()) walk(path.join(d, f.name));
      else if (f.name === "index.html") count++;
    }
  };
  walk(dir);
  return count;
}

// ═════════════════════════════════════════════════════════════
// DEPLOY
// ═════════════════════════════════════════════════════════════

async function deployBuild(brand, opts = {}, onLog = console.log) {
  const site = SITES[brand];
  if (!site) throw new Error(`Unknown brand: ${brand}`);
  if (!site.host)
    throw new Error(
      `No host configured for ${brand}. Set DEPLOY_${brand.toUpperCase()}_HOST`,
    );
  if (!site.pemPath || !fs.existsSync(site.pemPath)) {
    throw new Error(
      `PEM not found: ${site.pemPath}. Set DEPLOY_${brand.toUpperCase()}_PEM`,
    );
  }

  const buildDir = opts.buildPath || site.localBuildPath;
  const clientDir = buildDir ? path.resolve(buildDir, "..") : null;
  const repoDir =
    site.localRepoPath || (clientDir ? path.resolve(clientDir, "..") : null);
  const skipBuild = opts.skipBuild || false;
  const dryRun = opts.dryRun || false;
  const commitMsg = opts.commitMsg || null;
  const pullFirst = opts.pull || !!commitMsg; // auto-enable git when committing

  // Pre-flight: verify tar exists
  checkTarAvailable();

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupName = `build-backup-${timestamp}`;
  const tempName = `build-new-${timestamp}`;
  const startTime = Date.now();
  const ssh = new NodeSSH();
  let tarFile = null;

  // ── Pre-flight ───────────────────────────────────────────
  onLog(`[DEPLOY:${brand}] ══════════════════════════════════════════`);
  onLog(`[DEPLOY:${brand}] Deploy: ${site.label}`);
  onLog(`[DEPLOY:${brand}] ══════════════════════════════════════════`);
  onLog(`[DEPLOY:${brand}] Config:`);
  onLog(`[DEPLOY:${brand}]   Host:       ${site.user}@${site.host}`);
  onLog(`[DEPLOY:${brand}]   PEM:        ${site.pemPath}`);
  onLog(`[DEPLOY:${brand}]   Remote:     ${site.remotePath}/build`);
  onLog(`[DEPLOY:${brand}]   Local:      ${buildDir || "from build step"}`);
  onLog(`[DEPLOY:${brand}]   Repo:       ${repoDir || "not set"}`);
  onLog(`[DEPLOY:${brand}]   Pull:       ${pullFirst}`);
  onLog(`[DEPLOY:${brand}]   Skip build: ${skipBuild}`);
  onLog(`[DEPLOY:${brand}]   Dry run:    ${dryRun}`);
  onLog(`[DEPLOY:${brand}]   PM2:        ${site.pm2Process || "all"}`);
  onLog(`[DEPLOY:${brand}]   Timestamp:  ${timestamp}`);

  try {
    // ── Step 0a: Git pull ────────────────────────────────────
    onLog(`[DEPLOY:${brand}] ──────────────────────────────────────────`);
    if (pullFirst) {
      onLog(`[DEPLOY:${brand}] Step 0a: Git push + pull`);

      if (!repoDir || !fs.existsSync(path.join(repoDir, ".git"))) {
        throw new Error(
          `No .git found at ${repoDir}. Set DEPLOY_${brand.toUpperCase()}_REPO to the repo root, or make sure LOCAL_BUILD is inside a git repo.`,
        );
      }

      onLog(`[DEPLOY:${brand}]   Repo: ${repoDir}`);

      // Check for uncommitted changes
      if (!commitMsg) {
        // No commit message — stash any dirty state before pull
        try {
          const status = execSync("git status --porcelain", {
            cwd: repoDir,
            stdio: "pipe",
            encoding: "utf8",
          }).trim();

          if (status) {
            const changedCount = status.split("\n").length;
            onLog(
              `[DEPLOY:${brand}]   ⚠ ${changedCount} uncommitted change(s) detected`,
            );
            onLog(`[DEPLOY:${brand}]   Stashing local changes before pull...`);
            execSync("git stash", { cwd: repoDir, stdio: "pipe" });
            onLog(`[DEPLOY:${brand}]   ✓ Stashed`);
          }
        } catch (statusErr) {
          onLog(
            `[DEPLOY:${brand}]   ⚠ Could not check git status: ${statusErr.message}`,
          );
        }
      }

      // Get current branch
      let branch = "unknown";
      try {
        branch = execSync("git rev-parse --abbrev-ref HEAD", {
          cwd: repoDir,
          stdio: "pipe",
          encoding: "utf8",
        }).trim();
      } catch {}
      onLog(`[DEPLOY:${brand}]   Branch: ${branch}`);

      // Commit if a message was provided
      if (commitMsg) {
        onLog(`[DEPLOY:${brand}]   Committing: "${commitMsg}"`);
        try {
          // Stage all changes
          execSync("git add -A", { cwd: repoDir, stdio: "pipe" });

          // Check if there's anything to commit
          const staged = execSync("git diff --cached --stat", {
            cwd: repoDir,
            stdio: "pipe",
            encoding: "utf8",
          }).trim();

          if (staged) {
            const fileCount = staged.split("\n").length - 1; // last line is summary
            onLog(`[DEPLOY:${brand}]   Staged: ${fileCount} file(s)`);
            execFileSync("git", ["commit", "-m", commitMsg], {
              cwd: repoDir,
              stdio: "pipe",
            });
            onLog(`[DEPLOY:${brand}]   ✓ Committed`);
          } else {
            onLog(
              `[DEPLOY:${brand}]   No changes to commit (working tree clean)`,
            );
          }
        } catch (commitErr) {
          const stderr =
            commitErr.stderr?.toString().slice(-300) || commitErr.message;
          // "nothing to commit" is not an error
          if (stderr.includes("nothing to commit")) {
            onLog(`[DEPLOY:${brand}]   No changes to commit`);
          } else {
            throw new Error(`Git commit failed: ${stderr}`);
          }
        }
      }

      // Push any committed but unpushed changes
      try {
        const unpushed = execSync(`git log origin/${branch}..HEAD --oneline`, {
          cwd: repoDir,
          stdio: "pipe",
          encoding: "utf8",
        }).trim();

        if (unpushed) {
          const commitCount = unpushed.split("\n").length;
          onLog(
            `[DEPLOY:${brand}]   ${commitCount} unpushed commit(s) — pushing...`,
          );
          execSync("git push", {
            cwd: repoDir,
            stdio: "pipe",
            timeout: 30000,
          });
          onLog(`[DEPLOY:${brand}]   ✓ Pushed`);
        } else {
          onLog(`[DEPLOY:${brand}]   No unpushed commits`);
        }
      } catch (pushErr) {
        const stderr =
          pushErr.stderr?.toString().slice(-300) || pushErr.message;
        throw new Error(`Git push failed: ${stderr}`);
      }

      // Pull (catches changes from other machines)
      try {
        const pullOutput = execSync("git pull --ff-only", {
          cwd: repoDir,
          stdio: "pipe",
          encoding: "utf8",
          timeout: 30000,
        }).trim();

        if (pullOutput.includes("Already up to date")) {
          onLog(`[DEPLOY:${brand}]   ✓ Already up to date`);
        } else {
          // Show what changed
          const lines = pullOutput.split("\n").slice(0, 5);
          lines.forEach((l) => onLog(`[DEPLOY:${brand}]   ${l}`));
          if (pullOutput.split("\n").length > 5) {
            onLog(
              `[DEPLOY:${brand}]   ... (${pullOutput.split("\n").length} lines total)`,
            );
          }
          onLog(`[DEPLOY:${brand}]   ✓ Pulled latest`);
        }
      } catch (pullErr) {
        const stderr =
          pullErr.stderr?.toString().slice(-300) || pullErr.message;
        throw new Error(`Git pull failed: ${stderr}`);
      }

      // Pop stash if we stashed (only when no commitMsg)
      if (!commitMsg) {
        try {
          const stashList = execSync("git stash list", {
            cwd: repoDir,
            stdio: "pipe",
            encoding: "utf8",
          }).trim();
          if (stashList) {
            execSync("git stash pop", { cwd: repoDir, stdio: "pipe" });
            onLog(
              `[DEPLOY:${brand}]   ✓ Stash popped (local changes restored)`,
            );
          }
        } catch {}
      }

      // Log the commit we're deploying
      try {
        const commitInfo = execSync('git log -1 --format="%h %s (%cr)"', {
          cwd: repoDir,
          stdio: "pipe",
          encoding: "utf8",
        }).trim();
        onLog(`[DEPLOY:${brand}]   Deploying: ${commitInfo}`);
      } catch {}
    } else {
      onLog(
        `[DEPLOY:${brand}] Step 0a: Git push + pull skipped (no --pull flag)`,
      );

      // Still log the current commit if we can find the repo
      if (repoDir && fs.existsSync(path.join(repoDir, ".git"))) {
        try {
          const commitInfo = execSync('git log -1 --format="%h %s (%cr)"', {
            cwd: repoDir,
            stdio: "pipe",
            encoding: "utf8",
          }).trim();
          onLog(`[DEPLOY:${brand}]   Current: ${commitInfo}`);
        } catch {}
      }
    }

    // ── Step 0b: Local build ─────────────────────────────────
    onLog(`[DEPLOY:${brand}] ──────────────────────────────────────────`);
    if (!skipBuild) {
      onLog(`[DEPLOY:${brand}] Step 0b: Local build`);

      if (!clientDir || !fs.existsSync(path.join(clientDir, "package.json"))) {
        throw new Error(
          `No package.json at ${clientDir}. Set DEPLOY_${brand.toUpperCase()}_LOCAL_BUILD to client/build path.`,
        );
      }

      onLog(`[DEPLOY:${brand}]   Dir: ${clientDir}`);
      onLog(`[DEPLOY:${brand}]   Running: npm run build`);
      const buildStart = Date.now();

      try {
        execSync("npm run build", {
          cwd: clientDir,
          stdio: "pipe",
          timeout: 5 * 60 * 1000,
          env: { ...process.env, CI: "false" },
        });
      } catch (buildErr) {
        const stderr =
          buildErr.stderr?.toString().slice(-500) || buildErr.message;
        throw new Error(`Build failed: ${stderr}`);
      }

      const builtIndex = path.join(clientDir, "build", "index.html");
      if (!fs.existsSync(builtIndex)) {
        throw new Error(
          "Build completed but no index.html — react-snap may have failed",
        );
      }

      const localPages = countLocalPages(path.join(clientDir, "build"));
      const buildSec = ((Date.now() - buildStart) / 1000).toFixed(1);
      onLog(
        `[DEPLOY:${brand}]   ✓ Build complete — ${localPages} pages in ${buildSec}s`,
      );
    } else {
      onLog(`[DEPLOY:${brand}] Step 0b: Build skipped (--skip)`);
    }

    // Resolve final build path
    const finalBuildDir = skipBuild ? buildDir : path.join(clientDir, "build");

    if (!finalBuildDir || !fs.existsSync(finalBuildDir)) {
      throw new Error(`Build dir not found: ${finalBuildDir}`);
    }
    if (!fs.existsSync(path.join(finalBuildDir, "index.html"))) {
      throw new Error(`No index.html in ${finalBuildDir}`);
    }
    if (!fs.existsSync(path.join(finalBuildDir, "static"))) {
      throw new Error(
        `No static/ folder in ${finalBuildDir} — CSS/JS will be missing`,
      );
    }

    const localPageCount = countLocalPages(finalBuildDir);
    onLog(
      `[DEPLOY:${brand}]   Verified: ${localPageCount} pages, static/ present`,
    );

    // ── Step 1: Tar ──────────────────────────────────────────
    onLog(`[DEPLOY:${brand}] ──────────────────────────────────────────`);
    onLog(`[DEPLOY:${brand}] Step 1: Zip build`);
    onLog(`[DEPLOY:${brand}]   Source: ${finalBuildDir}`);

    tarFile = path.join(
      require("os").tmpdir(),
      `deploy-${brand}-${timestamp}.tar.gz`,
    );
    execSync(`tar -czf "${tarFile}" -C "${finalBuildDir}" .`, {
      stdio: "pipe",
    });
    const tarSize = (fs.statSync(tarFile).size / 1024 / 1024).toFixed(1);
    onLog(`[DEPLOY:${brand}]   ✓ Created: ${tarSize} MB`);

    // ── Step 2: SSH connect ──────────────────────────────────
    onLog(`[DEPLOY:${brand}] ──────────────────────────────────────────`);
    onLog(`[DEPLOY:${brand}] Step 2: SSH connect`);
    onLog(`[DEPLOY:${brand}]   Host: ${site.user}@${site.host}`);
    onLog(`[DEPLOY:${brand}]   Key:  ${site.pemPath}`);

    await ssh.connect({
      host: site.host,
      username: site.user,
      privateKeyPath: site.pemPath,
      readyTimeout: 15000,
    });
    onLog(`[DEPLOY:${brand}]   ✓ Connected`);

    // ── Step 3: Upload ───────────────────────────────────────
    onLog(`[DEPLOY:${brand}] ──────────────────────────────────────────`);
    onLog(`[DEPLOY:${brand}] Step 3: Upload to EC2`);
    onLog(`[DEPLOY:${brand}]   Remote: /tmp/build-deploy.tar.gz`);

    await ssh.putFile(tarFile, "/tmp/build-deploy.tar.gz");
    onLog(`[DEPLOY:${brand}]   ✓ Uploaded (${tarSize} MB)`);

    // ── Step 4: Unpack to temp dir + verify ──────────────────
    onLog(`[DEPLOY:${brand}] ──────────────────────────────────────────`);
    onLog(`[DEPLOY:${brand}] Step 4: Unpack + verify on EC2`);
    onLog(`[DEPLOY:${brand}]   Temp dir: ${tempName}`);

    const escapedRemotePath = shellEscape(site.remotePath);
    const escapedTempName = shellEscape(tempName);
    const escapedBackupName = shellEscape(backupName);
    const escapedPm2 = shellEscape(site.pm2Process || "all");
    const escapedUrl = shellEscape(site.url);

    const unpackResult = await ssh.execCommand(`
      set -e
      cd ${escapedRemotePath}

      # Clean any leftover temp dir
      sudo rm -rf ${escapedTempName}

      # Unpack to temp
      sudo mkdir ${escapedTempName}
      sudo tar -xzf /tmp/build-deploy.tar.gz -C ${escapedTempName}
      sudo rm /tmp/build-deploy.tar.gz

      # Verify temp build is valid
      if [ ! -f ${escapedTempName}/index.html ]; then
        echo "VERIFY:FAIL:no index.html"
        exit 1
      fi
      if [ ! -d ${escapedTempName}/static ]; then
        echo "VERIFY:FAIL:no static dir"
        exit 1
      fi

      # Count pages in temp
      PAGE_COUNT=$(find ${escapedTempName} -name 'index.html' | wc -l)
      CSS_COUNT=$(find ${escapedTempName}/static/css -name '*.css' 2>/dev/null | wc -l)
      JS_COUNT=$(find ${escapedTempName}/static/js -name '*.js' 2>/dev/null | wc -l)
      echo "VERIFY:OK"
      echo "PAGES:$PAGE_COUNT"
      echo "CSS:$CSS_COUNT"
      echo "JS:$JS_COUNT"
    `);

    if (
      unpackResult.code !== 0 ||
      unpackResult.stdout.includes("VERIFY:FAIL")
    ) {
      const reason =
        (unpackResult.stdout.match(/VERIFY:FAIL:(.+)/) || [])[1] ||
        unpackResult.stderr;
      await ssh
        .execCommand(`sudo rm -rf ${escapedRemotePath}/${escapedTempName}`)
        .catch(() => {});
      throw new Error(`Remote verification failed: ${reason}`);
    }

    const unpackOutput = unpackResult.stdout;
    const remotePages = parseInt(
      (unpackOutput.match(/PAGES:(\d+)/) || [])[1] || "0",
    );
    const cssCount = parseInt(
      (unpackOutput.match(/CSS:(\d+)/) || [])[1] || "0",
    );
    const jsCount = parseInt((unpackOutput.match(/JS:(\d+)/) || [])[1] || "0");

    onLog(
      `[DEPLOY:${brand}]   ✓ Verified: ${remotePages} pages, ${cssCount} CSS, ${jsCount} JS`,
    );

    // Sanity check: remote page count should match local
    if (localPageCount > 0 && remotePages < localPageCount * 0.5) {
      await ssh
        .execCommand(`sudo rm -rf ${escapedRemotePath}/${escapedTempName}`)
        .catch(() => {});
      throw new Error(
        `Page count mismatch: local=${localPageCount} remote=${remotePages}. Possible corrupt upload.`,
      );
    }

    // ── DRY RUN EXIT ─────────────────────────────────────────
    if (dryRun) {
      onLog(`[DEPLOY:${brand}] ──────────────────────────────────────────`);
      onLog(`[DEPLOY:${brand}] DRY RUN — All checks passed, cleaning up`);
      onLog(`[DEPLOY:${brand}]   Local build:  ✓ ${localPageCount} pages`);
      onLog(`[DEPLOY:${brand}]   Upload:       ✓ ${tarSize} MB`);
      onLog(
        `[DEPLOY:${brand}]   Remote unpack:✓ ${remotePages} pages, ${cssCount} CSS, ${jsCount} JS`,
      );
      onLog(
        `[DEPLOY:${brand}]   Page match:   ✓ local=${localPageCount} remote=${remotePages}`,
      );
      onLog(`[DEPLOY:${brand}]   Removing temp folder on EC2...`);

      await ssh.execCommand(
        `sudo rm -rf ${escapedRemotePath}/${escapedTempName}`,
      );
      onLog(`[DEPLOY:${brand}]   ✓ Temp folder cleaned`);

      fs.unlinkSync(tarFile);
      onLog(`[DEPLOY:${brand}]   ✓ Local tar cleaned`);

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      onLog(`[DEPLOY:${brand}] ──────────────────────────────────────────`);
      onLog(
        `[DEPLOY:${brand}] ✓ DRY RUN complete in ${duration}s — no changes made to live site`,
      );

      const result = {
        ok: true,
        dryRun: true,
        brand,
        pageCount: remotePages,
        cssFiles: cssCount,
        jsFiles: jsCount,
        localPages: localPageCount,
        duration: `${duration}s`,
        timestamp,
        url: site.url,
        message: "All checks passed. Run without --dry to deploy for real.",
      };
      logEvent(brand, { action: "dry-run", ...result });
      return result;
    }

    // ── Step 5: Atomic swap ──────────────────────────────────
    // Two mv operations = near-instant, no gap for broken CSS
    onLog(`[DEPLOY:${brand}] ──────────────────────────────────────────`);
    onLog(`[DEPLOY:${brand}] Step 5: Atomic swap`);
    onLog(`[DEPLOY:${brand}]   ${tempName} → build (backup → ${backupName})`);

    const swapResult = await ssh.execCommand(`
      set -e
      cd ${escapedRemotePath}

      # Atomic swap: backup old, move new into place
      if [ -d build ]; then
        sudo mv build ${escapedBackupName}
        echo "BACKUP:${backupName}"
      fi
      sudo mv ${escapedTempName} build

      echo "SWAP:OK"
    `);

    if (swapResult.code !== 0 || !swapResult.stdout.includes("SWAP:OK")) {
      throw new Error(
        `Atomic swap failed: ${swapResult.stderr || swapResult.stdout}`,
      );
    }

    const didBackup = swapResult.stdout.includes("BACKUP:");
    onLog(
      `[DEPLOY:${brand}]   ✓ Swap complete${didBackup ? ` (old → ${backupName})` : " (no previous build)"}`,
    );

    // ── Step 6: Permissions + Nginx + PM2 ────────────────────
    onLog(`[DEPLOY:${brand}] ──────────────────────────────────────────`);
    onLog(`[DEPLOY:${brand}] Step 6: Permissions, Nginx, PM2`);

    const serviceResult = await ssh.execCommand(`
      cd ${escapedRemotePath}

      # Fix permissions so Nginx can read
      sudo chmod -R 755 build/
      sudo chown -R www-data:www-data build/ 2>/dev/null && echo "PERMS:fixed" || echo "PERMS:skipped (no sudo)"

      # Reload Nginx
      sudo nginx -s reload 2>/dev/null && echo "NGINX:reloaded" || sudo systemctl reload nginx 2>/dev/null && echo "NGINX:reloaded" || echo "NGINX:skipped"

      # Restart PM2
      sudo -u ubuntu pm2 restart ${escapedPm2} 2>/dev/null && echo "PM2:restarted" || pm2 restart ${escapedPm2} 2>/dev/null && echo "PM2:restarted" || echo "PM2:skipped"

      # Cleanup old backups (keep last 3)
      sudo ls -dt build-backup-* 2>/dev/null | tail -n +4 | sudo xargs rm -rf 2>/dev/null || true
      BACKUP_COUNT=$(ls -d build-backup-* 2>/dev/null | wc -l)
      echo "BACKUPS_KEPT:$BACKUP_COUNT"
    `);

    const svcOutput = serviceResult.stdout;
    const permsStatus = (svcOutput.match(/PERMS:(.+)/) || [])[1] || "unknown";
    const nginxStatus = (svcOutput.match(/NGINX:(\w+)/) || [])[1] || "unknown";
    const pm2Status = (svcOutput.match(/PM2:(\w+)/) || [])[1] || "unknown";
    const backupsKept = (svcOutput.match(/BACKUPS_KEPT:(\d+)/) || [])[1] || "?";

    onLog(`[DEPLOY:${brand}]   Permissions: ${permsStatus}`);
    onLog(`[DEPLOY:${brand}]   Nginx:       ${nginxStatus}`);
    onLog(`[DEPLOY:${brand}]   PM2:         ${pm2Status}`);
    onLog(`[DEPLOY:${brand}]   Backups:     ${backupsKept} kept`);

    // ── Step 7: Post-deploy verification ─────────────────────
    onLog(`[DEPLOY:${brand}] ──────────────────────────────────────────`);
    onLog(`[DEPLOY:${brand}] Step 7: Post-deploy verification`);
    onLog(`[DEPLOY:${brand}]   Checking: ${site.url}`);

    let siteOk = false;
    let verifyError = "";

    // Wait a moment for Nginx/PM2 to finish restarting
    await new Promise((r) => setTimeout(r, 3000));

    try {
      // First: disk-level check — verify CSS/JS files exist on disk after swap
      const diskCheck = await ssh.execCommand(`
        cd ${escapedRemotePath}/build
        CSS_EXISTS=$(find static/css -name '*.css' 2>/dev/null | head -1)
        JS_EXISTS=$(find static/js -name '*.js' 2>/dev/null | head -1)
        echo "DISK_CSS:$CSS_EXISTS"
        echo "DISK_JS:$JS_EXISTS"
      `);
      const diskCss =
        (diskCheck.stdout.match(/DISK_CSS:(.+)/) || [])[1]?.trim() || "";
      const diskJs =
        (diskCheck.stdout.match(/DISK_JS:(.+)/) || [])[1]?.trim() || "";

      if (!diskCss || !diskJs) {
        verifyError = `Disk check failed: CSS=${diskCss || "MISSING"} JS=${diskJs || "MISSING"}`;
      } else {
        onLog(`[DEPLOY:${brand}]   Disk check: CSS ✓ JS ✓`);

        // Second: HTTP check
        const verifyResult = await ssh.execCommand(
          `curl -s -o /dev/null -w "%{http_code}" --max-time 10 ${escapedUrl}`,
        );
        const httpStatus = verifyResult.stdout.trim();
        onLog(`[DEPLOY:${brand}]   HTTP status: ${httpStatus}`);

        if (httpStatus === "200") {
          const htmlCheck = await ssh.execCommand(
            `curl -s --max-time 10 ${escapedUrl} | grep -c 'static/css' || echo "0"`,
          );
          const cssRefs = parseInt(htmlCheck.stdout.trim() || "0");
          onLog(`[DEPLOY:${brand}]   CSS references in HTML: ${cssRefs}`);

          if (cssRefs > 0) {
            siteOk = true;
            onLog(`[DEPLOY:${brand}]   ✓ Site is live and CSS is loading`);
          } else {
            verifyError =
              "HTML returned 200 but no CSS references found — possible broken build";
          }
        } else {
          verifyError = `Site returned HTTP ${httpStatus} instead of 200`;
        }
      }
    } catch (err) {
      verifyError = `Verification failed: ${err.message}`;
    }

    // ── Auto-rollback if verification failed ─────────────────
    if (!siteOk && didBackup) {
      onLog(`[DEPLOY:${brand}]   ✗ ${verifyError}`);
      onLog(`[DEPLOY:${brand}]   ⚠ AUTO-ROLLBACK: reverting to ${backupName}`);

      const rollbackResult = await ssh.execCommand(`
        set -e
        cd ${escapedRemotePath}
        sudo rm -rf build
        sudo mv ${escapedBackupName} build
        sudo chmod -R 755 build/
        sudo chown -R www-data:www-data build/ 2>/dev/null || true
        sudo nginx -s reload 2>/dev/null || sudo systemctl reload nginx 2>/dev/null || true
        sudo -u ubuntu pm2 restart ${escapedPm2} 2>/dev/null || pm2 restart ${escapedPm2} 2>/dev/null || true
        echo "ROLLBACK:OK"
      `);

      if (rollbackResult.stdout.includes("ROLLBACK:OK")) {
        onLog(`[DEPLOY:${brand}]   ✓ Rolled back successfully`);
        onLog(
          `[DEPLOY:${brand}]   Site should be restored to previous version`,
        );
      } else {
        onLog(
          `[DEPLOY:${brand}]   ✗ Rollback may have failed: ${rollbackResult.stderr}`,
        );
      }

      throw new Error(
        `Deploy verification failed (auto-rolled back): ${verifyError}`,
      );
    } else if (!siteOk && !didBackup) {
      onLog(`[DEPLOY:${brand}]   ⚠ ${verifyError}`);
      onLog(
        `[DEPLOY:${brand}]   ⚠ No backup to rollback to — this was the first deploy`,
      );
    }

    // ── Done ─────────────────────────────────────────────────
    // Cleanup local tar
    fs.unlinkSync(tarFile);

    onLog(`[DEPLOY:${brand}] ──────────────────────────────────────────`);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    onLog(`[DEPLOY:${brand}] ✓ All steps complete in ${duration}s`);

    const result = {
      ok: true,
      brand,
      backup: didBackup ? backupName : null,
      pageCount: remotePages,
      cssFiles: cssCount,
      jsFiles: jsCount,
      nginx: nginxStatus,
      pm2: pm2Status,
      permissions: permsStatus,
      verified: siteOk,
      duration: `${duration}s`,
      timestamp,
      url: site.url,
    };

    deployHistory[brand] = { ...getStatus(brand), lastDeploy: result };
    logEvent(brand, { action: "deploy", ...result });

    return result;
  } catch (err) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    onLog(`[DEPLOY:${brand}] ──────────────────────────────────────────`);
    onLog(`[DEPLOY:${brand}] ✗ FAILED after ${duration}s`);
    onLog(`[DEPLOY:${brand}] ✗ Error: ${err.message}`);
    onLog(`[DEPLOY:${brand}] ══════════════════════════════════════════`);
    logEvent(brand, { action: "deploy-failed", error: err.message, duration });

    // Cleanup local tar if it exists
    if (tarFile) {
      try {
        fs.unlinkSync(tarFile);
      } catch {}
    }

    throw err;
  } finally {
    ssh.dispose();
  }
}

// ═════════════════════════════════════════════════════════════
// ROLLBACK
// ═════════════════════════════════════════════════════════════

async function rollbackBuild(brand, onLog = console.log) {
  const site = SITES[brand];
  if (!site) throw new Error(`Unknown brand: ${brand}`);
  if (!site.host) throw new Error(`No host configured for ${brand}`);

  const ssh = new NodeSSH();

  try {
    onLog(`[ROLLBACK:${brand}] Connecting to ${site.user}@${site.host}...`);
    await ssh.connect({
      host: site.host,
      username: site.user,
      privateKeyPath: site.pemPath,
      readyTimeout: 15000,
    });
    onLog(`[ROLLBACK:${brand}] ✓ Connected`);

    onLog(`[ROLLBACK:${brand}] Finding latest backup...`);
    const escapedPath = shellEscape(site.remotePath);
    const escapedPm2 = shellEscape(site.pm2Process || "all");

    const result = await ssh.execCommand(`
      set -e
      cd ${escapedPath}

      # Find latest backup
      LATEST=$(ls -dt build-backup-* 2>/dev/null | head -1)
      if [ -z "$LATEST" ]; then
        echo "ERROR:no backups found"
        exit 1
      fi

      echo "RESTORING:$LATEST"

      # Save current broken build just in case
      if [ -d build ]; then
        sudo mv build build-broken-$(date +%Y%m%d-%H%M%S)
      fi

      # Atomic: move backup into place
      sudo mv "$LATEST" build

      # Fix permissions
      sudo chmod -R 755 build/
      sudo chown -R www-data:www-data build/ 2>/dev/null || true

      # Count pages
      PAGE_COUNT=$(find build -name 'index.html' | wc -l)
      echo "PAGES:$PAGE_COUNT"

      # Restart services
      sudo nginx -s reload 2>/dev/null && echo "NGINX:reloaded" || sudo systemctl reload nginx 2>/dev/null && echo "NGINX:reloaded" || echo "NGINX:skipped"
      sudo -u ubuntu pm2 restart ${escapedPm2} 2>/dev/null && echo "PM2:restarted" || pm2 restart ${escapedPm2} 2>/dev/null && echo "PM2:restarted" || echo "PM2:skipped"

      # Cleanup broken builds
      sudo ls -dt build-broken-* 2>/dev/null | tail -n +2 | sudo xargs rm -rf 2>/dev/null || true
    `);

    if (result.code !== 0 || result.stdout.includes("ERROR:")) {
      throw new Error(
        result.stdout.includes("ERROR:")
          ? "No backups found on server"
          : result.stderr,
      );
    }

    const restored =
      (result.stdout.match(/RESTORING:(.+)/) || [])[1] || "unknown";
    const pageCount = parseInt(
      (result.stdout.match(/PAGES:(\d+)/) || [])[1] || "0",
    );
    const nginxStatus =
      (result.stdout.match(/NGINX:(\w+)/) || [])[1] || "unknown";
    const pm2Status = (result.stdout.match(/PM2:(\w+)/) || [])[1] || "unknown";

    onLog(`[ROLLBACK:${brand}] ✓ Restored: ${restored}`);
    onLog(`[ROLLBACK:${brand}]   Pages: ${pageCount}`);
    onLog(`[ROLLBACK:${brand}]   Nginx: ${nginxStatus}`);
    onLog(`[ROLLBACK:${brand}]   PM2:   ${pm2Status}`);

    const rollbackResult = {
      ok: true,
      brand,
      restored,
      pageCount,
      nginx: nginxStatus,
      pm2: pm2Status,
      timestamp: new Date().toISOString(),
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

// ═════════════════════════════════════════════════════════════
// REMOTE STATUS CHECK
// ═════════════════════════════════════════════════════════════

async function checkRemote(brand) {
  const site = SITES[brand];
  if (!site || !site.host) return { ok: false, error: "not configured" };

  const ssh = new NodeSSH();

  try {
    await ssh.connect({
      host: site.host,
      username: site.user,
      privateKeyPath: site.pemPath,
      readyTimeout: 15000,
    });

    const escapedPath = shellEscape(site.remotePath);
    const result = await ssh.execCommand(`
      set -e
      cd ${escapedPath}
      echo "BUILD_EXISTS:$([ -d build ] && echo yes || echo no)"
      echo "PAGE_COUNT:$(find build -name 'index.html' 2>/dev/null | wc -l)"
      echo "CSS_COUNT:$(find build/static/css -name '*.css' 2>/dev/null | wc -l)"
      echo "JS_COUNT:$(find build/static/js -name '*.js' 2>/dev/null | wc -l)"
      echo "BUILD_DATE:$(stat -c %Y build/index.html 2>/dev/null || echo 0)"
      echo "BUILD_OWNER:$(stat -c %U build/index.html 2>/dev/null || echo unknown)"
      echo "BACKUPS:$(ls -d build-backup-* 2>/dev/null | wc -l)"
      echo "BACKUP_LIST:$(ls -dt build-backup-* 2>/dev/null | head -5 | tr '\\n' ',')"
      echo "DISK:$(df -h ${escapedPath} | tail -1 | awk '{print $4}')"
      echo "NGINX:$(sudo nginx -t 2>&1 | tail -1)"
      echo "PM2:$(pm2 list 2>/dev/null | grep -c 'online' || echo 0) online"
    `);

    if (result.code !== 0) {
      return {
        ok: false,
        error: `Remote command failed (exit ${result.code}): ${result.stderr || result.stdout}`,
      };
    }

    const output = result.stdout;
    const get = (key) =>
      (output.match(new RegExp(`${key}:(.+)`)) || [])[1]?.trim() || "";

    const buildDate = parseInt(get("BUILD_DATE"));

    return {
      ok: true,
      brand,
      buildExists: get("BUILD_EXISTS") === "yes",
      pageCount: parseInt(get("PAGE_COUNT") || "0"),
      cssFiles: parseInt(get("CSS_COUNT") || "0"),
      jsFiles: parseInt(get("JS_COUNT") || "0"),
      buildDate: buildDate ? new Date(buildDate * 1000).toISOString() : null,
      buildOwner: get("BUILD_OWNER"),
      backupCount: parseInt(get("BACKUPS") || "0"),
      recentBackups: get("BACKUP_LIST").split(",").filter(Boolean),
      diskFree: get("DISK"),
      nginx: get("NGINX"),
      pm2: get("PM2"),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    ssh.dispose();
  }
}

// ═════════════════════════════════════════════════════════════
// EXPRESS ROUTES (for later integration into server.js)
// ═════════════════════════════════════════════════════════════

function mountDeployRoutes(app) {
  // Auth middleware — requires DEPLOY_SECRET in .env
  // Pass as x-deploy-key header or ?key= query param
  const requireAuth = (req, res, next) => {
    if (!DEPLOY_SECRET) {
      return res.status(500).json({
        ok: false,
        error: "DEPLOY_SECRET not configured — deploy routes are disabled",
      });
    }
    const provided =
      req.headers["x-deploy-key"] || req.query?.key || req.body?.key;
    if (provided !== DEPLOY_SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    next();
  };

  app.get("/deploy/sites", requireAuth, (req, res) => {
    const sites = {};
    for (const [brand, config] of Object.entries(SITES)) {
      sites[brand] = {
        label: config.label,
        host: config.host ? `${config.user}@${config.host}` : "not configured",
        remotePath: config.remotePath,
        localBuildPath: config.localBuildPath || "not set",
        url: config.url,
        configured: !!(config.host && config.pemPath),
        status: getStatus(brand),
      };
    }
    res.json({ ok: true, sites });
  });

  app.post("/deploy/:brand", requireAuth, async (req, res) => {
    const { brand } = req.params;
    if (!SITES[brand])
      return res
        .status(400)
        .json({ ok: false, error: `Unknown brand: ${brand}` });

    const logs = [];
    const onLog = (line) => {
      logs.push(line);
      console.log(line);
    };

    try {
      const result = await deployBuild(
        brand,
        {
          buildPath: req.body?.buildPath || null,
          skipBuild: req.body?.skipBuild || false,
          dryRun: req.body?.dryRun || false,
          pull: req.body?.pull || !!req.body?.commitMsg,
          commitMsg: req.body?.commitMsg || null,
        },
        onLog,
      );
      res.json({ ...result, logs });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message, logs });
    }
  });

  app.post("/deploy/:brand/restart", requireAuth, async (req, res) => {
    const { brand } = req.params;
    const site = SITES[brand];
    if (!site)
      return res
        .status(400)
        .json({ ok: false, error: `Unknown brand: ${brand}` });
    if (!site.host)
      return res.status(400).json({ ok: false, error: `No host for ${brand}` });

    const processName = req.body?.process || site.pm2Process || "all";
    const escapedProcess = shellEscape(processName);
    const ssh = new NodeSSH();

    try {
      await ssh.connect({
        host: site.host,
        username: site.user,
        privateKeyPath: site.pemPath,
        readyTimeout: 15000,
      });
      const result = await ssh.execCommand(
        `sudo -u ubuntu pm2 restart ${escapedProcess} && sudo -u ubuntu pm2 status || pm2 restart ${escapedProcess} && pm2 status`,
      );

      if (result.code !== 0) {
        throw new Error(
          `PM2 restart failed (exit ${result.code}): ${result.stderr || result.stdout}`,
        );
      }

      logEvent(brand, { action: "restart", process: processName });
      res.json({
        ok: true,
        brand,
        process: processName,
        output: result.stdout,
      });
    } catch (err) {
      logEvent(brand, { action: "restart-failed", error: err.message });
      res.status(500).json({ ok: false, error: err.message });
    } finally {
      ssh.dispose();
    }
  });

  app.post("/deploy/:brand/rollback", requireAuth, async (req, res) => {
    const { brand } = req.params;
    if (!SITES[brand])
      return res
        .status(400)
        .json({ ok: false, error: `Unknown brand: ${brand}` });

    const logs = [];
    const onLog = (line) => {
      logs.push(line);
      console.log(line);
    };

    try {
      const result = await rollbackBuild(brand, onLog);
      res.json({ ...result, logs });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message, logs });
    }
  });

  app.get("/deploy/:brand/status", requireAuth, async (req, res) => {
    const { brand } = req.params;
    if (!SITES[brand])
      return res
        .status(400)
        .json({ ok: false, error: `Unknown brand: ${brand}` });

    try {
      const remote = await checkRemote(brand);
      res.json({
        ok: true,
        brand,
        label: SITES[brand].label,
        remote,
        history: getStatus(brand),
      });
    } catch (err) {
      res.json({
        ok: true,
        brand,
        remote: { ok: false, error: err.message },
        history: getStatus(brand),
      });
    }
  });
}

// ─── Exports ─────────────────────────────────────────────────

module.exports = {
  deployBuild,
  rollbackBuild,
  checkRemote,
  mountDeployRoutes,
  SITES,
};
