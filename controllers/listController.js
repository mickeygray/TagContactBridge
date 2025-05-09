const logicsService = require("../services/logicsService");
const {
  addVerifiedClientsAndReturnReviewList,
} = require("../utils/bulkAddClientsChecks");
const Client = require("../models/Client");
const PeriodContacts = require("../models/PeriodContacts");
const settlementOfficers = require("../libraries/settlementOfficers");
const {
  addVerifiedClientsAndReturnUpdatedLists,
} = require("../utils/newPeriodContactChecks");
const { validatePhone } = require("../services/validationService");
const ValidatedPhone = require("../models/ValidatedPhone");
const {
  downloadLatestZip,
  unzipPassworded,
} = require("../services/lexisService");
const sendEmail = require("../utils/sendEmail");
const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");
// where we drop today’s files
const DAILY_DIR = path.join(
  __dirname,
  "..",
  "Templates",
  "attachments",
  "daily"
);
function collectFiles(dir) {
  let out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      out = out.concat(collectFiles(full));
    } else if (path.extname(full).toLowerCase() !== ".zip") {
      out.push(full);
    }
  }
  return out;
}
/**
 * Bulk import leads into both TAG and WYNN Logics
 * POST /api/list/postNCOA
 */
async function postNCOA(req, res, next) {
  try {
    const leads = req.body;
    console.log("Received", req.body.length, "leads");
    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ message: "No leads provided." });
    }

    // Send to both TAG and WYNN
    const results = await Promise.all(
      leads.map(async (lead) => {
        // TAG
        const tagResult = await logicsService.postCaseFile("TAG", lead);
        // WYNN
        //const wynnResult = await logicsService.postCaseFile("WYNN", lead);
        return { lead, tagResult };
      })
    );

    res.json({ message: "Leads posted to TAG & WYNN", results });
  } catch (err) {
    next(err);
  }
}

/**
 * Placeholder for building marketing schedule lists
 * GET /api/list/buildSchedule
 */
// POST /api/buildPeriod
async function buildSchedule(req, res, next) {
  try {
    const {
      contactAge, // { from?, to? } in days
      invoiceAge, // { from?, to? } in days
      invoiceAmount, // { min?, max? }
      invoiceCount, // { min?, max? }
      totalPayments, // { min?, max? }
      prospectReceived, // boolean: have they seen this stage already?
      domain, // optional domain filter
      stage, // campaign stage name
    } = req.body;
    console.log(req.body);

    const daysToMs = (d) => d * 24 * 60 * 60 * 1000;

    // 1️⃣ Turn `{ from?, to? }` in days into real Dates (or null)
    const parseDayRange = ({ from, to } = {}) => ({
      from: from != null ? new Date(Date.now() - daysToMs(from)) : null,
      to: to != null ? new Date(Date.now() - daysToMs(to)) : null,
    });

    // 2️⃣ Build the `$or` date clause for lastContactDate ⧸ createDate
    function buildDateQuery(field, { from, to }) {
      // if neither bound supplied, no clause at all
      if (!from && !to) return {};
      const range = {};
      if (from) range.$lte = from;
      if (to) range.$gte = to;
      return {
        $or: [
          { [field]: range },
          { lastContactDate: { $exists: false }, createDate: range },
        ],
      };
    }

    // 3️⃣ Build a simple numeric range query
    function buildRangeQuery(field, { min, max } = {}) {
      const range = {};
      if (min != null) range.$gte = min;
      if (max != null) range.$lte = max;
      return Object.keys(range).length ? { [field]: range } : {};
    }

    const allPeriods = await PeriodContacts.find({}).lean();
    const excludedIds = new Set(
      allPeriods.flatMap((p) =>
        p.createDateClientIDs.map((id) => id.toString())
      )
    );

    /**
     * Returns true if this client should remain in the candidate list.
     * Skips if:
     *  - no createDate
     *  - already saw this stage (and prospectReceived===false)
     *  - already delinquent
     *  - already has 3+ reviewDates
     *  - already in an active period
     */

    function hasRecentReview(reviewDates) {
      if (!Array.isArray(reviewDates) || reviewDates.length === 0) {
        return false;
      }

      // Compute the cutoff for “3 business days ago”
      function getThreeBusinessDaysAgo(from = new Date()) {
        // Mon–Wed → subtract 5, Thu–Fri → subtract 3
        const OFFSETS = { 1: 5, 2: 5, 3: 5, 4: 3, 5: 3 };
        const dow = from.getDay(); // 0=Sun, 1=Mon…6=Sat
        const daysBack = OFFSETS[dow] ?? 3; // default 3 for Sat/Sun
        return new Date(from.getTime() - daysBack * 24 * 60 * 60 * 1000);
      }

      const cutoff = getThreeBusinessDaysAgo();
      return reviewDates.some((dateStr) => {
        const d = new Date(dateStr);
        return d >= cutoff;
      });
    }
    function redundancyFilter(client, { prospectReceived = true, stage = "" }) {
      const {
        _id,
        caseNumber,
        createDate,
        delinquentAmount = 0,
        reviewDates = [],
        stagesReceived = [],
      } = client;

      // reset any old message
      const reviewMessages = [];
      // 1️⃣ Must have a createDate
      if (!createDate) {
        reviewMessages.push(
          `[buildSchedule] Skipping ${caseNumber}: missing createDate`
        );
        return client;
      }

      // 2️⃣ Reviewed too recently?
      if (hasRecentReview(reviewDates)) {
        reviewMessages.push(
          `[buildSchedule] Skipping ${caseNumber}: reviewed within last 3 business days.`
        );
        return client;
      }

      // 3️⃣ If they’ve already seen this stage and we’re not re-sending it, skip
      if (prospectReceived === false && stagesReceived.includes(stage)) {
        reviewMessages.push(
          `[buildSchedule] Skipping ${caseNumber}: already received stage '${stage}'`
        );
        return client;
      }

      // 4️⃣ Already flagged delinquent?
      if (delinquentAmount > 0) {
        reviewMessages.push(
          `[buildSchedule] Skipping ${caseNumber}: already delinquent`
        );
        return client;
      }

      // 5️⃣ “Three-strikes” rule
      if (reviewDates.length >= 3) {
        reviewMessages.push(
          `[buildSchedule] Skipping ${caseNumber}: 3+ prior reviewDates`
        );
        return client;
      }

      // 6️⃣ Already in any active period?
      if (excludedIds.has(String(_id))) {
        reviewMessages.push(
          `[buildSchedule] Skipping ${caseNumber}: already in a period`
        );
        return client;
      }

      // ✅ passed all redundancy checks
      return { ...client, reviewMessages };
    }

    // 4️⃣ Resolve “maxTotalPayments” if the user passed either a number or an object
    function resolveMaxTotalPayments(tp) {
      if (tp == null) return null;
      if (typeof tp === "number" || typeof tp === "string") {
        const n = Number(tp);
        return isNaN(n) ? null : n;
      }
      if (typeof tp === "object") {
        const n = Number(tp.max);
        return isNaN(n) ? null : n;
      }
      return null;
    }

    // 5️⃣ Build your base query step by step
    const now = Date.now();
    const contactCutoffs = parseDayRange(contactAge);
    const invoiceCutoffs = parseDayRange(invoiceAge);
    const maxTotalPayments = resolveMaxTotalPayments(totalPayments);

    let baseQuery = {
      status: { $in: ["active", "partial"] },
      ...buildDateQuery("lastContactDate", contactCutoffs),
      ...buildDateQuery("lastInvoiceDate", invoiceCutoffs),
      ...buildRangeQuery("lastInvoiceAmount", invoiceAmount),
      ...buildRangeQuery("invoiceCount", invoiceCount),
      // only include totalPayment filter if user really passed something
      ...(totalPayments != null
        ? buildRangeQuery("totalPayment", { max: maxTotalPayAmt })
        : {}),
    };

    // optional domain
    if (domain) baseQuery.domain = domain;

    // optional “haven’t yet seen this stage”
    if (prospectReceived === false) {
      baseQuery.stagesReceived = { $ne: stage };
    }

    // DEV-only: inspect your final query
    console.debug(
      "🔍 buildSchedule query:",
      JSON.stringify(baseQuery, null, 2)
    );

    // 6️⃣ Fire it
    const rawClients = await Client.find(baseQuery).lean();
    // 5️⃣ Fetch matching clients

    console.log(rawClients, "RAWWWWW");
    const annotated = rawClients.map((c) =>
      redundancyFilter(c, { prospectReceived, stage })
    );

    // …then pull out those that passed vs. those we skipped:
    const freshClients = annotated.filter((c) => !c.reviewMessage);
    const skippedClients = annotated.filter((c) => c.reviewMessage);
    // 7️⃣ Enrich & flag each one, passing its own sinceDate
    const { toReview, partial, verified } =
      await addVerifiedClientsAndReturnUpdatedLists(
        freshClients,
        maxTotalPayments
      );

    // 7️⃣ Partition into “pass” vs “needs review”

    function getNext3AM() {
      const now = new Date();
      const candidate = new Date(now);

      // if it’s already 3 AM or later today, bump to tomorrow
      if (now.getHours() >= 3) {
        candidate.setDate(now.getDate() + 1);
      }
      // force the time to 3:00:00.000
      candidate.setHours(3, 0, 0, 0);
      return candidate;
    }
    // 8️⃣ Upsert your PeriodContacts document
    const newPeriod = await PeriodContacts.create({
      createDateStage: req.body.stage,
      periodStartDate: getNext3AM(), // tomorrow
      filters: req.body, // snapshot
      createDateClientIDs: verified.map((v) => v._id),
    });

    // 9️⃣ Respond to the front end
    return res.json({
      message: "New period created",
      periodInfo: {
        id: newPeriod._id,
        startDate: newPeriod.periodStartDate,
        stage,
        periodSize: newPeriod.createDateClientIDs.length,
      },
      verified,
      toReview: [...toReview, ...skippedClients],
      partial,
    });
  } catch (err) {
    next(err);
  }
}

async function addCreateDateClients(req, res, next) {
  try {
    const rawClients = req.body.clients;
    if (!Array.isArray(rawClients) || rawClients.length === 0) {
      return res.status(400).json({ message: "No clients provided." });
    }

    // Delegate all verification + insertion to the util
    const { added, reviewList } = await addVerifiedClientsAndReturnReviewList(
      rawClients
    );

    // Send back both lists
    return res.json({
      added, // Array of Client docs that were just created
      reviewList, // Array of objects that failed verification
    });
  } catch (err) {
    next(err);
  }
}

async function addNewReviewedClient(req, res, next) {
  try {
    const rawClient = req.body;
    if (!rawClient || typeof rawClient !== "object") {
      return res.status(400).json({ message: "No client provided." });
    }

    // Create the new Client document
    const created = await Client.create(rawClient);

    // Return the newly created client
    return res.json(created);
  } catch (err) {
    next(err);
  }
}

async function addClientToPeriodHandler(req, res, next) {
  try {
    const { periodId } = req.params;
    const { clientId } = req.body;

    const period = await PeriodContacts.findById(periodId);
    if (!period) {
      return res.status(404).json({ message: "Period not found" });
    }

    // avoid duplicates
    if (!period.createDateClientIDs.some((id) => id.toString() === clientId)) {
      period.createDateClientIDs.push(clientId);
      await period.save();
    }

    res.json({
      message: `Client ${clientId} added to period ${periodId}`,
      periodIds: period.createDateClientIDs,
    });
  } catch (err) {
    next(err);
  }
}
async function parseZeroInvoices(req, res, next) {
  try {
    const rawClients = req.body.clients;
    if (!Array.isArray(rawClients) || rawClients.length === 0) {
      return res.status(400).json({ message: "No clients provided." });
    }

    const zeroInvoices = [];

    for (const client of rawClients) {
      let invoices;
      try {
        invoices = await logicsService.fetchInvoices(
          client.domain,
          client.caseNumber
        );
      } catch (err) {
        console.error(
          `[Invoice] fetch error for ${client.caseNumber}: ${err.message}`
        );
        continue; // skip this client on fetch error
      }

      if (!Array.isArray(invoices)) continue;
      const officerMap = settlementOfficers[client.domain] || {};
      for (const inv of invoices) {
        const amount = inv.UnitPrice ?? inv.Amount ?? 0;
        if (amount === 0) {
          const id = parseInt(inv.CreatedBy);
          const settlementOfficer = officerMap[id] || `NO SO MATCH FOUND`;

          zeroInvoices.push({
            caseNumber: client.caseNumber,
            settlementOfficer,
            date: inv.CreatedDate,
            description: inv.Description || "",
          });
        }
      }
    }

    return res.json({ zeroInvoices });
  } catch (err) {
    next(err);
  }
}

/**
 * @param {Array<Object>} rows
 *   Each object must have at least:
 *     - ADDRESS (string)
 *     - AMOUNT (string or number)
 *     - PLAINTIFF (string)
 *     - FILING_DATE (string in MM/DD/YY or ISO format)
 *     - FILE_TYPE (string)
 * @returns {Array<Object>} one “winner” per unique ADDRESS
 */
function dedupeByRules(rows) {
  // helper to collapse "5005 Old Midlothian Tpke #74"
  // and " 5005 OLD MIDLOTHIAN TPKE #74 " into the SAME key:
  const normalizeAddr = (addr = "") =>
    addr
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, ""); // drop every non‑alphanumeric

  // 1) Group by normalized address
  const byKey = rows.reduce((map, r) => {
    const key = normalizeAddr(r.ADDRESS);
    if (!map[key]) map[key] = [];
    map[key].push(r);
    return map;
  }, {});

  const survivors = [];

  for (const group of Object.values(byKey)) {
    // if only one record, we keep it
    if (group.length === 1) {
      survivors.push(group[0]);
      continue;
    }

    // parse date & amount once
    group.forEach((r) => {
      r._date = new Date(r.FILING_DATE);
      r._amount = parseFloat(r.AMOUNT) || 0;
    });

    // exactly two, same plaintiff & amount → keep the SECOND
    if (
      group.length === 2 &&
      group[0]._amount === group[1]._amount &&
      group[0].PLAINTIFF === group[1].PLAINTIFF
    ) {
      survivors.push(group[1]);
      continue;
    }

    // otherwise, apply your tie‑break cascade:
    // a) most recent date
    let maxTs = Math.max(...group.map((r) => r._date.getTime()));
    let candidates = group.filter((r) => r._date.getTime() === maxTs);

    // b) if tie → highest amount
    if (candidates.length > 1) {
      const maxAmt = Math.max(...candidates.map((r) => r._amount));
      candidates = candidates.filter((r) => r._amount === maxAmt);
    }

    // c) if tie → prefer “State Tax Lien”
    if (candidates.length > 1) {
      const stateTax = candidates.filter((r) =>
        /State Tax Lien/i.test(r.FILE_TYPE)
      );
      if (stateTax.length) candidates = stateTax;
    }

    // d) if still tie, pick the first
    survivors.push(candidates[0]);
  }

  return survivors;
}

async function downloadAndEmailDaily(req, res, next) {
  try {
    // ─── 1) Prepare a clean directory ────────────────────────────────
    if (fs.existsSync(DAILY_DIR)) {
      fs.rmSync(DAILY_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(DAILY_DIR, { recursive: true });

    // ─── 2) Download the latest ZIP and move it under DAILY_DIR ──────
    const tempZip = await downloadLatestZip();
    const zipName = path.basename(tempZip);
    const finalZip = path.join(DAILY_DIR, zipName);
    fs.renameSync(tempZip, finalZip);

    // ─── 3) Unzip in place ──────────────────────────────────────────
    await unzipPassworded(finalZip, DAILY_DIR, process.env.SFTP_ZIP_PASSWORD);

    // ─── 4) Collect all non‑.zip files as attachments ───────────────
    const attachments = fs
      .readdirSync(DAILY_DIR)
      .filter((f) => !f.toLowerCase().endsWith(".zip"))
      .map((f) => ({ filename: f, path: path.join(DAILY_DIR, f) }));

    // initialize counts
    let totalCount = 0;
    let stateCount = 0;
    let federalCount = 0;

    // ─── 5) Find & parse the CSV ────────────────────────────────────
    const csvAttachment = attachments.find(
      (a) => path.extname(a.filename).toLowerCase() === ".csv"
    );
    if (csvAttachment) {
      const raw = fs.readFileSync(csvAttachment.path, "utf8");

      // normalize just like your other imports
      const csvText = raw
        .replace(/\u0000/g, "")
        .replace(/\r/g, "")
        .replace(/" +/g, '"')
        .replace(/"/g, "")
        .trim();

      const { data: allRows } = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
      });

      // 5a) compute overall counts
      totalCount = allRows.length;
      stateCount = allRows.filter((r) =>
        /State Tax/i.test(r.FILE_TYPE || "")
      ).length;
      federalCount = allRows.filter((r) =>
        /Federal Tax/i.test(r.FILE_TYPE || "")
      ).length;

      // 5b) filter‑out rule: PLAINTIFF “State of …” or STATE “OR”
      const STATES = ["Oregon", "Texas", "Florida", "Tennessee", "Washington"];
      const STATE_OF_RE = new RegExp(`^State of (?:${STATES.join("|")})`, "i");
      const filtered = allRows.filter(
        (r) => !STATE_OF_RE.test(r.PLAINTIFF) && r.STATE !== "OR"
      );

      // 5c) dedupe the filtered set
      const survivors = dedupeByRules(filtered);

      // 5d) compute what was dropped
      const dropped = filtered.filter((r) => !survivors.includes(r));

      // 5e) write out your two CSVs, swapping roles
      const today = new Date().toISOString().split("T")[0]; // YYYY‑MM‑DD
      const mailingPath = path.join(
        DAILY_DIR,
        `DirectMail${today}mailinglist.csv`
      );
      const dedupsPath = path.join(DAILY_DIR, `DirectMail${today}dedups.csv`);

      // survivors → mailinglist
      fs.writeFileSync(mailingPath, Papa.unparse(survivors), "utf8");
      // dropped   → dedups
      fs.writeFileSync(dedupsPath, Papa.unparse(dropped), "utf8");

      // 5f) attach both
      attachments.push(
        { filename: path.basename(mailingPath), path: mailingPath },
        { filename: path.basename(dedupsPath), path: dedupsPath }
      );
    }

    // ─── 6) Send the email with all attachments ─────────────────────
    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      from: process.env.ADMIN_EMAIL,
      subject: "Your Daily Report",
      html: "<p>Please see the attached files.</p>",
      attachments,
    });

    // ─── 7) Cleanup ────────────────────────────────────────────────
    fs.rmSync(DAILY_DIR, { recursive: true, force: true });

    // ─── 8) Return your record counts ──────────────────────────────
    res.json({
      success: true,
      recordCount: { totalCount, stateCount, federalCount },
    });
  } catch (err) {
    next(err);
  }
}

async function buildDialerList(req, res, next) {
  try {
    const rawClients = req.body.clients; // [{ name, cell, caseNumber, domain }]
    const validations = [];

    // 1) Process sequentially so we can attach name+cell to each result
    for (const client of rawClients) {
      const phone = client.cell;
      try {
        const apiResult = await validatePhone(phone);

        validations.push({
          name: client.name,
          caseNumber: client.caseNumber,
          phone,
          ...apiResult,
        });
        console.log(validations.length);
      } catch (err) {
        // on error, still attach the phone & name
        console.log(err);
      }
    }
    console.log(validations);
    console.log(`Got ${validations.length} validation results`);

    // 2) Keep only the “clean” ones
    const clean = validations.filter(
      (v) =>
        v.national_dnc === "N" &&
        v.state_dnc === "N" &&
        v.iscell === "Y" &&
        !["disconnected", "invalid-phone", "ERROR"].includes(v.status)
    );

    console.log(`Filtered down to ${clean.length} dialable numbers`);

    // 3) Save the phones for future skipping
    const docs = clean.map((v) => ({ phone: v.phone }));
    try {
      await ValidatedPhone.insertMany(docs, { ordered: false });
    } catch (e) {
      if (e.code !== 11000) throw e; // ignore duplicate key errors
    }

    // 4) Return the full clean list (with name, caseNumber, phone, API fields)
    return res.json({ dialerList: clean });
  } catch (err) {
    console.error("buildDialerList error:", err);
    next(err);
  }
}

// 7) build final list

module.exports = {
  postNCOA,
  parseZeroInvoices,
  addCreateDateClients,
  buildSchedule,
  addNewReviewedClient,
  buildDialerList,
  addClientToPeriodHandler,
  downloadAndEmailDaily,
};
