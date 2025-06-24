const logicsService = require("../services/logicsService");
const {
  addVerifiedClientsAndReturnReviewList,
} = require("../utils/bulkAddClientsChecks");
const { singleListFilter } = require("../utils/singleListFilter");
const Client = require("../models/Client");
const PeriodContacts = require("../models/PeriodContacts");
const settlementOfficers = require("../libraries/settlementOfficers");
const {
  addVerifiedClientsAndReturnUpdatedLists,
} = require("../utils/newPeriodContactChecks");
const {
  validatePhone,
  validateEmail,
} = require("../services/validationService");
const ValidatedPhone = require("../models/ValidatedPhone");

// Initialize NeverBounce client

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
function getTomorrowDateOnly() {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const dateOnly = tomorrow.toISOString().split("T")[0];
  return new Date(dateOnly);
}

async function buildSchedule(req, res, next) {
  try {
    const { domain, stage } = req.body;
    console.log("🔎 buildSchedule payload:", req.body);
    const recentPeriods = await PeriodContacts.find() // only the same stage
      .sort({ periodStartDate: -1 })
      .limit(4)
      .lean();
    const contactedClientIDs = recentPeriods
      .filter((p) => p.createDateStage === stage)
      .flatMap((p) => p.contactedClientIDs);
    // 1) Fetch all active/partial clients (optionally filter by domain)
    const baseFilter = { status: { $in: ["active", "partial"] } };
    if (domain) baseFilter.domain = domain;
    const allClients = await Client.find(baseFilter).lean();
    console.log(`⚙️  Loaded ${allClients.length} clients`);

    // 2) Hard‑coded filtering
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const passed = [];
    const skipped = [];

    for (const c of allClients) {
      const rm = []; // reviewMessages

      const lastPay = c.totalPayment || 0;
      const lastInvAmt = c.lastInvoiceAmount || 0;
      const lastInvDate = c.lastInvoiceDate
        ? new Date(c.lastInvoiceDate)
        : null;

      if (lastPay > 50000) {
        rm.push(`[skip] ${c.caseNumber}: totalPayment > 50000`);
      } else if (lastInvDate && lastInvDate > sixtyDaysAgo) {
        rm.push(`[skip] ${c.caseNumber}: lastInvoiceDate within 60 days`);
      } else if (lastInvAmt < -2000) {
        rm.push(`[skip] ${c.caseNumber}: lastInvoiceAmount < -2000`);
      } else if (
        Array.isArray(c.stagesReceived) &&
        c.stagesReceived.includes(stage)
      ) {
        rm.push(`[skip] ${c.caseNumber}: already received stage "${stage}"`);
      } else if (contactedClientIDs.includes(c._id.toString())) {
        rm.push(
          `[skip] ${c.caseNumber}: contacted for "${stage}" in one of last 4 periods`
        );
      }

      if (rm.length) {
        skipped.push({ ...c, reviewMessages: rm });
      } else {
        passed.push(c);
      }
    }

    console.log(
      `✅ ${passed.length} candidates passed; ${skipped.length} skipped`
    );

    // 3) Vet against invoices/billing/activity logic
    const { toReview, partial, verified } =
      await addVerifiedClientsAndReturnUpdatedLists(passed);

    // 4) Create new period
    const newPeriod = await PeriodContacts.create({
      createDateStage: stage,
      periodStartDate: getTomorrowDateOnly(),
      filters: {}, // we dropped the old dynamic filters
      createDateClientIDs: verified.map((v) => v._id),
    });

    // 5) Respond
    res.json({
      message: "New period created",
      periodInfo: {
        id: newPeriod._id,
        startDate: newPeriod.periodStartDate,
        stage,
        periodSize: verified.length,
      },
      verified,
      toReview: [...toReview, ...skipped],
      partial,
    });
  } catch (err) {
    next(err);
  }
}

async function unifiedClientSearch(req, res, next) {
  try {
    const {
      query = "",
      dateType = "createDate",
      startDate,
      domain,
      endDate,
      stagePiece,
      invoiceCount,
      lastInvoiceAmount,
      totalPayment,
    } = req.body;

    console.log(req.body);
    const searchConditions = [];

    // 🔍 1. Text search by name, caseNumber, email, or cell
    if (query) {
      const q = query.trim();
      searchConditions.push({ name: new RegExp(q, "i") });
      searchConditions.push({ caseNumber: new RegExp(q, "i") });
      searchConditions.push({ email: new RegExp(q, "i") });
      searchConditions.push({ cell: new RegExp(q, "i") });
    }

    const filter = {};
    if (searchConditions.length) filter.$or = searchConditions;

    // 🗓 2. Date filters (createDate or saleDate)
    if (startDate || endDate) {
      filter[dateType] = {};
      if (startDate) filter[dateType].$gte = new Date(startDate);
      if (endDate) filter[dateType].$lte = new Date(endDate);
    }

    // 🧾 3. Stage piece
    if (stagePiece) filter.stagePieces = stagePiece;

    // 💵 4. Numeric filters
    if (invoiceCount) filter.invoiceCount = { $gte: Number(invoiceCount) };
    if (lastInvoiceAmount)
      filter.lastInvoiceAmount = { $gte: Number(lastInvoiceAmount) };
    if (totalPayment) filter.totalPayment = { $gte: Number(totalPayment) };

    const clients = await Client.find(filter)
      .sort({ lastContactDate: -1 })
      .lean();

    return res.json(clients);
  } catch (err) {
    console.error("/search error:", err);
    return res.status(500).json({ message: "Search failed." });
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
      /*
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
      */
    }

    // ─── 6) Send the email with all attachments ─────────────────────
    await sendEmail({
      to: process.env.MAILHOUSE_EMAIL,
      from: process.env.ADMIN_EMAIL,
      subject: "Daily Drop",
      html: "<p>Please see the attached file.</p>",
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

// 2. Your existing phone validation function assumed available
// async function validatePhone(number) { ... }

async function buildLienList(req, res, next) {
  try {
    const liens = req.body.lexDataArray;

    console.log(liens, "liens");

    const normalizePhone = (raw) => raw.replace(/\D/g, "").slice(-10);

    async function buildPhoneList() {
      const phoneList = [];

      for (const lien of liens) {
        const rawPhones = lien.phones || lien.AllPhones || [];
        const phonesToCheck = Array.isArray(rawPhones)
          ? rawPhones
          : rawPhones
          ? [rawPhones]
          : [];
        const validPhonesSet = new Set();

        for (const phone of phonesToCheck) {
          const rawNumber =
            typeof phone === "string" ? phone : phone.number || "";
          const normalizedPhone = normalizePhone(rawNumber);
          if (normalizedPhone.length !== 10) continue;
          try {
            const apiResult = await validatePhone(normalizedPhone);

            const isClean =
              apiResult.national_dnc === "N" &&
              apiResult.state_dnc === "N" &&
              !["disconnected", "invalid-phone", "ERROR"].includes(
                apiResult.status
              );
            if (isClean) {
              validPhonesSet.add(normalizedPhone);
            }
          } catch (err) {
            console.warn(
              `Phone validation error (${rawNumber}): ${err.message}`
            );
          }
        }

        // Only push liens with at least one valid phone
        if (validPhonesSet.size > 0) {
          phoneList.push({
            ...lien,
            phones: Array.from(validPhonesSet),
          });
        }
      }
      return phoneList;
    }

    async function buildEmailList() {
      const emailList = [];

      for (const lien of liens) {
        const rawEmails = lien.emails || lien.AllEmails || [];
        const emailsToCheck = Array.isArray(rawEmails)
          ? rawEmails
          : rawEmails
          ? [rawEmails]
          : [];
        const validEmailsSet = new Set();

        for (const email of emailsToCheck) {
          if (!email) continue;
          try {
            const isValid = await validateEmail(email);

            const lowerEmail = email.toLowerCase();
            if (isValid === "valid") {
              validEmailsSet.add(lowerEmail);
            }
          } catch (err) {
            console.warn(`Email validation error (${email}): ${err.message}`);
          }
        }

        if (validEmailsSet.size > 0) {
          emailList.push({
            ...lien,
            emails: Array.from(validEmailsSet),
          });
        }
      }
      return emailList;
    }

    // Run both at the same time:
    const [validatedPhones, validatedEmails] = await Promise.all([
      buildPhoneList(),
      buildEmailList(),
    ]);
    function combineValidatedLists(validatedPhones, validatedEmails) {
      const combinedMap = {};

      // Start with phones
      validatedPhones.forEach((item) => {
        if (!item.caseNumber) return;
        combinedMap[item.caseNumber] = {
          ...item,
          phones: Array.isArray(item.phones) ? item.phones : [item.phones],
          emails: [],
        };
      });

      // Add in emails
      validatedEmails.forEach((item) => {
        if (!item.caseNumber) return;
        if (!combinedMap[item.caseNumber]) {
          // If not present, create new
          combinedMap[item.caseNumber] = {
            ...item,
            phones: [],
            emails: Array.isArray(item.emails) ? item.emails : [item.emails],
          };
        } else {
          // If present, merge emails in
          const prevEmails = combinedMap[item.caseNumber].emails || [];
          const newEmails = Array.isArray(item.emails)
            ? item.emails
            : [item.emails];
          combinedMap[item.caseNumber].emails = Array.from(
            new Set([...prevEmails, ...newEmails])
          );
        }
      });

      // If you want to ensure no duplicate phones within the same caseNumber:
      Object.values(combinedMap).forEach((entry) => {
        if (Array.isArray(entry.phones)) {
          entry.phones = Array.from(new Set(entry.phones));
        }
      });

      return Object.values(combinedMap);
    }
    const validatedLienList = combineValidatedLists(
      validatedPhones,
      validatedEmails
    );
    // Now finalList is an array: one object per unique caseNumber, with both phones & emails

    return res.json({
      validatedLienList,
    });
  } catch (err) {
    console.error("❌ buildLienList error:", err);
    next(err);
  }
}
async function filterList(req, res, next) {
  try {
    const { clients, domain } = req.body;
    if (!Array.isArray(clients)) {
      return res
        .status(400)
        .json({ message: "Bad request: `clients` must be an array" });
    }

    const filteredClients = await singleListFilter(clients, domain);
    console.log(filteredClients);
    return res.json(filteredClients);
  } catch (err) {
    next(err);
  }
}
// 7) build final list

module.exports = {
  postNCOA,
  parseZeroInvoices,
  addCreateDateClients,
  filterList,
  buildSchedule,
  buildDialerList,
  buildLienList,
  unifiedClientSearch,
  downloadAndEmailDaily,
};
