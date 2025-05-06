const { sendTextMessageAPI } = require("../services/callRailService");

async function sendTextMessage({ phoneNumber, trackingNumber, message }) {
  try {
    await sendTextMessageAPI({
      phoneNumber,
      trackingNumber,
      content: message,
    });
    return { phoneNumber, status: "✅ Sent" };
  } catch (err) {
    console.error(`❌ Failed to send to ${phoneNumber}:`, err.message);
    return { phoneNumber, status: "❌ Failed", error: err.message };
  }
}

module.exports = sendTextMessage;
