// services/tiktokCommentService.js
// ─────────────────────────────────────────────────────────────
// Polls recent TikTok videos for comments containing trigger
// keywords, then replies with a qualify-now link.
//
// FLOW:
//   1. Get recent video IDs for TAG and WYNN via video.list
//   2. For each video, fetch latest comments via comment.list
//   3. Check each comment for trigger keywords
//   4. If triggered and not already replied → post reply via comment.create
//   5. Record replied comment in MongoDB to prevent duplicates
//
// SCHEDULE:
//   Call pollAndReply() on an interval — every 15 minutes recommended.
//   Wire into your scheduler:
//     const { pollAndReply } = require("./services/tiktokCommentService");
//     setInterval(pollAndReply, 15 * 60 * 1000);
//     pollAndReply(); // run once on startup
// ─────────────────────────────────────────────────────────────

const axios = require("axios");
const { getValidToken } = require("./tiktokAuthService");
const TiktokCommentReply = require("../../shared/models/TiktokCommentReply");

const GRAPH = "https://open.tiktokapis.com/v2";
const COMPANIES = ["TAG", "WYNN"];

const TRIGGER_KEYWORDS = [
  "relief",
  "help",
  "owe",
  "irs",
  "tax",
  "debt",
  "garnish",
  "levy",
  "lien",
  "qualify",
];

// How many recent videos to check per poll
const MAX_VIDEOS = 10;

// ─── Build Qualify Link ──────────────────────────────────────

function buildQualifyUrl(company) {
  const base =
    company === "TAG"
      ? "https://www.taxadvocategroup.com/qualify-now"
      : "https://www.wynntaxsolutions.com/qualify-now";

  const params = new URLSearchParams({
    nid: "tiktok_comment",
    utm_source: "tiktok",
    utm_medium: "comment",
  });

  return `${base}/?${params.toString()}`;
}

function buildReplyText(company) {
  const url = buildQualifyUrl(company);
  const brand = company === "TAG" ? "Tax Advocate Group" : "Wynn Tax Solutions";
  return `Hi! 👋 We may be able to help. Find out if you qualify for IRS tax relief with a free consultation from ${brand} → ${url}`;
}

// ─── Get Recent Video IDs ────────────────────────────────────

async function getRecentVideoIds(accessToken, openId) {
  try {
    const response = await axios.post(
      `${GRAPH}/video/list/`,
      {
        max_count: MAX_VIDEOS,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        params: {
          fields: "id,title,create_time",
        },
        timeout: 10000,
      },
    );

    const videos = response.data?.data?.videos || [];
    console.log(
      `[TT-COMMENT] Found ${videos.length} recent videos for openId ${openId}`,
    );
    return videos.map((v) => v.id);
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error(`[TT-COMMENT] Failed to fetch video list: ${msg}`);
    return [];
  }
}

// ─── Get Comments for a Video ────────────────────────────────

async function getComments(accessToken, videoId) {
  try {
    const response = await axios.get(`${GRAPH}/comment/list/`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        video_id: videoId,
        fields: "id,text,like_count,reply_count,create_time,username",
        max_count: 20,
      },
      timeout: 10000,
    });

    return response.data?.data?.comments || [];
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error(
      `[TT-COMMENT] Failed to fetch comments for video ${videoId}: ${msg}`,
    );
    return [];
  }
}

// ─── Post Reply to Comment ────────────────────────────────────

async function replyToComment(accessToken, videoId, commentId, text) {
  try {
    await axios.post(
      `${GRAPH}/comment/reply/`,
      {
        video_id: videoId,
        parent_comment_id: commentId,
        text,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      },
    );
    console.log(
      `[TT-COMMENT] ✓ Replied to comment ${commentId} on video ${videoId}`,
    );
    return { ok: true };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error(`[TT-COMMENT] Reply failed for comment ${commentId}: ${msg}`);
    return { ok: false, error: msg };
  }
}

// ─── Check Keyword ───────────────────────────────────────────

function detectKeyword(text) {
  const lower = (text || "").toLowerCase();
  return TRIGGER_KEYWORDS.find((kw) => lower.includes(kw)) || null;
}

// ─── Poll One Company ─────────────────────────────────────────

async function pollCompany(company) {
  const token = await getValidToken(company);
  if (!token) {
    console.warn(`[TT-COMMENT] No valid token for ${company} — skipping`);
    return;
  }

  const { accessToken, openId } = token;
  const replyText = buildReplyText(company);

  const videoIds = await getRecentVideoIds(accessToken, openId);
  if (!videoIds.length) return;

  let repliedCount = 0;

  for (const videoId of videoIds) {
    const comments = await getComments(accessToken, videoId);

    for (const comment of comments) {
      const commentId = comment.id;
      const text = comment.text || "";

      // Check keyword
      const keyword = detectKeyword(text);
      if (!keyword) continue;

      // Check if already replied
      const alreadyReplied = await TiktokCommentReply.exists({ commentId });
      if (alreadyReplied) continue;

      console.log(
        `[TT-COMMENT] Keyword "${keyword}" found in comment ${commentId} on video ${videoId}: "${text.slice(0, 80)}"`,
      );

      // Post reply
      const result = await replyToComment(
        accessToken,
        videoId,
        commentId,
        replyText,
      );

      if (result.ok) {
        // Record in DB
        await TiktokCommentReply.create({
          commentId,
          videoId,
          company,
          keyword,
        });
        repliedCount++;
      }
    }
  }

  if (repliedCount > 0) {
    console.log(
      `[TT-COMMENT] ✓ ${company}: replied to ${repliedCount} comment(s)`,
    );
  } else {
    console.log(`[TT-COMMENT] ${company}: no new trigger comments found`);
  }
}

// ─── Main Poll Function ───────────────────────────────────────

async function pollAndReply() {
  console.log(
    `[TT-COMMENT] Starting comment poll — ${new Date().toISOString()}`,
  );
  for (const company of COMPANIES) {
    try {
      await pollCompany(company);
    } catch (err) {
      console.error(
        `[TT-COMMENT] Unhandled error for ${company}:`,
        err.message,
      );
    }
  }
}

// ─── Stats (for dashboard) ────────────────────────────────────

async function getCommentStats() {
  const total = await TiktokCommentReply.countDocuments();
  const byCompany = await TiktokCommentReply.aggregate([
    { $group: { _id: "$company", count: { $sum: 1 } } },
  ]);
  const byKeyword = await TiktokCommentReply.aggregate([
    { $group: { _id: "$keyword", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  return { total, byCompany, byKeyword };
}

module.exports = {
  pollAndReply,
  getCommentStats,
};
