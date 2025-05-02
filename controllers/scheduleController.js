const Client = require("../models/Client");
const PeriodContacts = require("../models/PeriodContacts");
const contactCampaignMap = require("../libraries/contactCampaignMap");
const DailySchedule = require("../models/DailySchedule");
const {
  addVerifiedClientsAndReturnUpdatedLists,
} = require("../utils/verifyClientStatus");

// ⚙️ Util: Remove expired token clients and flag for review
function deleteBadTokenClients(clients) {
  const today = new Date().toISOString().split("T")[0];
  const remaining = [];
  const toReview = [];

  for (const client of clients) {
    const isExpired = client.tokenExpiresAt && client.tokenExpiresAt <= today;
    if (isExpired) toReview.push(client);
    else remaining.push(client);
  }

  return { remaining, toReview };
}
const assignContactMethodAndStagePiece = async (
  dailyPeriodContacts,
  dailyNewClients
) => {
  const today = new Date();

  // Get the current period start date
  const periodDoc = await PeriodContacts.findOne();
  const periodStartDate = periodDoc?.periodStartDate
    ? new Date(periodDoc.periodStartDate)
    : null;

  const processClientList = (clients, type) => {
    return clients
      .map((client) => {
        if (client.contactedThisPeriod) return null;

        const stage = client.stage;
        const stagesReceived = client.stagesReceived || [];
        const stagePieces = client.stagePieces || [];

        // ⏱️ Base date logic
        let baseDate;
        if (type === "createDate") {
          if (!periodStartDate) return null;
          baseDate = periodStartDate;
        } else if (stage === "f433a") {
          baseDate = new Date(client.secondPaymentDate);
        } else {
          baseDate = new Date(client.saleDate);
        }

        const daysOut = Math.floor((today - baseDate) / (1000 * 60 * 60 * 24));

        const campaignGroup = contactCampaignMap[type]?.[stage] || {};
        const piece = campaignGroup[daysOut];

        if (!piece) return null;

        // ⛔ Avoid duplicate stagePieces
        if (stagePieces.includes(piece.stagePiece)) return null;

        const updatedStagesReceived = [...new Set([...stagesReceived, stage])];
        const updatedStagePieces = [
          ...new Set([...stagePieces, piece.stagePiece]),
        ];

        return {
          ...client,
          contactType: piece.contactType,
          stagePiece: piece.stagePiece,
          daysOut,
          lastContactDate: today,
          stagesReceived: updatedStagesReceived,
          stagePieces: updatedStagePieces,
          contactedThisPeriod: false,
        };
      })
      .filter(Boolean);
  };

  const finalPeriodContacts = processClientList(
    dailyPeriodContacts,
    "createDate"
  );
  const finalNewClients = processClientList(dailyNewClients, "saleDate");

  return {
    emailQueue: [
      ...finalPeriodContacts.filter((c) => c.contactType === "email"),
      ...finalNewClients.filter((c) => c.contactType === "email"),
    ],
    textQueue: [
      ...finalPeriodContacts.filter((c) => c.contactType === "text"),
      ...finalNewClients.filter((c) => c.contactType === "text"),
    ],
    dailyPeriodContacts: finalPeriodContacts,
    dailyNewClients: finalNewClients,
  };
};
// 🧠 Main builder for /api/schedule/buildDailySchedule
async function buildDailySchedule(req, res) {
  try {
    const today = new Date().toISOString().split("T")[0];

    // 1️⃣ Reset daily schedule if needed
    const existing = await DailySchedule.findOne({ date: today });
    if (!existing) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const carryOver = await DailySchedule.findOne({
        date: yesterday.toISOString().split("T")[0],
      });
      const textQueue = carryOver?.textQueue || [];

      await DailySchedule.create({
        date: today,
        emailQueue: [],
        textQueue,
        pace: 15,
      });
    }

    // 2️⃣ Pull period and saleDate clients
    const periodDoc = await PeriodContacts.findOne();
    const periodClients = await Client.find({
      _id: { $in: periodDoc?.createDateClientIDs || [] },
    });

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const saleClients = await Client.find({
      saleDate: { $gte: sixtyDaysAgo },
      status: { $in: ["active", "partial"] },
    });

    // 3️⃣ Remove expired tokens
    let toReview = [];
    const { remaining: validPeriodClients, toReview: expiredPeriod } =
      deleteBadTokenClients(periodClients);
    const { remaining: validSaleClients, toReview: expiredSales } =
      deleteBadTokenClients(saleClients);
    toReview = [...toReview, ...expiredPeriod, ...expiredSales];

    // 4️⃣ Run external Logics validation
    const freshClients = [...validPeriodClients, ...validSaleClients];
    const {
      verified,
      partial,
      toReview: flaggedClients,
    } = await addVerifiedClientsAndReturnUpdatedLists(freshClients); // maxTotalPayments = 20k

    toReview = [...toReview, ...flaggedClients];

    // 5️⃣ Convert verified + partial into queues
    const saleClientIDs = new Set(
      validSaleClients.map((c) => c._id.toString())
    );
    const verifiedPeriod = verified.filter(
      (c) => !saleClientIDs.has(c._id.toString())
    );
    const verifiedSales = verified.filter((c) =>
      saleClientIDs.has(c._id.toString())
    );
    const partialPeriod = partial.filter(
      (c) => !saleClientIDs.has(c._id.toString())
    );
    const partialSales = partial.filter((c) =>
      saleClientIDs.has(c._id.toString())
    );

    const { emailQueue, textQueue, dailyPeriodContacts, dailyNewClients } =
      await assignContactMethodAndStagePiece(
        [...verifiedPeriod, ...partialPeriod],
        [...verifiedSales, ...partialSales]
      );

    // 6️⃣ Save queues
    await DailySchedule.findOneAndUpdate(
      { date: today },
      {
        $push: {
          emailQueue: { $each: emailQueue },
          textQueue: { $each: textQueue },
        },
      },
      { upsert: true }
    );

    // 7️⃣ Update client DB values (lastContactDate, status, etc.)
    const allClients = [
      ...dailyPeriodContacts,
      ...dailyNewClients,
      ...toReview,
    ];
    for (const client of allClients) {
      await Client.updateOne(
        { caseNumber: client.caseNumber },
        {
          $set: {
            lastContactDate: client.lastContactDate || new Date(),
            contactedThisPeriod: client.contactedThisPeriod ?? false,
            stagesReceived: client.stagesReceived || [],
            status: client.status || "active",
            stage: client.stage,
            saleDate: client.saleDate,
            secondPaymentDate: client.secondPaymentDate,
            invoiceCount: client.invoiceCount,
            lastInvoiceAmount: client.lastInvoiceAmount,
            delinquentAmount: client.delinquentAmount || null,
            delinquentDate: client.delinquentDate || null,
            token: client.token || null,
            tokenExpiresAt: client.tokenExpiresAt || null,
            domain: client.domain,
            stagePieces: [...stagePieces, client.stagePiece],
          },
        }
      );
    }

    // 8️⃣ Update PeriodContacts client ID list
    if (periodDoc) {
      const updatedIDs = dailyPeriodContacts.map((c) => c._id.toString());
      periodDoc.createDateClientIDs = updatedIDs;
      await periodDoc.save();
    }

    // ✅ Return queues and toReview list
    return res.status(200).json({
      textQueue,
      emailQueue,
      toReview,
    });
  } catch (err) {
    console.error("❌ Error in buildDailySchedule:", err.message);
    return res.status(500).json({ error: "Server error" });
  }
}

module.exports = {
  buildDailySchedule,
};
