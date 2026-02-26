/**
 * listCleanerController.js
 *
 * Handles list cleaning with progress logging and error resilience
 */

const { cleanClientList } = require("../utils/clientListCleaner");
const {
  cleanProspectPhones,
  cleanProspectEmails,
} = require("../utils/prospectListCleaner");

/**
 * POST /api/list-cleaner/clients
 * Returns { flagged, clean, meta } - flagged items include full review data
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

    console.log(
      `[API] Starting clean for ${contacts.length} contacts on ${domain}`
    );
    const startTime = Date.now();

    const result = await cleanClientList(contacts, domain);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[API] Completed in ${duration}s`);

    return res.json({
      flagged: result.flagged,
      clean: result.clean,
      stats: {
        total: contacts.length,
        clean: result.clean.length,
        flagged: result.flagged.length,
        errors: result.meta.errors,
        durationSeconds: parseFloat(duration),
      },
    });
  } catch (err) {
    console.error(`[API] Fatal error: ${err.message}`);
    next(err);
  }
}

/**
 * POST /api/list-cleaner/prospects-phone
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
 * POST /api/list-cleaner/prospects-email
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

module.exports = { cleanClients, cleanProspectsPhone, cleanProspectsEmail };
