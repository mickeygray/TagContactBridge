// utils/sendTextMessage.js
const { sendTextMessageAPI } = require("../services/callRailService");

const RATE_LIMIT_HOURLY = 150;
const RATE_LIMIT_DAILY = 1000;
let sentHour = 0;
let sentDay = 0;
let lastHourReset = Date.now();
let lastDayReset = Date.now();

function resetLimits() {
  const now = Date.now();
  if (now - lastHourReset > 3600_000) {
    sentHour = 0;
    lastHourReset = now;
  }
  if (now - lastDayReset > 86_400_000) {
    sentDay = 0;
    lastDayReset = now;
  }
}

/**
 * Sends one SMS via CallRail, with rate limiting.
 */
async function sendTextMessage({ phoneNumber, trackingNumber, message }) {
  resetLimits();
  if (sentHour >= RATE_LIMIT_HOURLY || sentDay >= RATE_LIMIT_DAILY) {
    return { phoneNumber, status: "❌ Rate limit exceeded" };
  }

  try {
    await sendTextMessageAPI({
      phoneNumber,
      trackingNumber,
      content: message,
    });
    sentHour++;
    sentDay++;
    return { phoneNumber, status: "✅ Sent" };
  } catch (err) {
    console.error(`❌ Failed to send to ${phoneNumber}:`, err.message);
    return { phoneNumber, status: "❌ Failed" };
  }
}

module.exports = sendTextMessage;
