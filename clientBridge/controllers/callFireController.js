// controllers/callFireController.js
// ─────────────────────────────────────────────────────────────
// API endpoints for CallFire auto-dialer UI
// Uses same Logics API pattern as logicsService.js (params, not headers)
// ─────────────────────────────────────────────────────────────

const axios = require("axios");
const LeadCadence = require("../../shared/models/LeadCadence");
const { validatePhone } = require("../../shared/services/validationService");
const {
  addContactsToBroadcast,
  startBroadcast,
  getBroadcastStatus,
} = require("../services/callFireService");

// Logics config - same as logicsService.js
const logicsConfig = {
  TAG: {
    baseUrl: process.env.TAG_LOGICS_API_URL,
    apiKey: process.env.LOGICS_API_KEY,
    secret: process.env.TAG_LOGICS_SECRET,
  },
  WYNN: {
    baseUrl: process.env.WYNN_LOGICS_API_URL,
    apiKey: process.env.WYNN_LOGICS_API_KEY,
    secret: process.env.WYNN_LOGICS_SECRET,
  },
};

// In-memory session state
let dialerSession = {
  isRunning: false,
  isPaused: false,
  mode: null,
  stats: { queued: 0, processed: 0, failed: 0, total: 0 },
  leads: [],
};

// ═══════════════════════════════════════════════════════════════════════════
// GET WYNN LEADS
// ═══════════════════════════════════════════════════════════════════════════

async function getWynnLeads(req, res) {
  console.log("[CALLFIRE] ══════════════════════════════════════════════════");
  console.log("[CALLFIRE] GET /wynn-leads");

  try {
    // Step 1: Get leads from MongoDB
    console.log("[CALLFIRE] Step 1: Querying MongoDB LeadCadence...");

    const mongoLeads = await LeadCadence.find({
      active: true,
      phoneConnected: true,
    }).lean();

    console.log(`[CALLFIRE] Found ${mongoLeads.length} leads in MongoDB`);

    if (mongoLeads.length === 0) {
      return res.json({ ok: true, leads: [], count: 0 });
    }

    // Step 2: Check Logics status for each lead (like cadence engine does)
    // Use fetchCaseInfo which we know works
    console.log("[CALLFIRE] Step 2: Checking Logics status for each lead...");

    const cfg = logicsConfig.WYNN;
    const validLeads = [];
    const skippedLeads = [];

    for (const lead of mongoLeads) {
      try {
        // Use same pattern as logicsService.js fetchCaseInfo
        const url = `${cfg.baseUrl}/Case/CaseInfo`;
        const resp = await axios.get(url, {
          auth: { username: cfg.apiKey, password: cfg.secret },
          params: { CaseID: parseInt(lead.caseId, 10) },
        });

        const body = resp.data;
        const caseData = body.Data || body.data || body;
        const status = caseData?.StatusID ?? caseData?.Status ?? null;

        // Only include status 1 or 2 (yellow prospects)
        if (status === 1 || status === 2) {
          validLeads.push({
            caseId: lead.caseId,
            name: lead.name || "Unknown",
            phone: lead.phone,
            email: lead.email,
            source: lead.source,
            status: status,
          });
        } else {
          skippedLeads.push({
            caseId: lead.caseId,
            status,
            reason: "not status 1 or 2",
          });
        }
      } catch (err) {
        // If we can't check, skip the lead
        skippedLeads.push({ caseId: lead.caseId, reason: err.message });
      }

      // Small delay to avoid hammering API
      await new Promise((r) => setTimeout(r, 50));
    }

    console.log(`[CALLFIRE] Valid (status 1-2): ${validLeads.length}`);
    console.log(`[CALLFIRE] Skipped: ${skippedLeads.length}`);
    console.log(
      "[CALLFIRE] ══════════════════════════════════════════════════",
    );

    return res.json({
      ok: true,
      leads: validLeads,
      count: validLeads.length,
      debug: {
        mongoCount: mongoLeads.length,
        validCount: validLeads.length,
        skippedCount: skippedLeads.length,
      },
    });
  } catch (err) {
    console.error("[CALLFIRE] ✗ ERROR:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET TAG LEADS
// ═══════════════════════════════════════════════════════════════════════════

async function getTagLeads(req, res) {
  console.log("[CALLFIRE] ══════════════════════════════════════════════════");
  console.log("[CALLFIRE] GET /tag-leads");
  console.log("[CALLFIRE] Query:", req.query);

  try {
    const { startDate, endDate, sourceName } = req.query;

    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ ok: false, error: "Start and end date required" });
    }

    const leads = await fetchLogicsProspects("TAG", {
      statusIds: [1, 2],
      startDate,
      endDate,
      sourceName: sourceName !== "all" ? sourceName : null,
    });

    const formattedLeads = leads.map((lead) => ({
      caseId: lead.CaseID,
      name: `${lead.FirstName || ""} ${lead.LastName || ""}`.trim(),
      phone: lead.CellPhone || lead.HomePhone || lead.WorkPhone,
      email: lead.Email,
      source: lead.SourceName,
      createdDate: lead.CreatedDate,
      status: lead.StatusID,
    }));

    console.log(`[CALLFIRE] Returning ${formattedLeads.length} TAG prospects`);
    console.log(
      "[CALLFIRE] ══════════════════════════════════════════════════",
    );

    return res.json({
      ok: true,
      leads: formattedLeads,
      count: formattedLeads.length,
      filters: { startDate, endDate, sourceName },
    });
  } catch (err) {
    console.error("[CALLFIRE] ✗ ERROR:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// START WYNN DIALER
// ═══════════════════════════════════════════════════════════════════════════

async function startWynnDialer(req, res) {
  console.log("[CALLFIRE] ══════════════════════════════════════════════════");
  console.log("[CALLFIRE] POST /start-wynn");

  try {
    const { leads } = req.body;

    if (!leads || !leads.length) {
      return res.status(400).json({ ok: false, error: "No leads provided" });
    }

    console.log(`[CALLFIRE] Validating ${leads.length} leads...`);

    const validatedLeads = [];
    const skipped = [];

    for (const lead of leads) {
      const validation = await validatePhone(lead.phone);
      if (validation.canCall) {
        validatedLeads.push({ ...lead, phone: validation.phone });
      } else {
        skipped.push({
          phone: lead.phone,
          reason: validation.error || "failed",
        });
      }
    }

    console.log(
      `[CALLFIRE] Validated: ${validatedLeads.length} passed, ${skipped.length} skipped`,
    );

    if (validatedLeads.length === 0) {
      return res
        .status(400)
        .json({ ok: false, error: "No leads passed validation" });
    }

    // Add to CallFire
    console.log("[CALLFIRE] Adding to CallFire...");
    const result = await addContactsToBroadcast(
      validatedLeads.map((l) => ({
        phone: l.phone,
        name: l.name,
        caseId: l.caseId,
      })),
    );

    if (!result.ok) {
      return res.status(500).json({ ok: false, error: result.errors[0] });
    }

    // Start broadcast
    console.log("[CALLFIRE] Starting broadcast...");
    await startBroadcast();

    dialerSession = {
      isRunning: true,
      isPaused: false,
      mode: "wynn",
      stats: {
        queued: result.added,
        processed: 0,
        failed: result.failed,
        total: validatedLeads.length,
      },
      leads: validatedLeads,
    };

    console.log("[CALLFIRE] ✓ Dialer started");
    console.log(
      "[CALLFIRE] ══════════════════════════════════════════════════",
    );

    return res.json({
      ok: true,
      queued: result.added,
      failed: result.failed,
      total: validatedLeads.length,
      skipped: skipped.length,
    });
  } catch (err) {
    console.error("[CALLFIRE] ✗ ERROR:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// START TAG DIALER
// ═══════════════════════════════════════════════════════════════════════════

async function startTagDialer(req, res) {
  console.log("[CALLFIRE] ══════════════════════════════════════════════════");
  console.log("[CALLFIRE] POST /start-tag");

  try {
    const { leads, filters } = req.body;

    if (!leads || !leads.length) {
      return res.status(400).json({ ok: false, error: "No leads provided" });
    }

    console.log(`[CALLFIRE] Validating ${leads.length} prospects...`);

    const validatedLeads = [];
    const skipped = [];

    for (const lead of leads) {
      const validation = await validatePhone(lead.phone);
      if (validation.canCall) {
        validatedLeads.push({ ...lead, phone: validation.phone });
      } else {
        skipped.push({
          phone: lead.phone,
          reason: validation.error || "failed",
        });
      }
    }

    console.log(
      `[CALLFIRE] Validated: ${validatedLeads.length} passed, ${skipped.length} skipped`,
    );

    if (validatedLeads.length === 0) {
      return res
        .status(400)
        .json({ ok: false, error: "No leads passed validation" });
    }

    const result = await addContactsToBroadcast(
      validatedLeads.map((l) => ({
        phone: l.phone,
        name: l.name,
        caseId: l.caseId,
      })),
    );

    if (!result.ok) {
      return res.status(500).json({ ok: false, error: result.errors[0] });
    }

    await startBroadcast();

    dialerSession = {
      isRunning: true,
      isPaused: false,
      mode: "tag",
      stats: {
        queued: result.added,
        processed: 0,
        failed: result.failed,
        total: validatedLeads.length,
      },
      leads: validatedLeads,
    };

    console.log("[CALLFIRE] ✓ TAG dialer started");
    console.log(
      "[CALLFIRE] ══════════════════════════════════════════════════",
    );

    return res.json({
      ok: true,
      queued: result.added,
      failed: result.failed,
      total: validatedLeads.length,
      skipped: skipped.length,
    });
  } catch (err) {
    console.error("[CALLFIRE] ✗ ERROR:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STATUS / CONTROL ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

async function getDialerStatus(req, res) {
  try {
    const broadcastStatus = await getBroadcastStatus();
    if (broadcastStatus.ok && broadcastStatus.data) {
      const stats = broadcastStatus.data.statistics || {};
      dialerSession.stats.processed = stats.totalOutboundCount || 0;
    }

    return res.json({
      ok: true,
      isRunning: dialerSession.isRunning,
      isPaused: dialerSession.isPaused,
      mode: dialerSession.mode,
      stats: dialerSession.stats,
    });
  } catch (err) {
    return res.json({
      ok: true,
      isRunning: dialerSession.isRunning,
      isPaused: dialerSession.isPaused,
      mode: dialerSession.mode,
      stats: dialerSession.stats,
    });
  }
}

async function stopDialer(req, res) {
  dialerSession.isRunning = false;
  dialerSession.isPaused = false;
  console.log("[CALLFIRE] Dialer stopped");
  return res.json({ ok: true });
}

async function pauseDialer(req, res) {
  dialerSession.isPaused = true;
  return res.json({ ok: true });
}

async function resumeDialer(req, res) {
  dialerSession.isPaused = false;
  await startBroadcast();
  return res.json({ ok: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGICS API HELPER
// Uses PARAMS like logicsService.js fetchCaseInfo does
// GetCasesByStatus requires StatusID as a HEADER per V4 docs
// CaseInfo can use params
// ═══════════════════════════════════════════════════════════════════════════

async function fetchLogicsProspects(domain, filters = {}) {
  console.log(`[CALLFIRE:LOGICS] ────────────────────────────────────────────`);
  console.log(`[CALLFIRE:LOGICS] Domain: ${domain}`);
  console.log(`[CALLFIRE:LOGICS] Filters:`, JSON.stringify(filters, null, 2));

  const cfg = logicsConfig[domain] || logicsConfig.TAG;

  console.log(`[CALLFIRE:LOGICS] BaseURL: ${cfg.baseUrl}`);
  console.log(`[CALLFIRE:LOGICS] API Key: ${cfg.apiKey ? "✓" : "MISSING"}`);
  console.log(`[CALLFIRE:LOGICS] Secret: ${cfg.secret ? "✓" : "MISSING"}`);

  if (!cfg.apiKey || !cfg.secret || !cfg.baseUrl) {
    console.warn(`[CALLFIRE:LOGICS] ✗ Missing credentials`);
    return [];
  }

  try {
    // Step 1: Get CaseIDs by status
    // V4 API requires StatusID as a HEADER
    const statusIds = filters.statusIds || [1, 2];
    let allCaseIds = [];

    console.log(
      `[CALLFIRE:LOGICS] Step 1: GetCasesByStatus for ${statusIds.join(", ")}...`,
    );

    for (const statusId of statusIds) {
      const url = `${cfg.baseUrl}/Case/GetCasesByStatus`;
      console.log(`[CALLFIRE:LOGICS]   GET ${url}`);
      console.log(`[CALLFIRE:LOGICS]   StatusID: ${statusId} (as header)`);

      try {
        const resp = await axios.get(url, {
          auth: { username: cfg.apiKey, password: cfg.secret },
          headers: {
            StatusID: String(statusId),
            "Content-Type": "application/json",
          },
        });

        console.log(
          `[CALLFIRE:LOGICS]   Response Success: ${resp.data?.Success}`,
        );

        // V4 returns { Success: true, data: [caseId1, caseId2, ...] }
        if (resp.data?.Success && Array.isArray(resp.data.data)) {
          console.log(
            `[CALLFIRE:LOGICS]   Found ${resp.data.data.length} cases`,
          );
          allCaseIds = [...allCaseIds, ...resp.data.data];
        } else {
          console.log(
            `[CALLFIRE:LOGICS]   Unexpected response:`,
            JSON.stringify(resp.data).substring(0, 200),
          );
        }
      } catch (err) {
        console.error(
          `[CALLFIRE:LOGICS]   Error for status ${statusId}:`,
          err.message,
        );
        if (err.response) {
          console.error(
            `[CALLFIRE:LOGICS]   HTTP ${err.response.status}:`,
            JSON.stringify(err.response.data),
          );
        }
      }
    }

    allCaseIds = [...new Set(allCaseIds)];
    console.log(`[CALLFIRE:LOGICS] Total unique CaseIDs: ${allCaseIds.length}`);

    if (allCaseIds.length === 0) return [];

    // Step 2: Fetch CaseInfo for each using PARAMS (like logicsService.js does)
    console.log(
      `[CALLFIRE:LOGICS] Step 2: Fetching CaseInfo (batches of 50)...`,
    );

    const BATCH_SIZE = 50;
    const leads = [];

    const startDate = filters.startDate ? new Date(filters.startDate) : null;
    const endDate = filters.endDate
      ? new Date(filters.endDate + "T23:59:59")
      : null;

    let fetchedCount = 0;
    let filteredOutCount = 0;

    for (let i = 0; i < allCaseIds.length; i += BATCH_SIZE) {
      const batch = allCaseIds.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (caseId) => {
          try {
            // Use PARAMS like fetchCaseInfo in logicsService.js
            const resp = await axios.get(`${cfg.baseUrl}/Case/CaseInfo`, {
              auth: { username: cfg.apiKey, password: cfg.secret },
              params: { CaseID: parseInt(caseId, 10) },
            });

            // Response format: { Success: true, Data: { CaseID, FirstName, ... } }
            if (resp.data?.Success && resp.data?.Data) {
              fetchedCount++;
              return resp.data.Data;
            }
            // Some APIs use lowercase 'data'
            if (resp.data?.Success && resp.data?.data) {
              fetchedCount++;
              return resp.data.data;
            }
          } catch (err) {
            // Skip individual failures
          }
          return null;
        }),
      );

      // Filter results
      for (const caseData of batchResults) {
        if (!caseData) continue;

        // Date filter
        if (startDate || endDate) {
          const createdDate = caseData.CreatedDate
            ? new Date(caseData.CreatedDate)
            : null;
          if (!createdDate) {
            filteredOutCount++;
            continue;
          }
          if (startDate && createdDate < startDate) {
            filteredOutCount++;
            continue;
          }
          if (endDate && createdDate > endDate) {
            filteredOutCount++;
            continue;
          }
        }

        // Source filter
        const sourceName = caseData.SourceName || "";
        if (filters.sourceName && filters.sourceName !== "all") {
          if (sourceName !== filters.sourceName) {
            filteredOutCount++;
            continue;
          }
        }
        if (filters.sourceNameContains) {
          if (!sourceName.includes(filters.sourceNameContains)) {
            filteredOutCount++;
            continue;
          }
        }

        // Phone required
        const phone =
          caseData.CellPhone || caseData.HomePhone || caseData.WorkPhone;
        if (!phone) {
          filteredOutCount++;
          continue;
        }

        leads.push(caseData);
      }

      // Small delay between batches
      if (i + BATCH_SIZE < allCaseIds.length) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    console.log(
      `[CALLFIRE:LOGICS] Fetched: ${fetchedCount}, Filtered: ${filteredOutCount}, Final: ${leads.length}`,
    );
    console.log(
      `[CALLFIRE:LOGICS] ────────────────────────────────────────────`,
    );

    return leads;
  } catch (err) {
    console.error(`[CALLFIRE:LOGICS] ✗ ERROR:`, err.message);
    if (err.response) {
      console.error(`[CALLFIRE:LOGICS] Status: ${err.response.status}`);
      console.error(
        `[CALLFIRE:LOGICS] Data:`,
        JSON.stringify(err.response.data, null, 2),
      );
    }
    return [];
  }
}

module.exports = {
  getWynnLeads,
  getTagLeads,
  startWynnDialer,
  startTagDialer,
  getDialerStatus,
  stopDialer,
  pauseDialer,
  resumeDialer,
};
