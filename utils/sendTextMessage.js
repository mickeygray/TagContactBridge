// utils/sendTextMessage.js
const axios = require("axios");

const RATE_LIMIT_HOURLY = 150;
const RATE_LIMIT_DAILY = 1000;

let sentHour = 0;
let sentDay = 0;
let lastHourReset = Date.now();
let lastDayReset = Date.now();

function resetLimits() {
  const now = Date.now();
  if (now - lastHourReset > 60 * 60 * 1000) {
    sentHour = 0;
    lastHourReset = now;
  }
  if (now - lastDayReset > 24 * 60 * 60 * 1000) {
    sentDay = 0;
    lastDayReset = now;
  }
}

/**
 * @param {Object} opts
 * @param {string} opts.phoneNumber - E.164 recipient
 * @param {string} opts.trackingNumber - CallRail tracking # to display
 * @param {string} opts.message - Fully-rendered SMS body
 */
async function sendTextMessage({ phoneNumber, trackingNumber, message }) {
  resetLimits();

  if (sentHour >= RATE_LIMIT_HOURLY || sentDay >= RATE_LIMIT_DAILY) {
    return { phoneNumber, status: "❌ Rate limit exceeded" };
  }

  try {
    await axios.post(
      `https://api.callrail.com/v3/a/${process.env.CALL_RAIL_ACCOUNT_ID}/text-messages.json`,
      {
        customer_phone_number: phoneNumber,
        tracking_number: trackingNumber,
        content: message,
        company_id: process.env.CALL_RAIL_COMPANY_ID,
      },
      {
        headers: {
          Authorization: `Token token=${process.env.CALL_RAIL_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    sentHour++;
    sentDay++;
    return { phoneNumber, status: "✅ Sent" };
  } catch (err) {
    console.error(`❌ Failed to send to ${phoneNumber}:`, err.message);
    return { phoneNumber, status: "❌ Failed" };
  }
}

module.exports = sendTextMessage;
