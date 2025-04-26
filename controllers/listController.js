const logicsService = require("../services/logicsService");
const verifyClientStatus = require("../utils/verifyClientStatus");

/**
 * Bulk import leads into both TAG and WYNN Logics
 * POST /api/list/postNCOA
 */
async function postNCOA(req, res, next) {
  try {
    const leads = req.body;
    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ message: "No leads provided." });
    }

    // Send to both TAG and WYNN
    const results = await Promise.all(
      leads.map(async (lead) => {
        // TAG
        const tagResult = await logicsService.postCaseFile("TAG", lead);
        // WYNN
        const wynnResult = await logicsService.postCaseFile("WYNN", lead);
        return { lead, tagResult, wynnResult };
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
async function buildSchedule(req, res, next) {
  try {
    const { filters = {} } = req.body;

    // 1️⃣ Build query from filters
    const query = {};
    if (filters.stage) query.stage = filters.stage;
    if (filters.status?.length) query.status = { $in: filters.status };
    if (filters.domain) query.domain = filters.domain;
    if (filters.saleDate) {
      const { from, to } = filters.saleDate;
      query.saleDate = {
        ...(from && { $gte: new Date(from) }),
        ...(to && { $lte: new Date(to) }),
      };
    }
    if (filters.invoiceCount) {
      const { min, max } = filters.invoiceCount;
      query.invoiceCount = {
        ...(min != null && { $gte: min }),
        ...(max != null && { $lte: max }),
      };
    }
    if (filters.contactedThisPeriod != null) {
      query.contactedThisPeriod = filters.contactedThisPeriod;
    }

    // 2️⃣ Fetch clients matching filters
    const rawClients = await Client.find(query).lean();

    // 3️⃣ Run status verification and persist updates
    const updatedClients = await Promise.all(
      rawClients.map((client) => verifyClientStatus(client))
    );

    // 4️⃣ Save periodContacts IDs
    let periodDoc = await PeriodContacts.findOne();
    const ids = updatedClients.map((c) => c._id.toString());
    if (!periodDoc) {
      periodDoc = new PeriodContacts({ createDateClientIDs: ids });
    } else {
      periodDoc.createDateClientIDs = ids;
    }
    await periodDoc.save();

    // 5️⃣ Prepare response, ensuring reviewDate & lastContactDate are included
    const responseData = updatedClients.map((client) => ({
      _id: client._id,
      name: client.name,
      caseNumber: client.caseNumber,
      email: client.email,
      cell: client.cell,
      domain: client.domain,
      status: client.status,
      stage: client.stage,
      reviewDate: client.reviewDate || null,
      lastContactDate: client.lastContactDate || null,
    }));

    return res.json({
      message: "Schedule built successfully",
      data: responseData,
    });
  } catch (err) {
    return next(err);
  }
}
async function addCreateDateClients(req, res, next) {
  try {
    // TODO: Implement period contact selection logic
    const placeholder = [];
    res.json({ message: "Schedule list placeholder", data: placeholder });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  postNCOA,
  addCreateDateClients,
  buildSchedule,
};
