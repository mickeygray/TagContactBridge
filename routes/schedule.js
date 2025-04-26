// Express setup assumed
const express = require("express");
const router = express.Router();
const Client = require("../models/Client");
const sendEmail = require("../utils/sendEmail");
const cron = require("node-cron");
const crypto = require("crypto");
const hbs = require("handlebars");
const fs = require("fs");
const path = require("path");
const contactCampaignMap = require("../utils/contactCampaignMap");
const PeriodContacts = require("../models/PeriodContacts");
const DailySchedule = require("../models/DailySchedule");
const {
  authMiddleware,
  requireAdmin,
  ensureOnline,
} = require("../middleware/authMiddleware");

// @route   POST /api/scheduledmessages
// @desc    Add new scheduled client

let reviewList = {};
const results = [];

// @route   POST /api/scheduledmessages/send
// @desc    Send email to client using domain-specific template

const fetchInvoices = async (caseNumber, domain = "TAG") => {
  const configMap = {
    TAG: {
      baseUrl: process.env.TAG_LOGICS_API_URL,
      apiKey: process.env.TAG_LOGICS_API_KEY,
    },
    WYNN: {
      baseUrl: process.env.WYNN_LOGICS_API_URL,
      apiKey: process.env.WYNN_LOGICS_API_KEY,
    },
    AMITY: {
      baseUrl: process.env.AMITY_LOGICS_API_URL,
      apiKey: process.env.AMITY_LOGICS_API_KEY,
    },
  };

  const config = configMap[domain] || configMap.TAG;
  const endpoint = "billing/caseinvoice";

  try {
    const response = await axios.get(`${config.baseUrl}${endpoint}`, {
      params: {
        apikey: config.apiKey,
        CaseID: parseInt(caseNumber),
      },
    });

    const data = JSON.parse(response.data.data || "[]");
    return data;
  } catch (err) {
    console.error(
      `❌ Error fetching invoices for ${caseNumber} [${domain}]:`,
      err.message
    );
    return [];
  }
};

const fetchPastDueAmount = async (caseNumber, domain) => {
  const configMap = {
    TAG: {
      baseUrl: process.env.TAG_LOGICS_API_URL,
      apiKey: process.env.TAG_LOGICS_API_KEY,
    },
    WYNN: {
      baseUrl: process.env.WYNN_LOGICS_API_URL,
      apiKey: process.env.WYNN_LOGICS_API_KEY,
    },
    AMITY: {
      baseUrl: process.env.AMITY_LOGICS_API_URL,
      apiKey: process.env.AMITY_LOGICS_API_KEY,
    },
  };

  const config = configMap[domain] || configMap.TAG;
  const endpoint = "billing/casebillingsummary";

  try {
    const response = await axios.get(`${config.baseUrl}${endpoint}`, {
      params: {
        apikey: config.apiKey,
        CaseID: parseInt(caseNumber),
      },
    });

    const data = JSON.parse(response.data.data || "{}");
    return parseFloat(data.PastDue || "0");
  } catch (error) {
    console.error(
      `❌ Error fetching PastDue for case #${caseNumber}:`,
      error.message
    );
    return 0;
  }
};
const fetchActivities = async (caseNumber, domain = "TAG") => {
  const configMap = {
    TAG: {
      baseUrl: process.env.TAG_LOGICS_API_URL,
      apiKey: process.env.TAG_LOGICS_API_KEY,
    },
    WYNN: {
      baseUrl: process.env.WYNN_LOGICS_API_URL,
      apiKey: process.env.WYNN_LOGICS_API_KEY,
    },
    AMITY: {
      baseUrl: process.env.AMITY_LOGICS_API_URL,
      apiKey: process.env.AMITY_LOGICS_API_KEY,
    },
  };

  const config = configMap[domain] || configMap.TAG;
  const endpoint = "cases/activity";

  try {
    const response = await axios.get(`${config.baseUrl}${endpoint}`, {
      params: {
        apikey: config.apiKey,
        CaseID: parseInt(caseNumber),
      },
    });

    return Array.isArray(response.data) ? response.data : [];
  } catch (err) {
    console.error(
      `❌ Error fetching activities for case #${caseNumber}:`,
      err.message
    );
    return [];
  }
};
const resetDailyScheduleAndReviewList = async () => {
  const today = new Date().toISOString().split("T")[0];

  reviewList = {
    textQueue: [],
    emailQueue: [],
    delinquentQueue: [],
    pastDueQueue: [],
    inReview: [],
  };

  const existingToday = await DailySchedule.findOne({ date: today });

  if (!existingToday) {
    // Pull forward yesterday's unprocessed textQueue
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayString = yesterday.toISOString().split("T")[0];

    const yesterdaySchedule = await DailySchedule.findOne({
      date: yesterdayString,
    });
    const carryOverTextQueue = yesterdaySchedule?.textQueue || [];

    await DailySchedule.create({
      date: today,
      emailQueue: [], // Will be filled later
      textQueue: carryOverTextQueue, // Carried over
      pace: 15,
    });

    console.log(
      `📅 Created new DailySchedule for ${today} with carryover: ${carryOverTextQueue.length} texts`
    );
  } else {
    console.log(`🔁 DailySchedule for ${today} already exists`);
  }
};

const deleteBadTokenClients = (
  dailyPeriodContacts,
  dailyNewClients,
  toReview
) => {
  const today = new Date().toISOString().split("T")[0];

  const updatedPeriodContacts = dailyPeriodContacts.filter((client) => {
    const isExpired = client.tokenExpiresAt && client.tokenExpiresAt <= today;
    if (isExpired) toReview.push(client);
    return !isExpired;
  });

  const updatedNewClients = dailyNewClients.filter((client) => {
    const isExpired = client.tokenExpiresAt && client.tokenExpiresAt <= today;
    if (isExpired) toReview.push(client);
    return !isExpired;
  });

  console.log(
    `🧹 Flagged ${toReview.length} clients as inReview (token expired)`
  );

  return {
    dailyPeriodContacts: updatedPeriodContacts,
    dailyNewClients: updatedNewClients,
    toReview,
  };
};

const getNewSaleDateClients = async () => {
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const today = new Date().toISOString().split("T")[0];

  const newSaleClients = await Client.find({
    saleDate: { $gte: sixtyDaysAgo },
    status: { $in: ["active", "partial"] },
  });

  return newSaleClients
    .filter((client) => !!client.caseNumber)
    .map((client) => {
      const todayDate = new Date().toISOString().split("T")[0];
      const secondPaymentDate = client.secondPaymentDate
        ? new Date(client.secondPaymentDate).toISOString().split("T")[0]
        : null;

      const updatedClient = {
        _id: client._id.toString(),
        caseNumber: client.caseNumber,
        name: client.name,
        cell: client.cell,
        email: client.email,
        stagesReceived: client.stagesReceived || [],
        contactedThisPeriod: client.contactedThisPeriod,
        status: client.status,
        domain: client.domain,
        invoiceCount: client.invoiceCount,
        lastInvoiceAmount: client.lastInvoiceAmount,
        delinquentAmount: client.delinquentAmount,
        delinquentDate: client.delinquentDate,
        token: client.token,
        tokenExpiresAt: client.tokenExpiresAt,
        saleDate: client.saleDate,
        lastContactDate: client.lastContactDate,
        secondPaymentDate: client.secondPaymentDate,
        stage: client.stage,
      };

      // Auto advance to POA stage on secondPaymentDate
      if (
        secondPaymentDate &&
        secondPaymentDate === todayDate &&
        client.stage === "prac" &&
        !updatedClient.stagesReceived.includes("poa")
      ) {
        updatedClient.stage = "poa";
        updatedClient.stagesReceived.push("poa");
        updatedClient.contactedThisPeriod = false;
      }

      return updatedClient;
    });
};

const getPeriodContacts = async () => {
  const periodContacts = await PeriodContacts.findOne();
  if (!periodContacts) {
    console.warn("⚠️ No PeriodContacts document found.");
    return [];
  }

  const clients = await Client.find({
    _id: { $in: periodContacts.createDateClientIDs },
  });

  const today = new Date();

  return clients
    .filter((c) => !!c.caseNumber)
    .map((client) => ({
      _id: client._id,
      caseNumber: client.caseNumber,
      name: client.name,
      email: client.email,
      cell: client.cell,
      domain: client.domain || "TAG",
      status: client.status,
      stage: client.stage,
      stagesReceived: client.stagesReceived || [],
      contactedThisPeriod: client.contactedThisPeriod ?? true,
      lastContactDate: client.lastContactDate || client.createDate || null,
      periodStartDate: periodContacts.periodStartDate,
      invoiceCount: client.invoiceCount,
      token: client.token,
      tokenExpiresAt: client.tokenExpiresAt,
      lastInvoiceAmount: client.lastInvoiceAmount,
      delinquentAmount: client.delinquentAmount || 0,
      delinquentDate: client.delinquentDate || null,
    }));
};

const checkInvoiceMismatchAndFlag = async (
  dailyPeriodContacts,
  dailyNewClients,
  toReview
) => {
  const updatedPeriodContacts = [];
  const updatedNewClients = [];

  const checkClient = async (client, isNewClient = false) => {
    try {
      const invoices = await fetchInvoices(client.caseNumber, client.domain);
      const currentCount = invoices.length;
      const lastAmount = invoices.at(-1)?.Amount || 0;

      const mismatch = isNewClient
        ? client.lastInvoiceAmount !== lastAmount || currentCount > 1
        : client.invoiceCount !== currentCount ||
          client.lastInvoiceAmount !== lastAmount;

      if (mismatch) {
        toReview.push(client); // Mark for inReview batch
      } else {
        if (isNewClient) updatedNewClients.push(client);
        else updatedPeriodContacts.push(client);
      }
    } catch (err) {
      console.error(
        `❌ Error checking invoices for ${client.caseNumber}:`,
        err.message
      );
    }
  };

  await Promise.all([
    ...dailyPeriodContacts.map((client) => checkClient(client, false)),
    ...dailyNewClients.map((client) => checkClient(client, true)),
  ]);

  console.log(
    `🧾 Invoice check complete. Period: ${updatedPeriodContacts.length}, New: ${updatedNewClients.length}, Flagged: ${toReview.length}`
  );

  return {
    dailyPeriodContacts: updatedPeriodContacts,
    dailyNewClients: updatedNewClients,
    toReview,
  };
};
const flagAndUpdateDelinquentClients = async (
  dailyPeriodContacts,
  dailyNewClients,
  toReview
) => {
  const today = new Date();

  let updatedPeriodContacts = [...dailyPeriodContacts];
  let updatedNewClients = [...dailyNewClients];

  const processClient = async (client, isSaleClient = false) => {
    try {
      const pastDue = await fetchPastDueAmount(
        client.caseNumber,
        client.domain
      );

      if (pastDue > 0) {
        // Set review flags on the client
        client.status = "inReview";
        client.delinquentDate = today;
        client.delinquentAmount = pastDue;

        toReview.push(client);

        // Remove from respective working array
        if (isSaleClient) {
          updatedNewClients = updatedNewClients.filter(
            (c) => c.caseNumber !== client.caseNumber
          );
        } else {
          updatedPeriodContacts = updatedPeriodContacts.filter(
            (c) => c.caseNumber !== client.caseNumber
          );
        }
      }
    } catch (err) {
      console.error(`❌ Error checking PastDue for ${client.caseNumber}:`, err);
    }
  };

  await Promise.all([
    ...dailyPeriodContacts.map((client) => processClient(client, false)),
    ...dailyNewClients.map((client) => processClient(client, true)),
  ]);

  return {
    dailyPeriodContacts: updatedPeriodContacts,
    dailyNewClients: updatedNewClients,
    toReview,
  };
};

const reviewClientContactAndFlag = async (
  dailyPeriodContacts, // [{...}]
  dailyNewClients, // [{...}]
  toReview // Global mutable array
) => {
  const approvedSaleAgents = [
    "Eva Gray",
    "Phil Olson",
    "Bruce Allen",
    "Eli Hayes",
    "Kassy Burton",
    "Jonathan Haro",
    "Dani Pearson",
    "Jake Wallace",
  ];

  const approvedCreateAgents = [
    "Kassy Burton",
    "Jonathan Haro",
    "Dani Pearson",
    "Jake Wallace",
    "Eli Hayes",
  ];

  const keywords = ["SWC", "A/S", "CCI", "spoke", "call", "message"];
  const statusChangeTrigger = "status changed";

  const updatedPeriodContacts = [...dailyPeriodContacts];
  const updatedNewClients = [...dailyNewClients];

  const processClient = async (client) => {
    try {
      const activities = await fetchActivities(
        client.caseNumber,
        client.domain
      );
      if (!Array.isArray(activities)) return true;

      const lastDate = new Date(client.lastContactDate);

      const relevant = activities.some((act) => {
        const created = new Date(act.CreatedDate);
        const createdBy = act.CreatedBy || "";
        const fullText = `${act.Subject || ""} ${
          act.Comment || ""
        }`.toLowerCase();

        const isApproved = client.isSaleClient
          ? approvedSaleAgents.includes(createdBy)
          : approvedCreateAgents.includes(createdBy);

        const isRecent = created > lastDate;
        const hasKeyword = keywords.some((kw) =>
          fullText.includes(kw.toLowerCase())
        );
        const statusChanged = fullText.includes(statusChangeTrigger);

        // Match if relevant note from approved person, OR status change (anyone)
        return (
          (isApproved && isRecent && hasKeyword) || (isRecent && statusChanged)
        );
      });

      if (relevant) {
        toReview.push(client);
        return false; // Remove from active list
      }

      return true;
    } catch (err) {
      console.error(
        `❌ Error reviewing contact for ${client.caseNumber}:`,
        err.message
      );
      return true; // Keep in list if error occurs
    }
  };

  const processList = async (list, isSaleClient) => {
    const result = [];
    for (const client of list) {
      client.isSaleClient = isSaleClient;
      const keep = await processClient(client);
      if (keep) result.push(client);
    }
    return result;
  };

  return {
    dailyPeriodContacts: await processList(updatedPeriodContacts, false),
    dailyNewClients: await processList(updatedNewClients, true),
    toReview,
  };
};

const assignContactMethodAndStagePiece = async (
  dailyPeriodContacts, // full client objects
  dailyNewClients // full client objects
) => {
  const today = new Date();

  // 📥 Pull periodStartDate from the PeriodContacts model
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

        // ⏱️ Determine base date
        let baseDate;
        if (type === "createDate") {
          if (!periodStartDate) return null; // Skip if missing
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

        // ⛔ Avoid sending duplicate stage unless it's POA
        if (
          daysOut === 0 &&
          stagesReceived.includes(stage) &&
          stage !== "poa"
        ) {
          return null;
        }

        const updatedStagesReceived = [...new Set([...stagesReceived, stage])];

        return {
          ...client,
          contactType: piece.contactType,
          stagePiece: piece.stagePiece,
          daysOut,
          lastContactDate: today,
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

const finalizeClientUpdates = async (
  dailyPeriodContacts,
  dailyNewClients,
  inReview
) => {
  try {
    const allClients = [
      ...dailyPeriodContacts,
      ...dailyNewClients,
      ...inReview,
    ];
    const periodContactIDs = new Set();
    // ...

    for (const client of allClients) {
      const updateFields = {
        // Primary contact + engagement tracking
        lastContactDate: client.lastContactDate || new Date(),
        contactedThisPeriod: client.contactedThisPeriod ?? false,
        activeInStage: client.activeInStage ?? false,
        stagesReceived: client.stagesReceived || [],
        status: client.status || "active",

        // Campaign-specific metadata
        stage: client.stage,
        saleDate: client.saleDate,
        secondPaymentDate: client.secondPaymentDate,

        // Invoice tracking
        invoiceCount: client.invoiceCount,
        lastInvoiceAmount: client.lastInvoiceAmount,

        // Delinquency tracking
        delinquentAmount: client.delinquentAmount || null,
        delinquentDate: client.delinquentDate || null,

        // Token cleanup
        token: client.token || null,
        tokenExpiresAt: client.tokenExpiresAt || null,

        // Domain for campaign delivery
        domain: client.domain,
      };

      // Optional campaign stage info
      if (client.stagePiece) updateFields.stagePiece = client.stagePiece;
      if (client.contactType) updateFields.contactType = client.contactType;
      if (client.daysOut !== undefined) updateFields.daysOut = client.daysOut;

      await Client.updateOne(
        { caseNumber: client.caseNumber },
        { $set: updateFields }
      );

      // Rebuild PeriodContacts createDate list
      if (dailyPeriodContacts.some((c) => c.caseNumber === client.caseNumber)) {
        const found = await Client.findOne({ caseNumber: client.caseNumber });
        periodContactIDs.add(found._id.toString());
        // ...
        periodDoc.createDateClientIDs = Array.from(periodContactIDs);
      }
    }

    // Update PeriodContacts document
    const periodDoc = await PeriodContacts.findOne();
    if (periodDoc) {
      periodDoc.createDateClientIDs = periodContactIDs;
      await periodDoc.save();
      console.log(
        `📁 PeriodContacts updated with ${periodContactIDs.length} IDs`
      );
    }
  } catch (err) {
    console.error("❌ Error in finalizeClientUpdates:", err.message);
  }
};

const refreshReviewList = async () => {
  console.log("🌅 Starting 7AM Marketing Pipeline...");

  try {
    // 1️⃣ Reset state
    await resetDailyScheduleAndReviewList();

    // 2️⃣ Expand daily working lists
    let dailyNewClients = await getNewSaleDateClients();
    let dailyPeriodContacts = await getPeriodContacts();
    let toReview = [];

    // 3️⃣ Filter 1: Remove token-expired clients
    ({ dailyPeriodContacts, dailyNewClients, toReview } =
      await deleteBadTokenClients(
        dailyPeriodContacts,
        dailyNewClients,
        toReview
      ));

    // 4️⃣ Filter 2: Invoice mismatch
    ({ dailyPeriodContacts, dailyNewClients, toReview } =
      await checkInvoiceMismatchAndFlag(
        dailyPeriodContacts,
        dailyNewClients,
        toReview
      ));

    // 5️⃣ Filter 3: Delinquent client handling
    ({ dailyPeriodContacts, dailyNewClients, toReview } =
      await flagAndUpdateDelinquentClients(
        dailyPeriodContacts,
        dailyNewClients,
        toReview
      ));

    // 6️⃣ Filter 4: SWC Activity flag
    ({ dailyPeriodContacts, dailyNewClients, toReview } =
      await reviewClientContactAndFlag(
        dailyPeriodContacts,
        dailyNewClients,
        toReview
      ));

    // Push flagged to review

    // 7️⃣ Assign StagePiece + Contact Type (last filter)
    const {
      emailQueue,
      textQueue,
      dailyPeriodContacts: finalPeriod,
      dailyNewClients: finalNew,
    } = await assignContactMethodAndStagePiece(
      dailyPeriodContacts,
      dailyNewClients
    );
    const today = new Date().toISOString().split("T")[0];

    // 💾 Create today's schedule (if not done already earlier)
    const todaySchedule = await DailySchedule.findOne({ date: today });
    const existingEmails = new Set(
      todaySchedule?.emailQueue.map((e) => e.caseNumber)
    );
    const existingTexts = new Set(
      todaySchedule?.textQueue.map((t) => t.caseNumber)
    );

    const filteredEmailQueue = emailQueue.filter(
      (e) => !existingEmails.has(e.caseNumber)
    );
    const filteredTextQueue = textQueue.filter(
      (t) => !existingTexts.has(t.caseNumber)
    );

    await DailySchedule.findOneAndUpdate(
      { date: today },
      {
        $push: {
          emailQueue: { $each: filteredEmailQueue },
          textQueue: { $each: filteredTextQueue },
        },
      },
      { upsert: true }
    );

    // 8️⃣ Final DB update
    await finalizeClientUpdates(finalPeriod, finalNew, toReview);

    reviewList = {
      emailQueue,
      textQueue,
      toReview,
    };

    return reviewList;
  } catch (err) {
    console.error("❌ Error running 7AM refreshReviewList:", err.message);
    return {
      emailQueue: [],
      textQueue: [],
      toReview: [],
    };
  }
};
const runEmailDrop = async () => {
  const today = new Date().toISOString().split("T")[0];
  const schedule = await DailySchedule.findOne({ date: today });
  if (!schedule || schedule.emailQueue.length === 0) {
    console.log(`🕘 [${today}] No emails to send.`);
    return;
  }

  const results = [];

  for (const item of schedule.emailQueue) {
    const { email, name, stagePiece, token, domain } = item;
    try {
      // Load the template matching this stagePiece
      const tplPath = path.join(
        __dirname,
        "../Templates/Client Contact Emails",
        `${stagePiece}.hbs`
      );
      const source = fs.readFileSync(tplPath, "utf8");
      const compiled = hbs.compile(source);

      // Inject variables (name, tokenURL) and append signature
      const tokenURL = `https://${
        domain === "WYNN"
          ? "wynntaxsolutions.com"
          : domain === "AMITY"
          ? "amitytaxgroup.com"
          : "taxadvocategroup.com"
      }/schedule-my-call/${token}`;
      const htmlBody = compiled({ name, tokenURL });
      const signature = emailSignatures[domain] || emailSignatures.TAG;
      const html = htmlBody + signature;

      // Send it
      await sendEmail({
        to: email,
        subject: stagePiece,
        html,
        domain,
      });

      results.push({ email, status: "✅ Sent" });
    } catch (err) {
      console.error(`❌ Failed to send ${stagePiece} to ${email}`, err);
      results.push({ email, status: "❌ Failed" });
    }
  }

  // Clear out today's emailQueue so we don't resend
  await DailySchedule.findOneAndUpdate({ date: today }, { emailQueue: [] });

  console.log(`📧 [${today}] 9 AM email drop results:`, results);
};

const runTextDrop = async () => {
  const today = new Date().toISOString().split("T")[0];
  const schedule = await DailySchedule.findOne({ date: today });
  const domainURLMap = {
    WYNN: "https://www.wynntaxsolutions.com/schedule-my-call/",
    TAG: "https://www.taxadvocategroup.com/schedule-my-call/",
    AMITY: "https://www.amitytaxgroup.com/schedule-my-call/",
  };
  if (!schedule) {
    console.log(`🕙 [${today}] No DailySchedule found.`);
    return;
  }

  const { textQueue = [], pace = 15 } = schedule;
  if (textQueue.length === 0) {
    console.log(`📭 [${today}] textQueue empty — nothing to send.`);
    return;
  }

  // Take the first `pace` entries and leave the rest
  const toSend = textQueue.slice(0, pace);
  const remaining = textQueue.slice(pace);

  // Build and send all SMS in parallel
  const results = await Promise.all(
    toSend.map((item) => {
      const tpl = textMessageLibrary[item.stagePiece];
      if (!tpl) {
        return Promise.resolve({
          phoneNumber: item.cell,
          status: `❌ No template for ${item.stagePiece}`,
        });
      }
      const trackingNumber = tpl[item.domain] || tpl.TAG;
      const rawMessage = tpl.message;
      const tokenURL = `${domainURLMap[item.domain] || domainURLMap.TAG}${
        item.token
      }`;
      const message = rawMessage
        .replace("{name}", item.name)
        .replace("{tokenURL}", tokenURL);

      return sendTextMessage({
        phoneNumber: item.cell,
        trackingNumber,
        message,
      });
    })
  );

  // Persist the trimmed queue
  await DailySchedule.findOneAndUpdate(
    { date: today },
    { textQueue: remaining }
  );

  console.log(`📲 [${today}] Sent ${results.length} texts:`, results);
};

// ⏰ Run daily at 7 AM
cron.schedule("0 3 * * 1-5", refreshReviewList);
cron.schedule("0,30 10-16 * * 1-5", runTextDrop);
cron.schedule("0 9 * * 1-5", runEmailDrop);
// GET /api/scheduledmessages/review
router.get("/review-today", (req, res) => {
  res.json(reviewList);
});
router.get("/email-today", (req, res) => {
  res.json(results);
});
module.exports = router;
