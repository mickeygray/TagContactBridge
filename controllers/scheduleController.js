// controllers/scheduleController.js

const Client = require("../models/Client");
const PeriodContacts = require("../models/PeriodContacts");
const contactCampaignMap = require("../libraries/contactCampaignMap");
const rawSignature = require("../libraries/rawSignature");
const emailSubjects = require("../libraries/emailSubjects");
const textMessageLibrary = require("../libraries/textMessageLibrary");
const DailySchedule = require("../models/DailySchedule");
const {
  addVerifiedClientsAndReturnUpdatedLists,
} = require("../utils/newPeriodContactChecks");
const fs = require("fs");
const path = require("path");
const hbs = require("handlebars");
const sendEmail = require("../utils/sendEmail");
const sendTextMessage = require("../utils/sendTextMessage");

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
        // 1) One-off autoPOA override
        if (client.autoPOA) {
          console.log(`[processClientList] Auto-POA for ${client.caseNumber}`);
          client.contactType = "email";
          client.stagePiece = "POAEmail";
          client.stagesReceived = [
            ...new Set([...(client.stagesReceived || []), "poa"]),
          ];
          client.stagePieces = [
            ...new Set([...(client.stagePieces || []), "POAEmail1"]),
          ];
          delete client.autoPOA;
          return client;
        }

        // 2) Figure out which “stage” we’re in
        let stageKey;
        if (type === "createDate") {
          stageKey = periodDoc.createDateStage;
        } else {
          const sr = client.stagesReceived || [];
          stageKey = sr.length ? sr[sr.length - 1] : null;
        }
        console.log(
          `[processClientList] ${client.caseNumber} stage="${stageKey}"`
        );

        // 3) Grab the ordered sequence array
        const sequence = contactCampaignMap[type]?.[stageKey] || [];
        if (!sequence.length) {
          console.log(
            `[processClientList] No sequence found for stage="${stageKey}"`
          );
          return null;
        }

        // 4) Find the last index they’ve already had
        const had = client.stagePieces || [];
        const sentIndices = sequence
          .map((step, idx) => (had.includes(step.stagePiece) ? idx : -1))
          .filter((i) => i >= 0);
        const lastSent = sentIndices.length ? Math.max(...sentIndices) : -1;

        // 5) Next step is at lastSent+1
        const nextIdx = lastSent + 1;
        if (nextIdx >= sequence.length) {
          console.log(
            `[processClientList] ${client.caseNumber} has completed all ${stageKey} steps`
          );
          return null;
        }
        const piece = sequence[nextIdx];

        // 6) Dedupe same-day re-send (unless it’s poa)
        if (
          nextIdx === 0 && // if it’s the very first step
          had.includes(stageKey) && // and they’ve marked the stage done
          stageKey !== "poa"
        ) {
          console.log(
            `[processClientList] Skipping ${client.caseNumber} — already did stage "${stageKey}" today`
          );
          return null;
        }

        console.log(
          `[processClientList] Next for ${client.caseNumber}: ` +
            `contactType=${piece.contactType}, stagePiece="${piece.stagePiece}"`
        );

        // 7) Build updated record
        const updatedStages = [
          ...new Set([...(client.stagesReceived || []), stageKey]),
        ];
        return {
          ...client,
          contactType: piece.contactType,
          stagePiece: piece.stagePiece,
          lastContactDate: new Date(today),
          stagesReceived: updatedStages,
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

      // instrumented block
      try {
        console.log("⚙️  About to insert DailySchedule:", {
          date: today,
          emailQueue: [],
          textQueue: carryOver?.textQueue || [],
          pace: 15,
        });
        const newSchedule = await DailySchedule.create({
          date: today,
          emailQueue: [],
          textQueue: carryOver?.textQueue || [],
          pace: 15,
        });
        console.log("✅ Created new DailySchedule:", newSchedule);
      } catch (createErr) {
        console.error("❌ Error creating DailySchedule:", createErr);
        // rethrow so your outer catch picks it up and logs it
        throw createErr;
      }
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
      pace: 15,
    });
  } catch (err) {
    //console.error("❌ Error in buildDailySchedule:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

async function refreshDailySchedule(req, res, next) {
  try {
    // helper to get local YYYY‑MM‑DD
    const today = (() => {
      const now = new Date();
      const offset = now.getTimezoneOffset() * 60000;
      return new Date(now - offset).toISOString().split("T")[0];
    })();

    const date = req.query.date || today;

    const schedule = await DailySchedule.findOne({ date }).lean();
    if (!schedule) {
      return res.status(404).json({ message: `No schedule found for ${date}` });
    }

    return res.json({
      emailQueue: schedule.emailQueue,
      textQueue: schedule.textQueue,
    });
  } catch (err) {
    next(err);
  }
}

async function updateDailySchedule(req, res, next) {
  try {
    const { pace } = req.body;
    if (pace == null || typeof pace !== "number") {
      return res.status(400).json({ message: "Invalid or missing `pace`" });
    }

    // compute local YYYY‑MM‑DD
    const today = (() => {
      const now = new Date();
      const offset = now.getTimezoneOffset() * 60000;
      return new Date(now - offset).toISOString().split("T")[0];
    })();

    // find & update only the pace field
    const updated = await DailySchedule.findOneAndUpdate(
      { date: today },
      { pace },
      { new: true, select: "date pace" }
    ).lean();

    if (!updated) {
      return res
        .status(404)
        .json({ message: `No schedule found for ${today}` });
    }

    return res.json({
      pace: updated.pace,
    });
  } catch (err) {
    next(err);
  }
}

// controllers/scheduleController.js
async function sendDailyText(req, res, next) {
  try {
    const date = req.body.date || new Date().toISOString().split("T")[0];
    const schedule = await DailySchedule.findOne({ date }).lean();
    if (!schedule) {
      return res.status(404).json({ message: `No schedule for ${date}` });
    }

    // 1️⃣ pick pace
    const pace =
      typeof schedule.pace === "number"
        ? schedule.pace
        : schedule.textQueue.length;
    const toSend = schedule.textQueue.slice(0, pace);

    const results = [];
    for (const recip of toSend) {
      const { cell, name, caseNumber, domain, stagePiece } = recip;

      // — validation
      if (!cell) {
        results.push({
          caseNumber,
          domain,
          stagePiece,
          error: "Missing phone",
        });
        continue;
      }
      if (!["TAG", "WYNN", "AMITY"].includes(domain)) {
        results.push({
          caseNumber,
          domain,
          stagePiece,
          error: `Invalid domain "${domain}"`,
        });
        continue;
      }

      // — first name only
      const firstName = (name || "").split(" ")[0];

      // — template lookup
      const libEntry = textMessageLibrary[stagePiece];
      if (!libEntry) {
        results.push({
          caseNumber,
          domain,
          stagePiece,
          error: `No text template for "${stagePiece}"`,
        });
        continue;
      }

      // — interpolate
      const trackingNumber = libEntry[domain];
      const message = libEntry.message
        .replace(/\{name\}/g, firstName)
        .replace(/\{number\}/g, trackingNumber);

      // — send
      try {
        await sendTextMessage({ phoneNumber: cell, trackingNumber, message });
        results.push({ caseNumber, domain, stagePiece, cell, status: "sent" });
      } catch (err) {
        results.push({
          caseNumber,
          domain,
          stagePiece,
          cell,
          error: err.message || "Send failed",
        });
      }
    }

    // 2️⃣ update clients for those we actually sent
    const FINAL_STAGE_PIECES = {
      "Tax Deadline Text 12": "taxDeadline",
      "Update433a Text 9": "update433a",
      "PA Text 9": "penaltyAbatement",
      "TO Text 9": "taxOrganizer",
      "f433a Text 9": "f433a", // also set createDate
      "Prac Text 9": "prac",
      POAEmail: "poa",
    };
    const REUSABLE_TEXT3 = new Set([
      "Doc Submission Review Text 3",
      "IRS Doc Review Text 3",
      "IRS Standards Review Text 3",
      "Client Doc Review Text 3",
    ]);

    const succeeded = results.filter((r) => r.status === "sent");
    const succeededCases = succeeded.map((r) => r.caseNumber);

    await Promise.all(
      succeeded.map((r) => {
        const upd = { $set: { lastContactDate: new Date() } };

        if (REUSABLE_TEXT3.has(r.stagePiece)) {
          // cycle Text 1 & 2 out, add Text 3 & its stage
          const prefix = r.stagePiece.replace(/ Text 3$/, "");
          upd.$pull = { stagePieces: [`${prefix} Text 1`, `${prefix} Text 2`] };
          upd.$addToSet = {
            stagePieces: r.stagePiece,
            stagesReceived: FINAL_STAGE_PIECES[r.stagePiece],
          };
        } else if (FINAL_STAGE_PIECES[r.stagePiece]) {
          // final piece → record piece + mark stage done
          upd.$addToSet = {
            stagePieces: r.stagePiece,
            stagesReceived: FINAL_STAGE_PIECES[r.stagePiece],
          };
          // if this is the f433a Text 9 piece, also set createDate = today
          if (r.stagePiece === "f433a Text 9") {
            upd.$set.createDate = new Date();
          }
        }
        // else: only updating lastContactDate

        return Client.findOneAndUpdate(
          { caseNumber: r.caseNumber, domain: r.domain },
          upd
        ).exec();
      })
    );

    // 3️⃣ remove just the sent ones from today’s queue
    if (succeededCases.length) {
      await DailySchedule.updateOne(
        { date },
        { $pull: { textQueue: { caseNumber: { $in: succeededCases } } } }
      );
    }

    // 4️⃣ respond
    res.json({ results });
  } catch (err) {
    next(err);
  }
}

async function sendDailyEmail(req, res, next) {
  try {
    const date = req.body.date || new Date().toISOString().split("T")[0];
    console.log(`→ sendDailyEmail called for date ${date}`);

    const schedule = await DailySchedule.findOne({ date }).lean();
    if (!schedule) {
      console.warn(`‼️ No schedule found for ${date}`);
      return res.status(404).json({ message: `No schedule for ${date}` });
    }
    console.log(
      `✅ Loaded schedule; ${schedule.emailQueue.length} emails to send.`
    );

    const DOMAINS = ["TAG", "WYNN", "AMITY"];
    const domainLookup = DOMAINS.reduce((acc, d) => {
      acc[d] = {
        calendarScheduleUrl: process.env[`${d}_CALENDAR_SCHEDULE_URL`] || "",
        url: process.env[`${d}_URL`] || "",
        clientContactPhone: process.env[`${d}_CLIENT_CONTACT_PHONE`] || "",
      };
      return acc;
    }, {});

    const results = await Promise.allSettled(
      schedule.emailQueue.map(async (recip, idx) => {
        console.log(`---\n[${idx + 1}] processing recipient:`, recip);
        const { email, name, caseNumber, domain, stagePiece } = recip;

        if (!email) {
          console.error(`❌ Missing email for case ${caseNumber}`);
          throw new Error("Missing recipient email");
        }

        if (!domainLookup[domain]) {
          console.error(`❌ Invalid domain "${domain}" for case ${caseNumber}`);
          throw new Error(`Invalid domain "${domain}"`);
        }

        // 1) build your vars
        const vars = domainLookup[domain];
        console.log(`   signatureVars for ${domain}:`, vars);

        // 2) render signature
        const signatureTpl = rawSignature; // or however you load per-domain
        if (!signatureTpl) {
          console.error(`❌ No signature template for domain "${domain}"`);
          throw new Error(`No signature template for: "${domain}"`);
        }
        const signatureHtml = signatureTpl({
          schedulerUrl: vars.calendarScheduleUrl,
          phone: vars.clientContactPhone,
          url: vars.url,
          processingEmail: process.env[`${domain}_PROCESSING_EMAIL`] || "",
          logoSrc: process.env[`${domain}_LOGO_URL`] || "",
          contactName: process.env[`${domain}_CONTACT_NAME`] || "",
        });
        console.log(`   signatureHtml length: ${signatureHtml.length}`);

        // 3) compile main body
        const bodyPath = path.join(
          __dirname,
          "../Templates/clientcontactemails",
          `${stagePiece}.hbs`
        );
        console.log(`   loading template from ${bodyPath}`);
        if (!fs.existsSync(bodyPath)) {
          console.error(`❌ Template not found at ${bodyPath}`);
          throw new Error("Template not found");
        }
        const bodySource = fs.readFileSync(bodyPath, "utf8");
        console.log(`   template source length: ${bodySource.length}`);
        const bodyTpl = hbs.compile(bodySource);
        const html = bodyTpl({
          name,
          phone: vars.clientContactPhone,
          signature: signatureHtml,
        });

        // 4) attachments
        const domainKey = domain.toLowerCase();
        const attsDir = path.join(
          __dirname,
          "../Templates/attachments",
          stagePiece,
          domainKey
        );

        let atts = [];
        if (fs.existsSync(attsDir) && fs.statSync(attsDir).isDirectory()) {
          // grab everything in that folder
          const files = fs.readdirSync(attsDir);
          for (const filename of files) {
            const fullPath = path.join(attsDir, filename);
            // you could optionally filter by extension here
            atts.push({ filename, path: fullPath });
          }
        } else {
          console.log(
            `   no attachments folder for ${stagePiece}/${domainKey}`
          );
        }

        console.log(
          `   attachments for ${stagePiece}/${domainKey}:`,
          atts.map((a) => a.filename)
        );

        // 5) subject
        const subject =
          emailSubjects[stagePiece]?.subject || `Update from ${domain}`;
        console.log(`   subject: "${subject}"`);

        // 6) actually send
        await sendEmail({
          to: email,
          subject,
          html,
          domain,
          attachments: atts,
        });
        console.log(`   ✅ Sent to ${email}`);
        return { caseNumber, email, stagePiece, domain, status: "fulfilled" };
      })
    );

    // after all are settled
    console.log("=== sendDailyEmail results ===");
    const succeeded = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value);

    // 2) Update each Client by caseNumber+domain
    await Promise.all(
      succeeded.map((r) => {
        const filter = { caseNumber: r.caseNumber, domain: r.domain };

        // always add the actual piece they just got
        const addToSet = { stagePieces: r.stagePiece };

        // if it's the POA email, also mark the "poa" stage done
        if (r.stagePiece === "POAEmail") {
          addToSet.stagesReceived = "poa";
        }

        return Client.findOneAndUpdate(filter, { $addToSet: addToSet }).exec();
      })
    );

    // 3) Remove those exact entries from today’s schedule
    if (succeeded.length) {
      // build an $or of { caseNumber, domain } pairs
      const pullCriteria = succeeded.map((r) => ({
        caseNumber: r.caseNumber,
        domain: r.domain,
      }));

      await DailySchedule.updateOne(
        { date },
        { $pull: { emailQueue: { $or: pullCriteria } } }
      );
    }
    // 4) log & respond
    console.log(
      `Sent & recorded stagePieces for ${succeeded.length} clients. Removed from schedule:`,
      succeeded
    );

    return res.json({ results });
  } catch (err) {
    console.error("💥 sendDailyEmail caught:", err);
    next(err);
  }
}

module.exports = {
  buildDailySchedule,
  refreshDailySchedule,
  updateDailySchedule,
  sendDailyEmail,
  sendDailyText,
};
