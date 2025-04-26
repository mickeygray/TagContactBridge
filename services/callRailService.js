// services/callRailService.js
const axios = require("axios");
const pLimit = require("p-limit").default;

// throttle all CallRail calls to max 5 in flight
const limit = pLimit(5);

const CALLRAIL_BASE = `https://api.callrail.com/v3/a/${process.env.CALL_RAIL_ACCOUNT_ID}`;

async function sendTextMessageAPI({ phoneNumber, trackingNumber, content }) {
  return limit(() =>
    axios.post(
      `${CALLRAIL_BASE}/text-messages.json`,
      {
        customer_phone_number: phoneNumber,
        tracking_number: trackingNumber,
        content,
        company_id: process.env.CALL_RAIL_COMPANY_ID,
      },
      {
        headers: {
          Authorization: `Token token=${process.env.CALL_RAIL_KEY}`,
          "Content-Type": "application/json",
        },
      }
    )
  );
}

async function getRecordingStream(callId) {
  // existing code you already extracted...
}

module.exports = {
  sendTextMessageAPI,
  getRecordingStream,
  // ...any future CallRail endpoints
};
