// controllers/clientController.js
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const hbs = require("handlebars");
const Client = require("../models/Client");
const DailySchedule = require("../models/DailySchedule"); // your daily schedule model
const PeriodContacts = require("../models/PeriodContacts");
const sendEmail = require("../utils/sendEmail");
const interactions = require("../utils/singleClientInteractions");
const { addAndVerifySingleClient } = require("../utils/newClientEntryChecks");
const signature = require("../libraries/rawSignature");
const emailSubjects = require("../libraries/emailSubjects"); // 🆕 import

const upload = multer();
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
async function reinsertToPeriodHandler(req, res, next) {
  try {
    const { clientID, periodID } = req.body;
    if (!clientID) {
      return res.status(400).json({ message: "Missing clientID" });
    }
    // Fetch either the specified period, or your “active” period if you prefer:
    const period = periodID
      ? await PeriodContacts.findById(periodID)
      : await PeriodContacts.findOne({ isActive: true });

    if (!period) {
      return res.status(404).json({ message: "No active period found" });
    }

    // Only add if not already present
    const strId = clientID.toString();
    if (!period.createDateClientIDs.map(String).includes(strId)) {
      period.createDateClientIDs.push(clientID);
      await period.save();
    }

    return res.json({ success: true, period });
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
async function createScheduledClientHandler(req, res, next) {
  try {
    const { caseNumber, domain, name, email, cell, ...rest } = req.body;

    // 1) generate the 60‑day token

    // 2) build the “bare” baseClient — **no stages** yet
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

    // 3) run your verification/flagging logic
    const client = await addAndVerifySingleClient(baseClient);
    console.log(client, "client after filter");
    // 4) if it still needs manual review, stop here
    if (client.status === "inReview") {
      return res.status(202).json({
        message: "Client needs review before being scheduled.",
        client,
      });
    }

    // 5) **now** decide which stage flow to apply:
    const stageKey = client.autoPOA ? "POAEmail" : "PracEmail1";
    client.stagesReceived = client.autoPOA ? ["prac"] : [];
    client.stagePieces = [stageKey];

    // 6) save to Mongo
    const saved = await new Client(client).save();

    // 7) gather your per‑domain signature variables
    const sigVars = {
      schedulerUrl: process.env[`${domain}_CALENDAR_SCHEDULE_URL`] || "",
      url: process.env[`${domain}_URL`] || "",
      phone: process.env[`${domain}_CLIENT_CONTACT_PHONE`] || "",
      processingEmail: process.env[`${domain}_PROCESSING_EMAIL`] || "",
      logoSrc: process.env[`${domain}_LOGO_URL`] || "",
      contactName: process.env[`${domain}_CONTACT_NAME`] || "",
    };

    // 8) compile & render your signature
    const sigTpl = signature;
    if (!sigTpl) throw new Error(`No signature for domain "${domain}"`);

    const signatureHtml = sigTpl(sigVars);
    console.log(__dirname, "dirname");
    // 9) compile & render your body template
    const bodyPath = path.join(
      __dirname,
      "../Templates/clientcontactemails",
      `${stageKey}.hbs`
    );

    if (!fs.existsSync(bodyPath))
      throw new Error(`Template not found: ${stageKey}`);
    const bodySource = fs.readFileSync(bodyPath, "utf8");
    const bodyTpl = hbs.compile(bodySource);
    const html = bodyTpl({
      name,
      phone: sigVars.phone,
      signature: signatureHtml,
    });

    // 10) pick the subject
    const subject =
      emailSubjects[`${stageKey}`].subject || "Update from Your Tax Team";

    // 11) send
    await sendEmail({
      to: saved.email,
      subject: subject,
      html,
      domain: saved.domain,
    });

    res.status(201).json(saved);
  } catch (err) {
    next(err);
  }
}

//
// 2️⃣ Process a client that was flagged for review
//
// controllers/clientController.js
async function processReviewedClientHandler(req, res, next) {
  try {
    const { client, action } = req.body;
    console.log(action);

    if (!client) return res.status(404).json({ message: "Not found" });

    const domain = client.domain;
    let clientDoc, stagePiece, tplPath, subject;

    switch (action) {
      case "prac":
        stagePiece = "PracEmail1";
        tplPath = path.join(
          __dirname,
          "../Templates/clientcontactemails/PracEmail1.hbs"
        );
        subject = "Let’s Schedule Your Practitioner Call";
        client.stagesReceived.push("prac");
        client.stagePieces.push(stagePiece);
        break;

      case "433a":
        stagePiece = "POAEmail";
        tplPath = path.join(
          __dirname,
          "../Templates/clientcontactemails/433aEmail1.hbs"
        );
        subject = "Your 433(a) Update";
        client.stagesReceived.push("f433a");
        client.stagePieces.push(stagePiece);
        break;

      case "delay": {
        // compute the 60‑day bump
        const newCreate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
        // upsert-like semantics: update existing or insert new with defaults
        const updated = await Client.findOneAndUpdate(
          { caseNumber: client.caseNumber }, // filter
          {
            $set: {
              createDate: newCreate,
              status: "active",
              reviewDate: null,
            },
          },
          {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
          }
        );

        return res.json({
          message: "Client delayed 60 days",
          client: updated,
        });
      }

      case "inactive":
      case "partial": {
        // set status, clear for review
        // Atomically set status and clear reviewDate
        const updated = await Client.findOneAndUpdate(
          { caseNumber: client.caseNumber }, // or: { _id: client._id }
          {
            $set: {
              status: action,
              reviewDate: null,
            },
          },
          { new: true }
        );

        // remove from today's schedule & current period
        await purgeFromScheduleAndPeriod(updated._id, updated.caseNumber);

        return res.json({
          message: `Client status set to "${action}" and purged from schedule/period.`,
          client: updated,
        });
      }
      case "add":
        // Add this client immediately: set createDate = today, status = active
        client.createDate = new Date();
        client.status = "active";
        client.reviewDate = null;
        clientDoc = new Client({ ...client });
        await clientDoc.save();

        return res.json({
          message: `Client ${client.caseNumber} added and scheduled.`,
          client,
        });

      case "delete":
        // completely delete the client record
        await Client.deleteOne({ _id: client._id });
        // also purge any schedule/period links
        await purgeFromScheduleAndPeriod(client._id, client.caseNumber);

        return res.json({
          message: "Client deleted and purged from schedule/period.",
        });

      default:
        return res.status(400).json({ message: "Invalid action" });
    }

    // For "prac" or "433a", compile & send the email
    const source = fs.readFileSync(tplPath, "utf8");
    const compiled = hbs.compile(source);
    const tokenURL = `https://${
      domain === "WYNN" ? "wynntaxsolutions.com" : "taxadvocategroup.com"
    }/schedule-my-call/${client.token}`;

    const html = compiled({
      name: client.name,
      caseNumber: client.caseNumber,
      tokenURL,
      number: signatures[domain].number,
      signature: signatures[domain].html,
    });

    await sendEmail({
      to: client.email,
      subject,
      html,
      domain,
    });

    client.lastContactDate = new Date();
    await client.save();

    res.json({ message: `${action} email sent`, client });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/clients/:id
 */

/**
 * DELETE /api/clients/:id
 */
async function deleteScheduledClientHandler(req, res, next) {
  try {
    await Client.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadDocumentHandler,
  enrichClientHandler,
  zeroInvoiceHandler,
  createTaskHandler,
  createActivityHandler,
  reinsertToPeriodHandler,
  createScheduledClientHandler,
  processReviewedClientHandler,
  deleteScheduledClientHandler,
  upload, // multer middleware
};
