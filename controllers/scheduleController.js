// controllers/scheduleController.js

const Client = require("../models/Client");
const PeriodContacts = require("../models/PeriodContacts");
const contactCampaignMap = require("../libraries/contactCampaignMap");
const DailySchedule = require("../models/DailySchedule");
const {
  addVerifiedClientsAndReturnUpdatedLists,
} = require("../utils/newPeriodContactChecks");

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
  dailyPeriodContacts, // full client objects
  dailyNewClients // full client objects
) => {
  const today = new Date().toISOString();
  console.log(
    `[assignContactMethodAndStagePiece] Starting run at ${today}. ` +
      `periodContacts=${dailyPeriodContacts.length}, newClients=${dailyNewClients.length}`
  );

  // 📥 Pull periodStartDate from the PeriodContacts model
  const periodDoc = await PeriodContacts.findOne();
  const periodStartDate = periodDoc?.periodStartDate
    ? new Date(periodDoc.periodStartDate)
    : null;
  console.log(
    `[assignContactMethodAndStagePiece] periodStartDate = ${
      periodStartDate ? periodStartDate.toISOString() : "null"
    }`
  );

  const processClientList = (clients, type) => {
    console.log(
      `[processClientList] Processing ${clients.length} clients for type "${type}"`
    );
    return clients
      .map((client) => {
        if (client.autoPOA) {
          console.log(`[processClientList] Auto‑POA for ${client.caseNumber}`);
          client.contactType = "email";
          client.stagePiece = "POA Email 1";
          client.stagesReceived = [
            ...new Set([...(client.stagesReceived || []), "poa"]),
          ];
          client.stagePieces = [
            ...new Set([...(client.stagePieces || []), "POA Email 1"]),
          ];
          client.contactedThisPeriod = false;
          // clear the flag so we don’t re‑apply
          delete client.autoPOA;
          return client;
        }
        if (client.contactedThisPeriod) {
          console.log(
            `[processClientList] Skipping ${
              client.caseNumber || client._id
            } — already contactedThisPeriod`
          );
          return null;
        }

        // 🔑 pick which “stage” bucket to use
        let stage;
        if (type === "createDate") {
          stage = periodDoc.createDateStage;
        } else {
          const sr = client.stagesReceived || [];
          stage = sr.length > 0 ? sr[sr.length - 1] : null;
        }
        console.log(
          `[processClientList] Client ${client.caseNumber}: using stage="${stage}"`
        );

        // ⏱️ Determine base date
        let baseDate;
        if (type === "createDate") {
          if (!periodStartDate) {
            console.log(
              `[processClientList] Skipping ${client.caseNumber} — no periodStartDate`
            );
            return null;
          }
          baseDate = periodStartDate;
        } else if (stage === "f433a") {
          baseDate = new Date(client.secondPaymentDate);
        } else {
          baseDate = new Date(client.saleDate);
        }

        const daysOut = Math.floor(
          (new Date(today) - baseDate) / (1000 * 60 * 60 * 24)
        );
        console.log(
          `[processClientList] Client ${
            client.caseNumber
          }: baseDate=${baseDate.toISOString()}, daysOut=${daysOut}`
        );
        console.log(
          "[contactCampaignMap] createDate keys:",
          Object.keys(contactCampaignMap.createDate)
        );
        const campaignGroup = contactCampaignMap[type]?.[stage] || {};
        console.log("campaignGroup", campaignGroup);
        const piece = campaignGroup[daysOut];
        if (!piece) {
          console.log(
            `[processClientList] No campaign piece for ${client.caseNumber}, stage="${stage}", daysOut=${daysOut}`
          );
          return null;
        }

        // ⛔ Avoid duplicate today's-stage (unless 'poa')
        const stagesReceived = client.stagesReceived || [];
        if (
          daysOut === 0 &&
          stagesReceived.includes(stage) &&
          stage !== "poa"
        ) {
          console.log(
            `[processClientList] Skipping ${client.caseNumber} — already did stage "${stage}" today`
          );
          return null;
        }

        console.log(
          `[processClientList] Matched piece for ${client.caseNumber}: ` +
            `contactType=${piece.contactType}, stagePiece="${piece.stagePiece}"`
        );

        const updatedStagesReceived = [...new Set([...stagesReceived, stage])];

        return {
          ...client,
          contactType: piece.contactType,
          stagePiece: piece.stagePiece,
          daysOut,
          lastContactDate: new Date(today),
          stagesReceived: updatedStagesReceived,
          contactedThisPeriod: false,
        };
      })
      .filter(Boolean);
  };

  const finalPeriodContacts = processClientList(
    dailyPeriodContacts,
    "createDate"
  );
  console.log(
    `[assignContactMethodAndStagePiece] finalPeriodContacts length = ${finalPeriodContacts.length}`
  );

  const finalNewClients = processClientList(dailyNewClients, "saleDate");
  console.log(
    `[assignContactMethodAndStagePiece] finalNewClients length = ${finalNewClients.length}`
  );

  const emailQueue = [
    ...finalPeriodContacts.filter((c) => c.contactType === "email"),
    ...finalNewClients.filter((c) => c.contactType === "email"),
  ];
  const textQueue = [
    ...finalPeriodContacts.filter((c) => c.contactType === "text"),
    ...finalNewClients.filter((c) => c.contactType === "text"),
  ];

  console.log(
    `[assignContactMethodAndStagePiece] Queues built — emailQueue=${emailQueue.length}, textQueue=${textQueue.length}`
  );

  return {
    emailQueue,
    textQueue,
    dailyPeriodContacts: finalPeriodContacts,
    dailyNewClients: finalNewClients,
  };
};

async function buildDailySchedule(req, res) {
  try {
    const today = new Date().toISOString().split("T")[0];
    console.log(`🗓️  Starting buildDailySchedule for ${today}`);

    // 1️⃣ Reset daily schedule if needed
    const existing = await DailySchedule.findOne({ date: today });
    if (!existing) {
      console.log("🔄 No existing schedule—creating new one");
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const carryOver = await DailySchedule.findOne({
        date: yesterday.toISOString().split("T")[0],
      });
      const textQueue = carryOver?.textQueue?.length || 0;
      console.log(`↪ Carrying over ${textQueue} texts from yesterday`);

      await DailySchedule.create({
        date: today,
        emailQueue: [],
        textQueue: carryOver?.textQueue || [],
        pace: 15,
      });
      console.log("✅ Created new DailySchedule");
    } else {
      console.log("✔️ DailySchedule already exists");
    }

    // 2️⃣ Pull period and saleDate clients
    const periodDoc = await PeriodContacts.findOne();
    const periodIds = periodDoc?.createDateClientIDs || [];
    const periodClients = await Client.find({ _id: { $in: periodIds } }).lean();
    const periodStartDate = periodDoc.periodStartDate;
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const saleClients = await Client.find({
      saleDate: { $gte: sixtyDaysAgo },
      status: { $in: ["active", "partial"] },
    }).lean();
    console.log(
      `🔍 Loaded ${periodClients.length} period clients, ` +
        `${saleClients.length} sale clients (last 60d)`
    );

    // 3️⃣ Remove expired tokens
    let toReview = [];
    const { remaining: validPeriod, toReview: expPeriod } =
      deleteBadTokenClients(periodClients);
    const { remaining: validSales, toReview: expSales } =
      deleteBadTokenClients(saleClients);
    toReview.push(...expPeriod, ...expSales);
    console.log(
      `🚫 Expired tokens: ${expPeriod.length} period, ${expSales.length} sale`
    );

    // 4️⃣ Run external Logics validation
    const fresh = [...validPeriod, ...validSales].map((client) => {
      // parse your three possible dates
      const lastContact = client.lastContactDate
        ? new Date(client.lastContactDate)
        : null;
      const sale = client.saleDate ? new Date(client.saleDate) : null;
      const period = periodStartDate; // already a Date

      // collect only valid Dates
      const candidates = [lastContact, sale, period].filter(
        (d) => d instanceof Date && !isNaN(d)
      );

      // pick the max timestamp
      const sinceTs = Math.max(...candidates.map((d) => d.getTime()));
      client.sinceDate = new Date(sinceTs);

      return client;
    });
    const {
      verified,
      partial,
      toReview: flagged,
    } = await addVerifiedClientsAndReturnUpdatedLists(fresh);
    toReview.push(...flagged);
    console.log(
      `⚙️ Validation → Verified: ${verified.length}, Partial: ${partial.length}, Flagged: ${flagged.length}`
    );

    // 5️⃣ Split into period vs sale for scheduling
    const saleIds = new Set(validSales.map((c) => c._id.toString()));
    const verifiedPeriod = verified.filter(
      (c) => !saleIds.has(c._id.toString())
    );
    const verifiedSales = verified.filter((c) => saleIds.has(c._id.toString()));
    const partialPeriod = partial.filter((c) => !saleIds.has(c._id.toString()));
    const partialSales = partial.filter((c) => saleIds.has(c._id.toString()));

    const { emailQueue, textQueue, dailyPeriodContacts, dailyNewClients } =
      await assignContactMethodAndStagePiece(
        [...verifiedPeriod, ...partialPeriod],
        [...verifiedSales, ...partialSales]
      );
    console.log(
      `📬 Queues → Email: ${emailQueue.length}, Text: ${textQueue.length}`
    );
    console.log(
      `📑 Clients → Period: ${dailyPeriodContacts.length}, New: ${dailyNewClients.length}`
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
    console.log("💾 Queues saved to DailySchedule");

    // 7️⃣ Update each client’s DB record
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
            stagePieces: client.stagePieces || [],
          },
        }
      );
    }
    console.log(`🔄 Updated ${allClients.length} clients in DB`);

    // 8️⃣ Refresh the PeriodContacts list
    /*    if (periodDoc) {
      const updatedIDs = dailyPeriodContacts.map((c) => c._id.toString());
      periodDoc.createDateClientIDs = updatedIDs;
      await periodDoc.save();
      console.log(`🔁 PeriodContacts updated with ${updatedIDs.length} IDs`);
    }
*/
    // ✅ Final response
    return res.status(200).json({
      message: "Daily schedule built",
      emailQueue,
      textQueue,
      toReview,
    });
  } catch (err) {
    //console.error("❌ Error in buildDailySchedule:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

module.exports = {
  buildDailySchedule,
};
