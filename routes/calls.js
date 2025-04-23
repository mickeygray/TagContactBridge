// /routes/recording.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

router.get("/:callId", async (req, res) => {
  const { callId } = req.params;
  try {
    const response = await axios.get(
      `https://api.callrail.com/v3/a/${process.env.CALL_RAIL_ACCOUNT_ID}/calls/${callId}/recording.json`,
      {
        headers: {
          Authorization: `Token token=${process.env.CALL_RAIL_KEY}`,
        },
      }
    );

    // Response has a redirect to the actual MP3
    const recordingUrl = response.data.url;

    const stream = await axios.get(recordingUrl, { responseType: "stream" });
    stream.data.pipe(res);
  } catch (err) {
    res.status(500).json({ message: "Recording fetch failed" });
  }
});
module.exports = router;
