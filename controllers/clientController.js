// controllers/clientController.js
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const hbs = require("handlebars");
const Client = require("../models/Client");
const DailySchedule = require("../models/DailySchedule"); // your daily schedule model
const PeriodContacts = require("../models/PeriodContacts");
const interactions = require("../utils/singleClientInteractions");
const { addAndVerifySingleClient } = require("../utils/newClientEntryChecks");
const sigTpl = require("../libraries/rawSignature");
const emailSubjects = require("../libraries/emailSubjects"); // 🆕 import
const contactCampaignMap = require("../libraries/contactCampaignMap");
const sendEmail = require("../utils/sendEmail");
const upload = multer();

/**
 * MONGO CALLS
 * Look up and return the Mongoose Client document for the given “client”
 * object (which may have either _id or caseNumber+domain).
 *
 * @param {Object} clientLike
 * @param {string} [clientLike._id]         – Mongo _id
 * @param {string} [clientLike.caseNumber]  – your case number
 * @param {string} [clientLike.domain]      – one of TAG|WYNN|AMITY
 * @returns {Promise<import("../models/Client")?>}  the found Client doc or null
 */

async function purgeFromScheduleAndPeriod(clientId, caseNumber) {
  // 1) From every DailySchedule document, pull out any contact with this caseNumber
  await DailySchedule.updateMany(
    {},
    {
      $pull: {
        emailQueue: { caseNumber },
        textQueue: { caseNumber },
      },
    }
  );

  // 2) From every PeriodContacts document, pull out this clientId string
  await PeriodContacts.updateOne(
    { createDateClientIDs: clientId.toString() },
    {
      $pull: { createDateClientIDs: clientId.toString() },
      $addToSet: { contactedClientIDs: clientId.toString() },
    }
  );
}

async function getClientByCaseAndDomain(clientLike) {
  if (!clientLike) return null;

  // 1️⃣ If we already have a Mongo _id, prefer that
  if (clientLike._id) {
    const doc = await Client.findById(clientLike._id);
    if (doc) return doc;
  }

  // 2️⃣ Otherwise we need both caseNumber + domain
  const { caseNumber, domain } = clientLike;
  if (caseNumber && domain) {
    return await Client.findOne({ caseNumber, domain });
  }

  // 3️⃣ Not enough info
  return null;
}

async function getTodaySchedule() {
  const today = new Date().toISOString().split("T")[0];
  return DailySchedule.findOne({ date: today });
}

async function getLatestPeriod() {
  try {
    const latest = await PeriodContacts.findOne()
      .sort({ periodStartDate: -1 })
      .lean();
    return latest;
  } catch (err) {
    console.error("❌ Failed to get latest period:", err);
    return null;
  }
}
/**
 * POST /api/clients/uploadDocument
 */
async function uploadDocumentHandler(req, res, next) {
  try {
    const {
      caseNumber,
      comment = "Uploaded from mailer list",
      fileCategoryID = 1,
    } = req.body;
    if (!req.file || !caseNumber) {
      return res.status(400).json({ error: "File and CaseID are required." });
    }

    const data = await interactions.uploadDocument({
      caseNumber,
      comment,
      fileCategoryID,
      fileBuffer: req.file.buffer,
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/clients/enrichClient
 */
async function enrichClientHandler(req, res, next) {
  try {
    const client = req.body;
    const { domain, caseNumber } = client;
    if (!caseNumber) {
      return res.status(400).json({ message: "Missing caseNumber" });
    }

    const enrichedData = await interactions.enrichClient(domain, caseNumber);

    console.log(Object.keys(enrichedData), "enrichedData");
    res.json({
      status: "completed",
      enrichedClient: { ...client, ...enrichedData },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/clients/zeroInvoice
 */
async function zeroInvoiceHandler(req, res, next) {
  try {
    const { domain = "TAG", caseNumber } = req.body;
    if (!caseNumber) {
      return res.status(400).json({ message: "Missing caseNumber" });
    }
    const data = await interactions.zeroInvoice(domain, caseNumber);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/clients/createTask
 */
async function createTaskHandler(req, res, next) {
  try {
    const { domain = "TAG", caseNumber, subject, comments, dueDate } = req.body;
    const data = await interactions.createTaskForClient({
      domain,
      caseNumber,
      subject,
      comments,
      dueDate,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/clients/createActivity
 */
async function createActivityHandler(req, res, next) {
  try {
    const { domain = "TAG", caseNumber, subject, comment } = req.body;
    const data = await interactions.createActivityForClient({
      domain,
      caseNumber,
      subject,
      comment,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * CRUD: Create a new scheduled client
 * POST /api/clients
 */

async function sendSaleDateClientEmail(client, stageKey) {
  const { domain, email, name, cell } = client;

  // 1) signature vars (no token)
  const sigVars = {
    scheduleUrl: process.env[`${domain}_CALENDAR_SCHEDULE_URL`] || "",
    url: process.env[`${domain}_URL`] || "",
    phone: process.env[`${domain}_CLIENT_CONTACT_PHONE`] || "",
    processingEmail: process.env[`${domain}_PROCESSING_EMAIL`] || "",
    logoSrc: process.env[`${domain}_LOGO_URL`] || "",
    contactName: process.env[`${domain}_CONTACT_NAME`] || "",
  };

  // 2) compile signature

  const signatureHtml = sigTpl(sigVars);

  // 3) compile body template
  const tplPath = path.join(
    __dirname,
    "../Templates/clientcontactemails",
    `${stageKey}.hbs`
  );
  if (!fs.existsSync(tplPath)) {
    throw new Error(`Template not found: ${stageKey}.hbs`);
  }
  const bodySource = fs.readFileSync(tplPath, "utf8");
  const bodyTpl = hbs.compile(bodySource);
  const html = bodyTpl({
    name,
    phone: sigVars.phone,
    signature: signatureHtml,
  });

  // 4) subject lookup
  const subject = emailSubjects[stageKey]?.subject || `Update from ${domain}`;

  const domainKey = domain.toLowerCase();
  const attsDir = path.join(
    __dirname,
    "../Templates/attachments",
    stageKey.toLowerCase(),
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
    console.log(`   no attachments folder for ${stageKey}/${domainKey}`);
  }

  console.log(
    `   attachments for ${stageKey}/${domainKey}:`,
    atts.map((a) => a.filename)
  );

  // 5) send mail
  await sendEmail({
    from: `${process.env["TAG_EMAIL_NAME"]} <${process.env["TAG_EMAIL_ADDRESS"]}>`,
    to: email,
    subject,
    html,
    domain,
    attachments: atts,
  });

  // 6) stamp lastContactDate for record
  client.lastContactDate = new Date();
  await client.save();
}

async function createScheduledClientHandler(req, res, next) {
  try {
    const {
      caseNumber,
      domain = "TAG",
      name,
      email = "",
      cell = "",
      ...rest
    } = req.body;

    // 1) build the “bare” client (no token fields)
    const baseClient = {
      caseNumber,
      domain,
      name,
      email,
      cell,
      saleDate: new Date(),
      status: "active",
      lastContactDate: new Date(),
      ...rest,
    };

    // 2) run your verify/flag logic
    const client = await addAndVerifySingleClient(baseClient);
    if (client.status === "inReview") {
      return res.status(202).json({
        message: "Client needs review before being scheduled.",
        client,
      });
    }

    // 3) pick first stage & seed stagesReceived + stagePieces
    const stageKey = client.autoPOA ? "POAEmail" : "PracEmail1";
    client.stagesReceived = client.autoPOA ? ["prac"] : [];
    client.stagePieces = [stageKey];

    // 4) save
    const saved = await new Client(client).save();

    // 5) send the initial email
    await sendSaleDateClientEmail(saved, stageKey);

    return res.status(201).json(saved);
  } catch (err) {
    next(err);
  }
}
async function processReviewedSaleDateClientHandler(req, res, next) {
  try {
    const { client, action } = req.body;

    if (!client) return res.status(404).json({ message: "Not found" });

    const { caseNumber, domain } = client;
    // 1️⃣ hydrate live client
    const doc = await getClientByCaseAndDomain(client);
    if (!client) return res.status(404).json({ message: "Client not found" });

    // 2️⃣ load today’s schedule

    const sched = await getTodaySchedule();
    console.log(doc);
    switch (action) {
      case "prac": {
        if (!doc.stagePieces.includes("PracEmail1")) {
          doc.stagePieces.push("PracEmail1");
        }
        if (
          sched &&
          !sched.emailQueue.some((c) => c.caseNumber === doc.caseNumber)
        ) {
          sched.emailQueue.push({
            ...doc.toObject(),
            stagePiece: "PracEmail1",
            contactType: "email",
          });
          await sched.save();
        }
        await sendSaleDateClientEmail(doc, "PracEmail1");
        break;
      }

      case "433a": {
        if (!doc.stagePieces.includes("POAEmail")) {
          doc.stagePieces.push("POAEmail");
          doc.stagesReceived.push("prac");
        }
        if (
          sched &&
          !sched.emailQueue.some((c) => c.caseNumber === doc.caseNumber)
        ) {
          sched.emailQueue.push({
            ...doc.toObject(),
            stagePiece: "POAEmail",
            contactType: "email",
          });
          await sched.save();
        }
        await sendSaleDateClientEmail(doc, "POAEmail");
        break;
      }

      case "delay": {
        doc.createDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
        doc.status = "active";
        doc.stagesReceived.push("prac", "f433a");
        await doc.save();

        if (sched) {
          sched.emailQueue = sched.emailQueue.filter(
            (c) => !(c.caseNumber === doc.caseNumber && c.domain === doc.domain)
          );
          sched.textQueue = sched.textQueue.filter(
            (c) => !(c.caseNumber === doc.caseNumber && c.domain === doc.domain)
          );
          await sched.save();
        }

        return res.json({ message: "Client delayed 60 days", client: doc });
      }
      case "scheduleDaily": {
        const stagesReceived = doc.stagesReceived || [];
        const hasPrac = stagesReceived.includes("prac");

        // Step 1: Determine current stage
        const stage = hasPrac ? "f433a" : "prac";

        // Step 2: Pull sequence
        const sequence = contactCampaignMap.saleDate?.[stage] || [];

        // Step 3: Determine what's already been sent
        const alreadySent = new Set(doc.stagePieces || []);
        const nextStep = sequence.find(
          (step) => !alreadySent.has(step.stagePiece)
        );

        if (nextStep) {
          const contact = {
            name: doc.name,
            caseNumber: doc.caseNumber,
            email: doc.email,
            cell: doc.cell,
            domain: doc.domain || "TAG",
            stagePiece: nextStep.stagePiece,
            contactType: nextStep.contactType,
            type: "saleDate",
          };

          const field =
            nextStep.contactType === "text" ? "textQueue" : "emailQueue";

          await DailySchedule.findByIdAndUpdate(sched._id, {
            $push: { [field]: contact },
          });
        }
        break;
      }
      case "removeFromQueue": {
        const contactFilter = {
          caseNumber: doc.caseNumber,
          domain: doc.domain,
        };

        // Pull from both queues just in case
        await DailySchedule.findByIdAndUpdate(sched._id, {
          $pull: {
            textQueue: contactFilter,
            emailQueue: contactFilter,
          },
        });
        break;
      }
      default:
        return res.status(400).json({ message: "Invalid action" });
    }

    // 3️⃣ finalize prac/433a flows
    doc.lastContactDate = new Date();
    await doc.save();

    res.json({ message: `${action} flow applied`, client: doc });
  } catch (err) {
    next(err);
  }
}

async function processReviewedCreateDateClientHandler(req, res, next) {
  try {
    console.log("🟢 Hit /reviewCreateDate route"); // Add this
    const { client, action } = req.body;
    console.log("📦 Payload received:", { action, client });
    if (!client) {
      return res.status(404).json({ message: "Client payload not found" });
    }
    const { caseNumber, domain } = client;

    // 1️⃣ always load the up-to-date document
    const doc = await getClientByCaseAndDomain(client);

    if (!doc) {
      return res.status(404).json({ message: "Client not found" });
    }

    // 2️⃣ grab today’s schedule once
    const sched = await getTodaySchedule();
    const period = await getLatestPeriod();

    let updated;
    switch (action) {
      case "add": {
        // brand-new createDate client
        doc.createDate = new Date();
        doc.status = "active";
        doc.reviewDates = [...client.reviewDates];
        updated = await doc.save();
        return res.json({
          message: `Client ${caseNumber} added.`,
          client: updated,
        });
      }
      case "scheduleDaily": {
        console.log("📨 [scheduleDaily] Starting schedule logic...");

        const stage = period?.createDateStage;
        console.log("📘 createDateStage:", stage);

        const sequence = contactCampaignMap.createDate?.[stage] || [];
        console.log(
          "📋 Contact sequence:",
          sequence.map((s) => s.stagePiece)
        );

        const alreadySent = new Set(doc.stagePieces || []);

        const nextStep = sequence.find(
          (step) => !alreadySent.has(step.stagePiece)
        );

        if (!nextStep) {
          console.log("⚠️ No remaining steps — client is fully messaged.");
          return res.status(200).json({
            message: "Client is already complete for this stage.",
            client: doc,
          });
        }

        const contact = {
          name: doc.name,
          caseNumber: doc.caseNumber,
          email: doc.email,
          cell: doc.cell,
          domain: doc.domain || "TAG",
          stagePiece: nextStep.stagePiece,
          contactType: nextStep.contactType,
          type: "createDate",
        };

        const field =
          nextStep.contactType === "text" ? "textQueue" : "emailQueue";
        console.log(`📬 Pushing to ${field}:`, contact);

        await DailySchedule.findByIdAndUpdate(sched._id, {
          $push: { [field]: contact },
        });

        doc.reviewDates = [...client.reviewDates];
        updated = await doc.save();

        console.log(`🎉 Client ${caseNumber} scheduled for next message.`);
        return res.json({
          message: `Client ${caseNumber} added to daily schedule.`,
          client: updated,
        });
      }
      case "schedulePeriod": {
        await PeriodContacts.findByIdAndUpdate(period._id, {
          $addToSet: { createDateClientIDs: doc._id },
        });
        doc.reviewDates = [...client.reviewDates];
        updated = await doc.save();
        return res.json({
          message: `Client ${caseNumber} added.`,
          client: updated,
        });
      }

      case "inactive":
      case "partial": {
        // update status & clear reviewDate
        updated = await Client.findOneAndUpdate(
          { caseNumber, domain },
          { $set: { status: action } },
          { new: true }
        );
        // 3️⃣ purge from both today's schedule and all periods
        await purgeFromScheduleAndPeriod(
          updated._id,
          updated.caseNumber,
          updated.domain
        );
        return res.json({
          message: `Client marked "${action}" and removed from schedule/period.`,
          client: updated,
        });
      }
      case "removeFromQueue": {
        const contactFilter = {
          caseNumber: doc.caseNumber,
          domain: doc.domain,
        };

        // Pull from both queues just in case
        await DailySchedule.findByIdAndUpdate(sched._id, {
          $pull: {
            textQueue: contactFilter,
            emailQueue: contactFilter,
          },
        });
        break;
      }
      default:
        return res.status(400).json({ message: "Invalid action" });
    }
  } catch (err) {
    next(err);
  }
}

async function deleteClientHandler(req, res, next) {
  try {
    const { caseNumber, domain, _id } = req.body;

    const clientId = _id;
    // 1️⃣ Find the client
    const client = clientId
      ? await Client.findById(clientId)
      : await Client.findOne({ caseNumber, domain });
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    // 2️⃣ Delete the Client doc
    await Client.deleteOne({ _id: client._id });

    // 3️⃣ Purge from every DailySchedule
    await DailySchedule.updateMany(
      {},
      {
        $pull: {
          emailQueue: { caseNumber: client.caseNumber, domain: client.domain },
          textQueue: { caseNumber: client.caseNumber, domain: client.domain },
        },
      }
    );

    // 4️⃣ Purge from every PeriodContacts
    await PeriodContacts.updateMany(
      {},
      {
        $pull: {
          createDateClientIDs: client._id.toString(),
        },
      }
    );

    return res.json({ message: `Client ${client.caseNumber} deleted` });
  } catch (err) {
    next(err);
  }
}

//
// 2️⃣ Process a client that was flagged for review
//
// controllers/clientController.js

/**
 * DELETE /api/clients/:id
 */

module.exports = {
  uploadDocumentHandler,
  enrichClientHandler,
  zeroInvoiceHandler,
  createTaskHandler,
  createActivityHandler,
  createScheduledClientHandler,
  processReviewedCreateDateClientHandler,
  processReviewedSaleDateClientHandler,
  deleteClientHandler,
  upload,
  // multer middleware
};
