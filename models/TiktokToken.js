// models/tiktokToken.js
// ─────────────────────────────────────────────────────────────
// Stores TikTok Developer API OAuth tokens per company.
// Access tokens expire every 24 hours and are refreshed automatically.
// ─────────────────────────────────────────────────────────────

const mongoose = require("mongoose");

const tiktokTokenSchema = new mongoose.Schema(
  {
    company: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      enum: ["TAG", "WYNN"],
    },
    openId: {
      type: String,
      required: true,
    },
    accessToken: {
      type: String,
      required: true,
    },
    refreshToken: {
      type: String,
      required: true,
    },
    accessTokenExpiresAt: {
      type: Date,
      required: true,
    },
    refreshTokenExpiresAt: {
      type: Date,
      required: true,
    },
    scope: {
      type: String,
    },
    authorizedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("TiktokToken", tiktokTokenSchema);
