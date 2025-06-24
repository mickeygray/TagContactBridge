const axios = require("axios");

const CALLRAIL_BASE = `https://api.callrail.com/v3/a/${process.env.CALL_RAIL_ACCOUNT_ID}`;

async function sendTextMessageAPI({ phoneNumber, trackingNumber, content }) {
  console.log(CALLRAIL_BASE);
  return axios.post(
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
  );
}

module.exports = {
  sendTextMessageAPI,
};
