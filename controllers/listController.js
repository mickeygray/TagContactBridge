const logicsService = require("../services/logicsService");
const {
  addVerifiedClientsAndReturnReviewList,
} = require("../utils/bulkAddClientsChecks");
const Client = require("../models/Client");
const PeriodContacts = require("../models/PeriodContacts");
const {
  addVerifiedClientsAndReturnUpdatedLists,
} = require("../utils/newPeriodContactChecks");
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
      delete client.reviewMessage;

      // 1️⃣ Must have a createDate
      if (!createDate) {
        client.reviewMessage = `[buildSchedule] Skipping ${caseNumber}: missing createDate`;
        return client;
      }

      // 2️⃣ Reviewed too recently?
      if (hasRecentReview(reviewDates)) {
        client.reviewMessage = `[buildSchedule] Skipping ${caseNumber}: reviewed within last 3 business days.`;
        return client;
      }

      // 3️⃣ If they’ve already seen this stage and we’re not re-sending it, skip
      if (prospectReceived === false && stagesReceived.includes(stage)) {
        client.reviewMessage = `[buildSchedule] Skipping ${caseNumber}: already received stage '${stage}'`;
        return client;
      }

      // 4️⃣ Already flagged delinquent?
      if (delinquentAmount > 0) {
        client.reviewMessage = `[buildSchedule] Skipping ${caseNumber}: already delinquent`;
        return client;
      }

      // 5️⃣ “Three-strikes” rule
      if (reviewDates.length >= 3) {
        client.reviewMessage = `[buildSchedule] Skipping ${caseNumber}: 3+ prior reviewDates`;
        return client;
      }

      // 6️⃣ Already in any active period?
      if (excludedIds.has(String(_id))) {
        client.reviewMessage = `[buildSchedule] Skipping ${caseNumber}: already in a period`;
        return client;
      }

      // ✅ passed all redundancy checks
      return client;
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
      creatDateStage: stage,
      periodStartDate: getNext3AM(), // tomorrow
      filters: req.body, // snapshot
      createDateClientIDs: verified.map((v) => v._id),
      isActive: true,
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

module.exports = {
  postNCOA,
  addCreateDateClients,
  buildSchedule,
  addNewReviewedClient,
};
