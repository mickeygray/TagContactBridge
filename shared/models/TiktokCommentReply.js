// models/tiktokCommentReply.js
// ─────────────────────────────────────────────────────────────
// Tracks which TikTok comments have already been replied to.
// Prevents duplicate replies if the poller runs multiple times.
// ─────────────────────────────────────────────────────────────

const mongoose = require("mongoose");

const tiktokCommentReplySchema = new mongoose.Schema(
  {
    commentId: {
      type: String,
      required: true,
      unique: true,
    },
    videoId: {
      type: String,
      required: true,
    },
    company: {
      type: String,
      required: true,
      uppercase: true,
    },
    keyword: {
      type: String, // which keyword triggered the reply
    },
    repliedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

// Auto-delete records older than 90 days to keep collection lean
tiktokCommentReplySchema.index(
  { repliedAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 },
);

module.exports = mongoose.model("TiktokCommentReply", tiktokCommentReplySchema);
