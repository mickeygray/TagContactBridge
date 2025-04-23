const express = require("express");
const axios = require("axios");
const router = express.Router();
const Client = require("../models/Client");
const crypto = require("crypto");
// @route   POST api/leads/postLeads
// @desc    Post leads to IRSLogics API
// @access  Private
router.post("/postNCOA", async (req, res) => {
  try {
    const leads = req.body;

    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ error: "Invalid leads data" });
    }

    const results = [];

    for (const lead of leads) {
      const {
        FirstName,
        LastName,
        Address,
        City,
        State,
        Zip,
        Notes,
        SourceName,
      } = lead;
      const payload = {
        FirstName,
        LastName,
        Address,
        City,
        State,
        Zip,
        Notes,
        SourceName,
      };

      const response = await axios.post(
        `${process.env.TAG_LOGICS_API_URL}cases/casefile?apikey=${process.env.LOGICS_API_KEY}`,
        payload,
        { headers: { "Content-Type": "application/json" } }
      );

      results.push(response.data);
    }

    res.json({ message: "Leads successfully posted", results });
  } catch (error) {
    console.error(
      "Error posting leads:",
      error.response?.data || error.message
    );
    res.status(error.response?.status || 500).json({
      error: "Failed to post leads",
      details: error.response?.data || error.message,
    });
  }
});
router.post("/postWynn", async (req, res) => {
  try {
    const leads = req.body;

    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ error: "Invalid leads data" });
    }

    const results = [];

    for (const lead of leads) {
      const { FirstName, LastName, CellPhone } = lead;
      const payload = {
        FirstName,
        LastName,
        CellPhone,
      };

      const response = await axios.post(
        `https://wynntax.logiqs.com/publicapi/2020-02-22/cases/casefile?apikey=${process.env.WYNN_LOGICS_KEY}`,
        payload,
        { headers: { "Content-Type": "application/json" } }
      );

      results.push(response.data);
    }

    res.json({ message: "Leads successfully posted", results });
  } catch (error) {
    Nutt;
    console.error(
      "Error posting leads:",
      error.response?.data || error.message
    );
    res.status(error.response?.status || 500).json({
      error: "Failed to post leads",
      details: error.response?.data || error.message,
    });
  }
});

const fetchActivities = async (caseID) => {
  const response = await axios.get(
    `https://taxag.irslogics.com/publicapi/2020-02-22/cases/activity`,
    {
      params: {
        apikey: process.env.LOGICS_API_KEY,
        CaseID: parseInt(caseID),
      },
    }
  );
  return response.data;
};

// ✅ Fetch Invoices
const fetchInvoices = async (caseID) => {
  const response = await axios.get(
    `https://taxag.irslogics.com/publicapi/2020-02-22/billing/caseinvoice`,
    {
      params: {
        apikey: process.env.LOGICS_API_KEY,
        CaseID: parseInt(caseID),
      },
    }
  );

  const data = JSON.parse(response.data.data || "[]");
  return data;
};

// ✅ Fetch Payments
const fetchPayments = async (caseID) => {
  const response = await axios.get(
    `https://taxag.irslogics.com/publicapi/2020-02-22/billing/casepayment`,
    {
      params: {
        apikey: process.env.LOGICS_API_KEY,
        CaseID: parseInt(caseID),
      },
    }
  );

  const data = JSON.parse(response.data.data || "[]");
  return data;
};

router.post("/enrichClients", async (req, res) => {
  const clientList = req.body.clientList;

  console.log("📥 Received client list:", clientList.length, "entries");

  if (!Array.isArray(clientList)) {
    console.error("❌ Invalid input: not an array");
    return res.status(400).json({ message: "Invalid input format" });
  }

  const enrichedClients = [];
  let lastError = false;

  for (const client of clientList) {
    const caseID = client["Case #"] || client.CaseID;

    if (!caseID) {
      console.warn("⚠️ Missing CaseID:", client);
      enrichedClients.push({
        ...client,
        status: "error",
        reason: "Missing CaseID",
      });
      continue;
    }

    console.log(`🚀 Starting enrichment for CaseID: ${caseID}`);

    try {
      const activities = await fetchActivities(caseID);
      console.log(`✅ Activities fetched for ${caseID}:`, activities?.length);
      await wait(300);

      const invoices = await fetchInvoices(caseID);
      console.log(`✅ Invoices fetched for ${caseID}:`, invoices?.length);
      await wait(300);

      const payments = await fetchPayments(caseID);
      console.log(`✅ Payments fetched for ${caseID}:`, payments?.length);

      enrichedClients.push({
        ...client,
        activities,
        invoices,
        payments,
        status: "success",
      });

      lastError = false;
    } catch (err) {
      console.error(`❌ Error enriching CaseID ${caseID}:`, err.message);

      enrichedClients.push({
        ...client,
        status: "error",
        reason: err.response?.data?.message || err.message || "Unknown error",
      });

      if (lastError) {
        console.warn("⛔ Two consecutive errors – halting.");
        return res.status(429).json({
          status: "halted",
          message: "Two consecutive errors. Please try again later.",
          enrichedClients,
        });
      }

      lastError = true;
      console.log("⏳ Waiting 5 seconds before continuing...");
      await wait(5000);
    }
  }

  console.log(
    "🏁 Finished enrichment. Total enriched:",
    enrichedClients.length
  );
  return res.json({
    status: "completed",
    enrichedClients,
  });
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

router.post("/addClients", async (req, res) => {
  const { contactList } = req.body;

  if (!Array.isArray(contactList)) {
    return res.status(400).json({ message: "Invalid contact list." });
  }

  const today = new Date();
  const expirationDate = new Date(today);
  expirationDate.setDate(today.getDate() + 30);

  const createdClients = [];

  for (const contact of contactList) {
    const name = contact.Name || "Unknown";
    const cell = contact.Cell || contact["Work Phone"] || contact.Home || null;
    const email = contact.Email || null;
    const caseNumber = contact["Case #"] || contact.Case || null;
    const lastInvoiceAmount = parseFloat(contact["Last Invoice Amount"]) || 0;
    const invoiceCount = Array.isArray(contact.invoices)
      ? contact.invoices.length
      : 0;

    if ((!email && !cell) || !caseNumber) continue;

    try {
      const existing = await Client.findOne({
        $or: [{ email }, { cell }],
      });

      if (existing) {
        createdClients.push(existing);
        continue;
      }

      const token = crypto.randomBytes(24).toString("hex");

      const newClient = new Client({
        name,
        email,
        cell,
        caseNumber,
        token,
        tokenExpiresAt: expirationDate,
        createDate: today.toISOString().split("T")[0],
        status: "active",
        invoiceCount,
        lastInvoiceAmount,
      });

      await newClient.save();
      createdClients.push(newClient);
    } catch (err) {
      console.error(`❌ Error creating client ${email || cell}:`, err.message);
    }
  }

  res.status(200).json({
    message: "✅ Clients processed",
    clients: createdClients,
  });
});

router.post("/zeroInvoice", async (req, res) => {
  const { caseID } = req.body;

  if (!caseID) {
    return res.status(400).json({ message: "Missing CaseID" });
  }

  const payload = {
    caseID: parseInt(caseID),
    invoiceTypeID: 7,
    quantity: 1,
    unitPrice: 0,
    date: Date.now(),
    invoiceTypeName: "Exploratory - Investigation & Transcript Analysis Fee",
    description: "NO A.S.",
    TagID: 3,
    // 🧾 Placeholder, replace with your Logics user ID when known
  };

  try {
    const response = await axios.post(
      `https://taxag.irslogics.com/publicapi/2020-02-22/Billing/caseinvoice?apikey=${process.env.LOGICS_API_KEY}`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Invoice posted to Logics:", response.data);
    return res.json(response.data);
  } catch (err) {
    console.error(
      "❌ Error posting invoice:",
      err.response?.data || err.message
    );
    return res.status(500).json({
      message: "Failed to post invoice",
      error: err.response?.data || err.message,
    });
  }
});
router.get("/clients-today", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0]; // Format: "YYYY-MM-DD"
    const clients = await Client.find({ createDate: today });

    res.status(200).json(clients);
  } catch (error) {
    console.error("❌ Error fetching today's clients:", error);
    res.status(500).json({ message: "Failed to fetch today's clients." });
  }
});
module.exports = router;
