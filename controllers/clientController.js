const multer = require("multer");
const { uploadCaseDocument } = require("../services/logicsService");

const upload = multer();

async function uploadDocumentHandler(req, res, next) {
  try {
    const {
      caseID,
      comment = "Uploaded from mailer list",
      fileCategoryID = 1,
    } = req.body;
    const file = req.file;
    if (!file || !caseID) {
      return res.status(400).json({ error: "File and CaseID are required." });
    }
    const data = await uploadCaseDocument({
      caseID,
      comment,
      fileCategoryID,
      fileBuffer: file.buffer,
      filename: file.originalname,
      contentType: file.mimetype,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
async function enrichClientsHandler(req, res, next) {
  try {
    const list = req.body.clientList;
    if (!Array.isArray(list))
      return res.status(400).json({ message: "Invalid input" });

    const enriched = [];
    let lastErr = false;

    for (const c of list) {
      const caseID = c["Case #"] || c.caseID;
      if (!caseID) {
        enriched.push({ ...c, status: "error", reason: "Missing CaseID" });
        continue;
      }
      try {
        const activities = await logics.fetchActivities("TAG", caseID);
        await wait(300);
        const invoices = await logics.fetchInvoices("TAG", caseID);
        await wait(300);
        const payments = await logics.fetchPayments("TAG", caseID);

        enriched.push({
          ...c,
          activities,
          invoices,
          payments,
          status: "success",
        });
        lastErr = false;
      } catch (err) {
        enriched.push({
          ...c,
          status: "error",
          reason: err.response?.data?.message || err.message,
        });
        if (lastErr) {
          return res.status(429).json({
            status: "halted",
            message: "Two consecutive errors. Try again later.",
            enrichedClients: enriched,
          });
        }
        lastErr = true;
        await wait(5000);
      }
    }

    res.json({ status: "completed", enrichedClients: enriched });
  } catch (err) {
    next(err);
  }
}

/** POST /api/clients/zeroInvoice */
async function zeroInvoiceHandler(req, res, next) {
  try {
    const { caseID } = req.body;
    if (!caseID) return res.status(400).json({ message: "Missing CaseID" });

    const data = await logics.createZeroInvoice("TAG", caseID);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function createScheduledClientHandler(req, res, next) {
  try {
    const { caseNumber, domain = "TAG", name, email, cell, ...rest } = req.body;
    const token = crypto.randomBytes(24).toString("hex");
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 60);

    const caseID = parseInt(caseNumber, 10);
    let invoiceCount = 0;
    let lastInvoiceAmount = 0;

    try {
      const invoices = await logics.fetchInvoices(domain, caseID);
      invoiceCount = invoices.length;
      lastInvoiceAmount = invoices.at(-1)?.Amount || 0;
    } catch (warnErr) {
      console.warn("⚠️ Could not fetch invoices:", warnErr.message);
    }

    const newClient = new Client({
      caseNumber,
      domain,
      name,
      email,
      cell,
      token,
      tokenExpiresAt,
      invoiceCount,
      lastInvoiceAmount,
      saleDate: new Date(),
      ...rest,
    });
    await newClient.save();

    // Send initial practitioner-call email
    const tplPath = path.join(__dirname, "../Templates/prac-call.hbs");
    const source = fs.readFileSync(tplPath, "utf8");
    const compiled = hbs.compile(source);
    const host =
      domain === "WYNN" ? "wynntaxsolutions.com" : "taxadvocategroup.com";
    const html = compiled({
      name,
      caseNumber,
      link: `https://${host}/schedule-my-call/${token}`,
    });

    await sendEmail({
      to: email,
      subject: "Let’s Schedule Your Practitioner Call",
      html,
      domain,
    });

    res.status(201).json(newClient);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/clients/:id
 */
async function updateScheduledClientHandler(req, res, next) {
  try {
    const updated = await Client.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

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
  zeroInvoiceHandler,
  enrichClientsHandler,
  deleteScheduledClientHandler,
  updateScheduledClientHandler,
  createScheduledClientHandler,
  upload, // multer middleware
};
