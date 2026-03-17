// scripts/checkEnv.js
// ─────────────────────────────────────────────────────────────
// Recursively scans all .js files in specified folders and
// reports which process.env vars are set, empty, or missing.
//
// Run from project root:
//   node scripts/checkEnv.js
// ─────────────────────────────────────────────────────────────

require("dotenv").config();
const fs = require("fs");
const path = require("path");

const SCAN_TARGETS = ["services", "utils", "config", "Templates", "webhook.js"];

// ── Recursively collect all .js files from a path ──
function collectJsFiles(target) {
  const absPath = path.join(process.cwd(), target);

  if (!fs.existsSync(absPath)) {
    console.warn(`  ⚠  Not found (skipped): ${target}`);
    return [];
  }

  const stat = fs.statSync(absPath);

  if (stat.isFile()) {
    return absPath.endsWith(".js") ? [absPath] : [];
  }

  const results = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".js")) {
        results.push(full);
      }
    }
  }

  walk(absPath);
  return results;
}

// ── Extract every process.env.VAR_NAME from source files ──
function extractEnvKeys(files) {
  const keys = new Set();
  const keyToFiles = {};
  const regex = /process\.env\.([A-Z0-9_]+)/g;

  for (const absPath of files) {
    const src = fs.readFileSync(absPath, "utf8");
    const relPath = path.relative(process.cwd(), absPath);
    let match;
    while ((match = regex.exec(src)) !== null) {
      const key = match[1];
      keys.add(key);
      if (!keyToFiles[key]) keyToFiles[key] = new Set();
      keyToFiles[key].add(relPath);
    }
  }

  return { keys: [...keys].sort(), keyToFiles };
}

// ── Group keys by prefix ──
const GROUP_ORDER = [
  "WYNN",
  "TAG",
  "SENDGRID",
  "CALL_RAIL",
  "RING_CENTRAL",
  "DROP",
  "FB",
  "TT",
  "RVM",
  "NODE",
  "OTHER",
];

function groupKeys(keys) {
  const groups = {};
  for (const g of GROUP_ORDER) groups[g] = [];

  for (const key of keys) {
    const matched = GROUP_ORDER.slice(0, -1).find((g) => key.startsWith(g));
    (groups[matched || "OTHER"] ||= []).push(key);
  }

  return groups;
}

// ── Main ──
function main() {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║           ENV VAR AUDIT — tagcontactbridge       ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Collect all files
  console.log("📂 Scanning:");
  const allFiles = [];
  for (const target of SCAN_TARGETS) {
    const files = collectJsFiles(target);
    console.log(`   ${target.padEnd(14)} → ${files.length} file(s)`);
    allFiles.push(...files);
  }
  console.log(`\n   Total: ${allFiles.length} files scanned`);

  const { keys, keyToFiles } = extractEnvKeys(allFiles);
  const groups = groupKeys(keys);

  let totalSet = 0;
  let totalEmpty = 0;
  let totalMissing = 0;
  const missing = [];
  const empty = [];

  for (const group of GROUP_ORDER) {
    const groupKeys = groups[group];
    if (!groupKeys || groupKeys.length === 0) continue;

    console.log(`\n── ${group} ${"─".repeat(44 - group.length)}`);

    for (const key of groupKeys) {
      const val = process.env[key];
      const usedIn = [...(keyToFiles[key] || [])].join(", ");

      if (val === undefined) {
        console.log(`  ✗  ${key.padEnd(42)} MISSING`);
        console.log(`       used in: ${usedIn}`);
        totalMissing++;
        missing.push(key);
      } else if (val.trim() === "") {
        console.log(`  ○  ${key.padEnd(42)} (empty)`);
        console.log(`       used in: ${usedIn}`);
        totalEmpty++;
        empty.push(key);
      } else {
        const preview = val.length > 4 ? val.slice(0, 4) + "****" : "****";
        console.log(`  ✓  ${key.padEnd(42)} ${preview}`);
        totalSet++;
      }
    }
  }

  // ── Summary ──
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log(
    `║  ✓ Set: ${String(totalSet).padEnd(5)} ○ Empty: ${String(totalEmpty).padEnd(5)} ✗ Missing: ${String(totalMissing).padEnd(5)}  ║`,
  );
  console.log("╚══════════════════════════════════════════════════╝");

  if (missing.length > 0) {
    console.log("\n🚨 MISSING (not in .env at all):");
    missing.forEach((k) => console.log(`   ${k}`));
  }

  if (empty.length > 0) {
    console.log("\n⚠  EMPTY (in .env but no value):");
    empty.forEach((k) => console.log(`   ${k}`));
  }

  if (missing.length === 0 && empty.length === 0) {
    console.log("\n✅  All env vars accounted for!\n");
  } else {
    console.log("\n");
    process.exit(1);
  }
}

main();
