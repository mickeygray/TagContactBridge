const express = require("express");
const router = express.Router();
const axios = require("axios");
const cron = require("node-cron");

const RATE_LIMIT_HOURLY = 150;
const RATE_LIMIT_DAILY = 1000;
let messagesSentHour = 0;
let messagesSentDay = 0;
let lastResetHour = Date.now();
let lastResetDay = Date.now();

router.post("/", async (req, res) => {
  const { messagesPayload } = req.body;

  console.log(messagesPayload);
  if (!messagesPayload || !Array.isArray(messagesPayload)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid input data." });
  }

  const now = Date.now();

  // Reset Hourly Limit
  if (now - lastResetHour > 60 * 60 * 1000) {
    messagesSentHour = 0;
    lastResetHour = now;
  }

  // Reset Daily Limit
  if (now - lastResetDay > 24 * 60 * 60 * 1000) {
    messagesSentDay = 0;
    lastResetDay = now;
  }

  const results = [];
  for (const message of messagesPayload) {
    if (
      messagesSentHour >= RATE_LIMIT_HOURLY ||
      messagesSentDay >= RATE_LIMIT_DAILY
    ) {
      results.push({
        phoneNumber: message.phoneNumber,
        status: "❌ Rate limit exceeded",
      });
      continue;
    }

    const payload = {
      customer_phone_number: message.phoneNumber,
      tracking_number: message.trackingNumber,
      content: message.message,
      company_id: process.env.CALL_RAIL_COMPANY_ID,
    };

    try {
      await axios.post(
        `https://api.callrail.com/v3/a/${process.env.CALL_RAIL_ACCOUNT_ID}/text-messages.json`,
        payload,
        {
          headers: {
            Authorization: `Token token=${process.env.CALL_RAIL_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      messagesSentHour++;
      messagesSentDay++;
      results.push({ phoneNumber: message.phoneNumber, status: "✅ Sent" });
    } catch (error) {
      console.error(`❌ Failed to send text to ${message.phoneNumber}:`);
      results.push({ phoneNumber: message.phoneNumber, status: "❌ Failed" });
    }
  }

  res.json({ success: true, results });
});
cron.schedule("3 17 * * 2", async () => {
  console.log(
    "⏳ Running scheduled text message job for Tuesday at 5:00 PM..."
  );

  const now = new Date();
  const currentDay = now.toLocaleString("en-US", { weekday: "long" });
  const currentTime = now.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  console.log(
    `🔍 Checking for scheduled messages at ${currentDay}, ${currentTime}`
  );

  try {
    const scheduledLeads = await Lead.find({
      "scheduledDrops.scheduledDay": "Tuesday",
      "scheduledDrops.scheduledTime": "5:00 PM",
    });

    if (!scheduledLeads.length) {
      console.log("✅ No scheduled messages at this time.");
      return;
    }

    console.log(`📩 Found ${scheduledLeads.length} messages to send...`);

    // Reset Hourly Limit
    const nowTimestamp = Date.now();
    if (nowTimestamp - lastResetHour > 60 * 60 * 1000) {
      messagesSentHour = 0;
      lastResetHour = nowTimestamp;
    }

    // Reset Daily Limit
    if (nowTimestamp - lastResetDay > 24 * 60 * 60 * 1000) {
      messagesSentDay = 0;
      lastResetDay = nowTimestamp;
    }

    const results = [];
    for (const lead of scheduledLeads) {
      for (const drop of lead.scheduledDrops) {
        if (
          drop.scheduledDay !== "Tuesday" ||
          drop.scheduledTime !== "5:00 PM"
        ) {
          continue; // Skip drops that don't match the current time
        }

        if (
          messagesSentHour >= RATE_LIMIT_HOURLY ||
          messagesSentDay >= RATE_LIMIT_DAILY
        ) {
          results.push({
            phoneNumber: lead.phoneNumber,
            status: "❌ Rate limit exceeded",
          });
          continue;
        }

        const payload = {
          customer_phone_number: lead.cell,
          tracking_number: drop.textMessageTrackingNumber,
          content: drop.textMessage,
          company_id: process.env.CALL_RAIL_COMPANY_ID,
        };

        try {
          await axios.post(
            `https://api.callrail.com/v3/a/${process.env.CALL_RAIL_ACCOUNT_ID}/text-messages.json`,
            payload,
            {
              headers: {
                Authorization: `Token token=${process.env.CALL_RAIL_KEY}`,
                "Content-Type": "application/json",
              },
            }
          );

          messagesSentHour++;
          messagesSentDay++;
          results.push({ phoneNumber: lead.phoneNumber, status: "✅ Sent" });

          console.log(`✅ Successfully sent message to ${lead.phoneNumber}`);
        } catch (error) {
          console.error(
            `❌ Failed to send text to ${lead.phoneNumber}:`,
            error
          );
          results.push({ phoneNumber: lead.phoneNumber, status: "❌ Failed" });
        }
      }
    }

    console.log("📊 Scheduled Message Results:", results);
  } catch (error) {
    console.error("🚨 Error running scheduled text job:", error);
  }
});
module.exports = router;
