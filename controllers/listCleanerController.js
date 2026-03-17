/**
 * listCleanerController.js
 *
 * Async job pattern:
 *   POST /api/cleaner/clients → starts job, returns { jobId }
 *   GET  /api/cleaner/status/:jobId → returns progress or results
 *
 * Jobs live in memory — fine for single-server, single-user.
 */

const { cleanClientList } = require("../utils/clientListCleaner");
const {
  cleanProspectPhones,
  cleanProspectEmails,
} = require("../utils/prospectListCleaner");

// In-memory job store
const jobs = {};

// Auto-cleanup: remove completed jobs after 30 minutes
function scheduleCleanup(jobId) {
  setTimeout(
    () => {
      delete jobs[jobId];
    },
    30 * 60 * 1000,
  );
}

/**
 * POST /api/cleaner/clients
 * Starts async clean job, returns immediately with jobId
 */
async function cleanClients(req, res, next) {
  try {
    const { contacts, domain } = req.body;

    if (!contacts?.length) {
      return res.status(400).json({ error: "No contacts provided" });
    }
    if (!["TAG", "WYNN", "AMITY"].includes(domain)) {
      return res.status(400).json({ error: "Invalid domain" });
    }

    const jobId = `clean_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    jobs[jobId] = {
      status: "running",
      total: contacts.length,
      processed: 0,
      clean: 0,
      flagged: 0,
      removed: 0,
      errors: 0,
      startedAt: new Date().toISOString(),
      result: null,
    };

    console.log(
      `[API] Job ${jobId}: Starting clean for ${contacts.length} contacts on ${domain}`,
    );

    // Return immediately
    res.json({ ok: true, jobId, total: contacts.length });

    // Run in background
    const startTime = Date.now();

    try {
      const result = await cleanClientList(contacts, domain, (progress) => {
        // Progress callback — update job state
        if (jobs[jobId]) {
          jobs[jobId].processed = progress.processed || jobs[jobId].processed;
          jobs[jobId].clean = progress.clean || 0;
          jobs[jobId].flagged = progress.flagged || 0;
          jobs[jobId].removed = progress.removed || 0;
        }
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(
        `[API] Job ${jobId}: Completed in ${duration}s — ${result.clean.length} clean, ${result.flagged.length} flagged`,
      );

      jobs[jobId] = {
        ...jobs[jobId],
        status: "done",
        processed: contacts.length,
        clean: result.clean.length,
        flagged: result.flagged.length,
        removed: contacts.length - result.clean.length - result.flagged.length,
        errors: result.meta?.errors || 0,
        durationSeconds: parseFloat(duration),
        completedAt: new Date().toISOString(),
        result: {
          flagged: result.flagged,
          clean: result.clean,
          stats: {
            total: contacts.length,
            clean: result.clean.length,
            flagged: result.flagged.length,
            errors: result.meta?.errors || 0,
            durationSeconds: parseFloat(duration),
          },
        },
      };

      scheduleCleanup(jobId);
    } catch (err) {
      console.error(`[API] Job ${jobId}: Fatal error: ${err.message}`);
      if (jobs[jobId]) {
        jobs[jobId].status = "error";
        jobs[jobId].error = err.message;
      }
      scheduleCleanup(jobId);
    }
  } catch (err) {
    console.error(`[API] Fatal error: ${err.message}`);
    next(err);
  }
}

/**
 * GET /api/cleaner/status/:jobId
 * Returns current progress or final results
 */
function cleanStatus(req, res) {
  const job = jobs[req.params.jobId];

  if (!job) {
    return res.status(404).json({ ok: false, error: "Job not found" });
  }

  if (job.status === "done") {
    return res.json({
      ok: true,
      status: "done",
      ...job.result,
      durationSeconds: job.durationSeconds,
    });
  }

  if (job.status === "error") {
    return res.json({
      ok: false,
      status: "error",
      error: job.error,
    });
  }

  // Still running — return progress
  return res.json({
    ok: true,
    status: "running",
    total: job.total,
    processed: job.processed,
    clean: job.clean,
    flagged: job.flagged,
    removed: job.removed,
    percent: job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0,
  });
}

/**
 * POST /api/cleaner/prospects-phone
 */
async function cleanProspectsPhone(req, res, next) {
  try {
    const { contacts } = req.body;
    if (!contacts?.length) {
      return res.status(400).json({ error: "No contacts provided" });
    }
    const result = await cleanProspectPhones(contacts);
    return res.json({
      flagged: result.flagged,
      clean: result.clean,
      stats: {
        total: contacts.length,
        clean: result.clean.length,
        flagged: result.flagged.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/cleaner/prospects-email
 */
async function cleanProspectsEmail(req, res, next) {
  try {
    const { contacts } = req.body;
    if (!contacts?.length) {
      return res.status(400).json({ error: "No contacts provided" });
    }
    const result = await cleanProspectEmails(contacts);
    return res.json({
      clean: result.clean,
      flagged: result.flagged,
      stats: {
        total: contacts.length,
        clean: result.clean.length,
        flagged: result.flagged.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  cleanClients,
  cleanStatus,
  cleanProspectsPhone,
  cleanProspectsEmail,
};
