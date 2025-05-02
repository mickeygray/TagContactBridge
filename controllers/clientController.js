// controllers/clientController.js
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const hbs = require("handlebars");
const Client = require("../models/Client");
const sendEmail = require("../utils/sendEmail");
const interactions = require("../utils/singleClientInteractions");
const { addAndVerifyNewClient } = require("../utils/bulkAddClientsChecks");
const signatures = require("../libraries/emailSignatures"); // 🆕 import

const upload = multer();

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
    const {
      caseNumber,
      domain = "TAG",
      name,
      email = "",
      cell = "",
      ...rest
    } = req.body;

    // 60‑day token
    const token = crypto.randomBytes(24).toString("hex");
    const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    // base object
    const baseClient = {
      caseNumber,
      domain,
      name,
      email,
      cell,
      token,
      tokenExpiresAt,
      saleDate: new Date(),
      stagesReceived: ["prac"],
      stagePieces: ["prac email 1"],
      status: "active",
      contactedThisPeriod: false,
      activeInStage: true,
      lastContactDate: new Date(),
      ...rest,
    };

    // run checks
    const client = await addAndVerifySingleClient(baseClient);

    if (client.status === "inReview") {
      // send back for manual review
      return res.status(202).json({
        message: "Client needs review before being scheduled.",
        client,
      });
    }

    // save and send prac email 1
    const saved = await new Client(client).save();
    const tokenURL = `https://${
      domain === "WYNN" ? "wynntaxsolutions.com" : "taxadvocategroup.com"
    }/schedule-my-call/${token}`;

    // load & render HBS
    const tpl = fs.readFileSync(
      path.join(
        __dirname,
        "../Templates/client contact emails/Prac Email 1.hbs"
      ),
      "utf8"
    );
    const html = hbs.compile(tpl)({
      name,
      caseNumber,
      tokenURL,
      number: signatures[domain].number,
      signature: signatures[domain].html,
    });

    await sendEmail({
      to: saved.email,
      subject: "Let’s Schedule Your Practitioner Call",
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

    if (!client) return res.status(404).json({ message: "Not found" });

    const domain = client.domain;
    let stagePiece, tplPath, subject;

    switch (action) {
      case "prac":
        stagePiece = "Prac Email 1";
        tplPath = path.join(
          __dirname,
          "../Templates/client contact emails/Prac Email 1.hbs"
        );
        subject = "Let’s Schedule Your Practitioner Call";
        client.stagesReceived.push("prac");
        client.stagePieces.push(stagePiece);
        break;

      case "433a":
        stagePiece = "433a Email 1";
        tplPath = path.join(
          __dirname,
          "../Templates/client contact emails/433a Email 1.hbs"
        );
        subject = "Your 433(a) Update";
        client.stagesReceived.push("f433a");
        client.stagePieces.push(stagePiece);
        break;

      case "delay":
        client.createDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
        client.status = "active";
        client.reviewDate = null;
        await client.save();
        return res.json({ message: "Client delayed 60 days", client });

      case "inactive":
      case "partial":
        client.status = action;
        client.reviewDate = null;
        await client.save();
        return res.json({
          message: `Client status set to "${action}"`,
          client,
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
