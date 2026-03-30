// services/phoneBurnerService.js
// ─────────────────────────────────────────────────────────────
// PhoneBurner integration — age-based folder management.
//
// CRITICAL CHANGE: Folder decisions now use the stored
// `lead.caseAge` integer instead of deriving business days
// from `createdAt`. This prevents premature folder moves
// (e.g., moving a lead out of HOT before it's had a full
// business day there).
//
//   FOLDERS (dial priority order):
//     HOT        → caseAge 0 (speed-to-lead)
//     DAY1       → caseAge 1
//     DAY2       → caseAge 2
//     DAY3_10    → caseAge 3-10
//     DAY10_PLUS → caseAge 10+
//     TRANSFER   → live transfers (audited each morning)
//
//   MORNING ROTATION (7am CT, Mon-Fri):
//     1. Audit TRANSFER folder
//     2. DAY3_10: caseAge 10+ → DAY10_PLUS
//     3. DAY2: caseAge 3+ → DAY3_10
//     4. DAY1: caseAge 2+ → DAY2
//     5. HOT: caseAge 1+ → DAY1
//     6. Load unpushed overnight leads → HOT
// ─────────────────────────────────────────────────────────────

const axios = require("axios");
const {
  createActivityLoop,
  updateCaseStatus,
  fetchCaseInfo,
} = require("./logicsService");
const { deactivateLead } = require("../utils/deactivateLead");
const PB_BASE = "https://www.phoneburner.com/rest/1";

// ─── Folder Config ───────────────────────────────────────────────────────────

const SEATS = {
  HOT: {
    token: process.env.PB_HOT_SEAT_TOKEN,
    folderId: process.env.PB_HOT_FOLDER_ID,
    label: "Hot Leads (Day 0)",
  },
  DAY1: {
    token: process.env.PB_HOT_SEAT_TOKEN,
    folderId: process.env.PB_DAY1_FOLDER_ID,
    label: "Day 1",
  },
  DAY2: {
    token: process.env.PB_HOT_SEAT_TOKEN,
    folderId: process.env.PB_DAY2_FOLDER_ID,
    label: "Day 2",
  },
  DAY3_10: {
    token: process.env.PB_HOT_SEAT_TOKEN,
    folderId: process.env.PB_DAY3_10_FOLDER_ID,
    label: "Day 3-10",
  },
  DAY10_PLUS: {
    token: process.env.PB_HOT_SEAT_TOKEN,
    folderId: process.env.PB_DAY10_PLUS_FOLDER_ID,
    label: "Day 10+",
  },
  TRANSFER: {
    token: process.env.PB_HOT_SEAT_TOKEN,
    folderId: process.env.PB_TRANSFER_FOLDER_ID,
    label: "Transfers",
  },
};

function getHeaders(seatKey) {
  const seat = SEATS[seatKey];
  if (!seat || !seat.token)
    throw new Error(`[PB] No token for seat: ${seatKey}`);
  return {
    Authorization: `Bearer ${seat.token}`,
    "Content-Type": "application/json",
  };
}

// ─── Age → Folder Mapping ────────────────────────────────────────────────────

/**
 * Returns the age-appropriate folder key based on stored caseAge.
 * This is the ONLY function that maps age → folder. Used by:
 *   - cascadeByAge (morning rotation)
 *   - auditTransferFolder (bounce-back)
 */
function getFolderForCaseAge(caseAge) {
  if (caseAge <= 0) return "HOT";
  if (caseAge === 1) return "DAY1";
  if (caseAge === 2) return "DAY2";
  if (caseAge <= 10) return "DAY3_10";
  return "DAY10_PLUS";
}

/**
 * Legacy helper — derives business days from a date.
 * Kept ONLY as a fallback when Mongo doc has no caseAge field
 * (pre-migration leads). New code should use lead.caseAge.
 */
function businessDaysSince(dateStr) {
  if (!dateStr) return 999;
  const created = new Date(dateStr);
  const now = new Date();
  let current = new Date(
    created.getFullYear(),
    created.getMonth(),
    created.getDate(),
  );
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const createdDay = current.getDay();
  if (createdDay === 0) current.setDate(current.getDate() + 1);
  if (createdDay === 6) current.setDate(current.getDate() + 2);

  let days = 0;
  while (current < today) {
    current.setDate(current.getDate() + 1);
    if (current.getDay() !== 0 && current.getDay() !== 6) days++;
  }
  return days;
}

// ═════════════════════════════════════════════════════════════════════════════
// TOKEN AUTO-REFRESH
// ═════════════════════════════════════════════════════════════════════════════

let refreshTimer = null;

async function refreshAccessToken() {
  const clientId = process.env.PB_CLIENT_ID;
  const clientSecret = process.env.PB_CLIENT_SECRET;
  const refreshToken = process.env.PB_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.log(
      "[PB-AUTH] Skipping refresh — missing client_id, client_secret, or refresh_token",
    );
    return false;
  }

  try {
    const res = await axios.post(
      "https://www.phoneburner.com/oauth/refreshtoken",
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );

    const {
      access_token,
      refresh_token: newRefreshToken,
      expires_in,
    } = res.data;

    for (const key of Object.keys(SEATS)) {
      SEATS[key].token = access_token;
    }

    process.env.PB_HOT_SEAT_TOKEN = access_token;
    if (newRefreshToken) {
      process.env.PB_REFRESH_TOKEN = newRefreshToken;
    }

    console.log(
      "[PB-AUTH] ✓ Token refreshed — expires in",
      expires_in,
      "seconds",
    );
    if (newRefreshToken && newRefreshToken !== refreshToken) {
      console.log("[PB-AUTH]   ⚠ NEW refresh_token issued — update your .env:");
      console.log("[PB-AUTH]   PB_REFRESH_TOKEN=" + newRefreshToken);
    }

    scheduleRefresh(expires_in);
    return true;
  } catch (err) {
    console.error(
      "[PB-AUTH] ✗ Token refresh failed:",
      err.response?.data || err.message,
    );
    return false;
  }
}

function scheduleRefresh(expiresInSeconds) {
  if (refreshTimer) clearTimeout(refreshTimer);

  const refreshMs = Math.floor(expiresInSeconds * 0.8 * 1000);
  const refreshHours = Math.round(refreshMs / 1000 / 60 / 60);

  refreshTimer = setTimeout(async () => {
    console.log("[PB-AUTH] Auto-refreshing token...");
    await refreshAccessToken();
  }, refreshMs);

  console.log(`[PB-AUTH] Next refresh in ~${refreshHours} hours`);
}

async function initTokenRefresh() {
  if (!process.env.PB_HOT_SEAT_TOKEN) {
    console.log("[PB-AUTH] No HOT seat token — skipping refresh init");
    return;
  }

  try {
    await axios.get(`${PB_BASE}/members`, {
      headers: getHeaders("HOT"),
    });
    console.log("[PB-AUTH] ✓ Current token valid");
    scheduleRefresh(5 * 24 * 60 * 60);
  } catch (err) {
    if (err.response?.status === 401) {
      console.log("[PB-AUTH] Token expired — refreshing now...");
      await refreshAccessToken();
    } else {
      console.error("[PB-AUTH] Token test error:", err.message);
    }
  }
}
/**
 * Morning cleanup: iterate all PB folders and remove any contact
 * whose Mongo record is inactive, has DNC flags, or doesn't exist.
 * Catches leads that were DNC'd overnight via text STOP, manual
 * dashboard action, or Logics status change — none of which
 * necessarily removed the PB contact in real time.
 */
async function cleanDeactivatedFromPb(LeadCadenceModel) {
  const folderKeys = ["HOT", "DAY1", "DAY2", "DAY3_10", "DAY10_PLUS"];
  let removed = 0,
    errors = 0;

  for (const folderKey of folderKeys) {
    if (!SEATS[folderKey]?.folderId) continue;

    try {
      let page = 1;
      let hasMore = true;
      let removedThisPage;

      while (hasMore) {
        const data = await getFolderContacts(folderKey, page, 100);
        const contacts = data.contacts || [];
        if (!contacts.length) break;

        removedThisPage = false;

        for (const c of contacts) {
          try {
            const mongoIdField = c.custom_fields?.find(
              (f) => f.name === "Mongo ID",
            );
            const mongoId = mongoIdField?.value;

            let shouldRemove = false;

            if (!mongoId) {
              // No Mongo ID → can't verify, leave it
              continue;
            }

            if (LeadCadenceModel) {
              const lead = await LeadCadenceModel.findById(mongoId, {
                active: 1,
                smsDnc: 1,
                rvmDnc: 1,
              }).lean();

              if (!lead) {
                // Mongo record deleted — remove from PB
                shouldRemove = true;
              } else if (!lead.active) {
                shouldRemove = true;
              }
            }

            if (shouldRemove) {
              await removeContact(c.contact_user_id, folderKey);
              removed++;
              removedThisPage = true;
              console.log(
                `[PB]   Cleaned ${c.contact_user_id} from ${folderKey} (inactive/DNC)`,
              );
            }

            await new Promise((r) => setTimeout(r, 150));
          } catch (err) {
            console.error(
              `[PB]   Cleanup error ${c.contact_user_id}: ${err.message}`,
            );
            errors++;
          }
        }

        // If we removed contacts, PB re-paginates — refetch page 1
        if (!removedThisPage) {
          const totalPages = Math.ceil(
            parseInt(data.total_results || "0") / 100,
          );
          page++;
          if (page > totalPages) hasMore = false;
        }
      }
    } catch (err) {
      console.error(`[PB] Cleanup error in ${folderKey}: ${err.message}`);
    }
  }

  return { removed, errors };
}
// ═════════════════════════════════════════════════════════════════════════════
// OAUTH ROUTES
// ═════════════════════════════════════════════════════════════════════════════

function mountOAuth(app) {
  app.get("/pb/auth", (req, res) => {
    const url = `https://www.phoneburner.com/oauth/authorize?client_id=${process.env.PB_CLIENT_ID}&redirect_uri=https://tag-webhook.ngrok.app/pb/callback&response_type=code`;
    res.redirect(url);
  });

  app.get("/pb/callback", async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("No code received");

    try {
      const response = await axios.post(
        "https://www.phoneburner.com/oauth/accesstoken",
        new URLSearchParams({
          client_id: process.env.PB_CLIENT_ID,
          client_secret: process.env.PB_CLIENT_SECRET,
          redirect_uri: "https://tag-webhook.ngrok.app/pb/callback",
          grant_type: "authorization_code",
          code,
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );

      const { access_token, refresh_token, expires_in } = response.data;

      for (const key of Object.keys(SEATS)) {
        SEATS[key].token = access_token;
      }
      process.env.PB_HOT_SEAT_TOKEN = access_token;
      if (refresh_token) process.env.PB_REFRESH_TOKEN = refresh_token;

      scheduleRefresh(expires_in);

      console.log("[PB-AUTH] ═══════════════════════════════════════");
      console.log("[PB-AUTH] ✓ ACCESS TOKEN:", access_token);
      console.log("[PB-AUTH] ✓ REFRESH TOKEN:", refresh_token);
      console.log("[PB-AUTH] ✓ EXPIRES IN:", expires_in, "seconds");
      console.log("[PB-AUTH] ═══════════════════════════════════════");

      res.send(
        `<h2>PB Auth Success</h2>` +
          `<pre>Access Token: ${access_token}\nRefresh Token: ${refresh_token}\nExpires In: ${expires_in}s</pre>` +
          `<p>Add to your .env:</p>` +
          `<pre>PB_HOT_SEAT_TOKEN=${access_token}\nPB_REFRESH_TOKEN=${refresh_token}</pre>`,
      );
    } catch (err) {
      console.error(
        "[PB-AUTH] ✗ Token exchange failed:",
        err.response?.data || err.message,
      );
      res
        .status(500)
        .send(
          `Token exchange failed: ${JSON.stringify(err.response?.data || err.message)}`,
        );
    }
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// PUSH CONTACT (intake → HOT)
// ═════════════════════════════════════════════════════════════════════════════

async function pushContact(lead, seatKey = "HOT") {
  const seat = SEATS[seatKey];
  if (!seat) throw new Error(`[PB] Unknown seat: ${seatKey}`);

  if (!seat.token || !seat.folderId) {
    console.log(`[PB] Skipping — ${seatKey} seat not configured`);
    return { success: false, error: "not configured" };
  }

  let firstName = lead.firstName || "";
  let lastName = lead.lastName || "";
  if (!firstName && lead.name) {
    const parts = lead.name.trim().split(/\s+/);
    firstName = parts[0] || "";
    lastName = parts.slice(1).join(" ") || "";
  }

  const phone = (lead.phone || "").replace(/\D/g, "");
  if (!phone) {
    console.log(`[PB] Skip — no phone for ${firstName} ${lastName}`);
    return { success: false, error: "no phone" };
  }

  const payload = {
    first_name: firstName,
    last_name: lastName,
    phone,
    email: lead.email || "",
    category_id: parseInt(seat.folderId),
    custom_fields: [
      { name: "Case ID", type: 1, value: String(lead.caseId || "") },
      { name: "Logics Database", type: 1, value: lead.company || "WYNN" },
      { name: "Source", type: 1, value: lead.source || "" },
      { name: "Mongo ID", type: 1, value: String(lead.mongoId || "") },
    ],
    duplicate_checks: { phone: true, email: false },
    on_duplicate: "update",
    tags: ["speed-to-lead"],
  };

  if (lead.city) payload.city = lead.city;
  if (lead.state) payload.state = lead.state;

  try {
    const res = await axios.post(`${PB_BASE}/contacts`, payload, {
      headers: getHeaders(seatKey),
    });
    const contactId = res.data?.contacts?.contacts?.contact_user_id;
    console.log(
      `[PB] ✓ ${seat.label}: ${firstName} ${lastName} (${phone}) → PB:${contactId}`,
    );
    return { success: true, contactId };
  } catch (err) {
    if (err.response?.status === 401) {
      console.log("[PB] Token expired mid-request — refreshing...");
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        try {
          const retry = await axios.post(`${PB_BASE}/contacts`, payload, {
            headers: getHeaders(seatKey),
          });
          const contactId = retry.data?.contacts?.contacts?.contact_user_id;
          console.log(
            `[PB] ✓ ${seat.label} (retry): ${firstName} ${lastName} → PB:${contactId}`,
          );
          return { success: true, contactId };
        } catch (retryErr) {
          const msg = retryErr.response?.data || retryErr.message;
          console.error(`[PB] ✗ Retry failed ${firstName} ${lastName}:`, msg);
          return { success: false, error: msg };
        }
      }
    }

    const msg = err.response?.data || err.message;
    const status = err.response?.status;

    if (status && status >= 500 && status < 600) {
      console.log(`[PB] ${status} from PB — retrying in 2s...`);
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const retry = await axios.post(`${PB_BASE}/contacts`, payload, {
          headers: getHeaders(seatKey),
        });
        const contactId = retry.data?.contacts?.contacts?.contact_user_id;
        console.log(
          `[PB] ✓ ${seat.label} (5xx retry): ${firstName} ${lastName} → PB:${contactId}`,
        );
        return { success: true, contactId };
      } catch (retryErr) {
        const retryMsg = retryErr.response?.data || retryErr.message;
        console.error(
          `[PB] ✗ 5xx retry failed ${firstName} ${lastName}:`,
          retryMsg,
        );
        return { success: false, error: retryMsg };
      }
    }

    console.error(`[PB] ✗ Push failed ${firstName} ${lastName}:`, msg);
    return { success: false, error: msg };
  }
}

async function pushBatch(leads, seatKey = "HOT", delayMs = 200) {
  console.log(`[PB] ── Batch: ${leads.length} → ${SEATS[seatKey]?.label} ──`);
  let pushed = 0,
    failed = 0;
  const results = [];

  for (const lead of leads) {
    const result = await pushContact(lead, seatKey);
    result.success ? pushed++ : failed++;
    results.push({ lead, result });
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  console.log(`[PB] ── Batch done: ${pushed}/${leads.length} pushed ──`);
  return { pushed, failed, total: leads.length, results };
}

// ═════════════════════════════════════════════════════════════════════════════
// LOAD UNPUSHED LEADS → HOT
// ═════════════════════════════════════════════════════════════════════════════

async function loadUnpushedLeads(LeadCadenceModel, company = "WYNN") {
  console.log(`[PB] ── Loading unpushed ${company} leads ──`);

  try {
    const leads = await LeadCadenceModel.find({
      company,
      active: true,
      pbPushed: { $ne: true },
    }).lean();

    if (!leads.length) {
      console.log(`[PB] No unpushed ${company} leads`);
      return { pushed: 0, failed: 0, total: 0 };
    }

    console.log(`[PB] Found ${leads.length} unpushed leads`);
    let pushed = 0,
      failed = 0;

    for (const doc of leads) {
      const result = await pushContact(
        {
          name: doc.name || "",
          phone: doc.phone,
          email: doc.email,
          caseId: doc.caseId,
          company: doc.company || company,
          source: doc.source,
          mongoId: doc._id.toString(),
          city: doc.city,
          state: doc.state,
        },
        "HOT",
      );

      if (result.success) {
        await LeadCadenceModel.updateOne(
          { _id: doc._id },
          {
            $set: {
              pbPushed: true,
              pbPushedAt: new Date(),
              pbContactId: result.contactId || null,
              pbCurrentFolder: "HOT",
            },
          },
        );
        pushed++;
      } else {
        failed++;
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    console.log(`[PB] ── Unpushed load: ${pushed} pushed, ${failed} failed ──`);
    return { pushed, failed, total: leads.length };
  } catch (err) {
    console.error(`[PB] Load error:`, err);
    return { pushed: 0, failed: 0, total: 0, error: err.message };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// FOLDER CASCADE HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Drain ALL contacts from one PB folder into another.
 * Used for simple cascades where no age check is needed.
 */
async function cascadeFolder(fromKey, toKey, LeadCadenceModel) {
  const fromSeat = SEATS[fromKey];
  const toSeat = SEATS[toKey];

  if (!fromSeat?.folderId || !toSeat?.folderId) {
    console.log(`[PB] Cascade skip — ${fromKey} or ${toKey} not configured`);
    return { moved: 0, errors: 0 };
  }

  let moved = 0,
    errors = 0;

  try {
    while (true) {
      const data = await getFolderContacts(fromKey, 1, 100);
      const contacts = data.contacts || [];
      if (!contacts.length) break;

      for (const c of contacts) {
        try {
          await moveContact(c.contact_user_id, toSeat.folderId, fromKey);

          if (LeadCadenceModel) {
            const mongoIdField = c.custom_fields?.find(
              (f) => f.name === "Mongo ID",
            );
            if (mongoIdField?.value) {
              await LeadCadenceModel.updateOne(
                { _id: mongoIdField.value },
                { $set: { pbCurrentFolder: toKey } },
              ).catch(() => {});
            }
          }

          moved++;
          await new Promise((r) => setTimeout(r, 150));
        } catch (err) {
          console.error(
            `[PB] Cascade error ${c.contact_user_id}:`,
            err.message,
          );
          errors++;
        }
      }
    }
  } catch (err) {
    console.error(`[PB] Cascade ${fromKey} → ${toKey} error:`, err.message);
  }

  return { moved, errors };
}

/**
 * Age-gated cascade: only move contacts whose stored caseAge
 * meets the minimum threshold. Uses lead.caseAge from Mongo
 * (NOT derived from createdAt).
 *
 * Falls back to businessDaysSince(createdAt) for pre-migration
 * leads that don't have caseAge set yet.
 */
async function cascadeByAge(fromKey, toKey, minCaseAge, LeadCadenceModel) {
  const fromSeat = SEATS[fromKey];
  const toSeat = SEATS[toKey];

  if (!fromSeat?.folderId || !toSeat?.folderId) {
    console.log(
      `[PB] Age cascade skip — ${fromKey} or ${toKey} not configured`,
    );
    return { moved: 0, skipped: 0, errors: 0 };
  }

  let moved = 0,
    skipped = 0,
    errors = 0;

  try {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const data = await getFolderContacts(fromKey, page, 100);
      const contacts = data.contacts || [];
      if (!contacts.length) break;

      let movedThisPage = false;

      for (const c of contacts) {
        try {
          const mongoIdField = c.custom_fields?.find(
            (f) => f.name === "Mongo ID",
          );
          const mongoId = mongoIdField?.value;

          let shouldMove = true; // default: move if we can't determine age

          if (mongoId && LeadCadenceModel) {
            const lead = await LeadCadenceModel.findById(mongoId, {
              caseAge: 1,
              createdAt: 1,
            }).lean();

            if (lead) {
              // Use stored caseAge if available, fall back to derived
              const age =
                lead.caseAge != null
                  ? lead.caseAge
                  : businessDaysSince(lead.createdAt);

              if (age < minCaseAge) {
                shouldMove = false;
                skipped++;
              }
            }
          }

          if (shouldMove) {
            await moveContact(c.contact_user_id, toSeat.folderId, fromKey);

            if (mongoId && LeadCadenceModel) {
              await LeadCadenceModel.updateOne(
                { _id: mongoId },
                { $set: { pbCurrentFolder: toKey } },
              ).catch(() => {});
            }

            moved++;
            movedThisPage = true;
          }

          await new Promise((r) => setTimeout(r, 150));
        } catch (err) {
          console.error(
            `[PB] Age cascade error ${c.contact_user_id}:`,
            err.message,
          );
          errors++;
        }
      }

      if (!movedThisPage) {
        const totalPages = Math.ceil(parseInt(data.total_results || "0") / 100);
        page++;
        if (page > totalPages) hasMore = false;
      }
    }
  } catch (err) {
    console.error(`[PB] Age cascade ${fromKey} → ${toKey} error:`, err.message);
  }

  return { moved, skipped, errors };
}

// ═════════════════════════════════════════════════════════════════════════════
// TRANSFER AUDIT
// ═════════════════════════════════════════════════════════════════════════════

async function auditTransferFolder(LeadCadenceModel) {
  const transferFolderId = SEATS.TRANSFER?.folderId;
  if (!transferFolderId) {
    console.log("[PB] TRANSFER audit skipped — folder not configured");
    return { bounced: 0, removed: 0, errors: 0 };
  }

  let bounced = 0,
    removed = 0,
    auditErrors = 0;

  try {
    while (true) {
      const data = await getFolderContacts("TRANSFER", 1, 100);
      const contacts = data.contacts || [];
      if (!contacts.length) break;

      for (const c of contacts) {
        try {
          const caseIdField = c.custom_fields?.find(
            (f) => f.name === "Case ID",
          );
          const domainField = c.custom_fields?.find(
            (f) => f.name === "Logics Database",
          );
          const mongoIdField = c.custom_fields?.find(
            (f) => f.name === "Mongo ID",
          );
          const caseId = caseIdField?.value;
          const domain = (domainField?.value || "WYNN").toUpperCase();
          const mongoId = mongoIdField?.value;

          let converted = false;
          if (caseId) {
            const info = await fetchCaseInfo(domain, parseInt(caseId));
            if (info.ok && info.status !== 2) {
              converted = true;
            }
          }

          if (converted) {
            await removeContact(c.contact_user_id, "TRANSFER");
            console.log(`[PB]   Case ${caseId} converted → removed from PB`);
            removed++;
          } else {
            // Bounce back to age-appropriate folder
            let targetFolder = "DAY1"; // fallback

            if (mongoId && LeadCadenceModel) {
              const lead = await LeadCadenceModel.findById(mongoId, {
                caseAge: 1,
                createdAt: 1,
                pbPreviousFolder: 1,
              }).lean();

              if (
                lead?.pbPreviousFolder &&
                SEATS[lead.pbPreviousFolder]?.folderId
              ) {
                targetFolder = lead.pbPreviousFolder;
              } else if (lead) {
                // Use stored caseAge, fall back to derived
                const age =
                  lead.caseAge != null
                    ? lead.caseAge
                    : businessDaysSince(lead.createdAt);
                targetFolder = getFolderForCaseAge(age);
              }
            }

            const targetFolderId = SEATS[targetFolder]?.folderId;
            if (targetFolderId) {
              await moveContact(c.contact_user_id, targetFolderId, "TRANSFER");
              if (mongoId && LeadCadenceModel) {
                await LeadCadenceModel.updateOne(
                  { _id: mongoId },
                  {
                    $set: { pbCurrentFolder: targetFolder },
                    $unset: { pbPreviousFolder: 1 },
                  },
                ).catch(() => {});
              }
              console.log(
                `[PB]   Case ${caseId || "?"} still active → ${targetFolder}`,
              );
              bounced++;
            } else {
              console.warn(
                `[PB]   Case ${caseId || "?"} — no target folder for ${targetFolder}, leaving in TRANSFER`,
              );
            }
          }

          await new Promise((r) => setTimeout(r, 150));
        } catch (err) {
          console.error(
            `[PB]   Transfer audit error ${c.contact_user_id}:`,
            err.message,
          );
          auditErrors++;
        }
      }
    }
  } catch (err) {
    console.error("[PB] TRANSFER audit error:", err.message);
  }

  return { bounced, removed, errors: auditErrors };
}

// ═════════════════════════════════════════════════════════════════════════════
// 7AM MORNING ROTATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Full morning rotation using stored caseAge thresholds:
 *   1. Audit TRANSFER
 *   2. DAY3_10 → DAY10_PLUS (caseAge 10+)
 *   3. DAY2 → DAY3_10 (caseAge 3+)
 *   4. DAY1 → DAY2 (caseAge 2+)
 *   5. HOT  → DAY1 (caseAge 1+)
 *   6. Load unpushed → HOT
 *
 * ORDER: oldest-first so nothing jumps two levels.
 */
async function morningRotation(LeadCadenceModel, company = "WYNN") {
  console.log("[PB] ══════════════════════════════════════════════════");
  console.log("[PB] 7am Morning Rotation — caseAge Cascade");
  console.log("[PB] ══════════════════════════════════════════════════");

  // Step 1: Audit TRANSFER
  console.log("[PB] Step 1: Auditing TRANSFER folder...");
  const step1 = await auditTransferFolder(LeadCadenceModel);
  console.log(
    `[PB] ✓ TRANSFER: ${step1.bounced} bounced back, ${step1.removed} removed, ${step1.errors} errors`,
  );

  // Step 2: DAY3_10 → DAY10_PLUS (caseAge 10+)
  console.log("[PB] Step 2: DAY3_10 → DAY10_PLUS (caseAge 10+)...");
  const step2 = await cascadeByAge(
    "DAY3_10",
    "DAY10_PLUS",
    10,
    LeadCadenceModel,
  );
  console.log(
    `[PB] ✓ ${step2.moved} moved, ${step2.skipped} too young, ${step2.errors} errors`,
  );

  // Step 3: DAY2 → DAY3_10 (caseAge 3+)
  console.log("[PB] Step 3: DAY2 → DAY3_10 (caseAge 3+)...");
  const step3 = await cascadeByAge("DAY2", "DAY3_10", 3, LeadCadenceModel);
  console.log(
    `[PB] ✓ ${step3.moved} moved, ${step3.skipped} too young, ${step3.errors} errors`,
  );

  // Step 4: DAY1 → DAY2 (caseAge 2+)
  console.log("[PB] Step 4: DAY1 → DAY2 (caseAge 2+)...");
  const step4 = await cascadeByAge("DAY1", "DAY2", 2, LeadCadenceModel);
  console.log(
    `[PB] ✓ ${step4.moved} moved, ${step4.skipped} too young, ${step4.errors} errors`,
  );

  // Step 5: HOT → DAY1 (caseAge 1+)
  console.log("[PB] Step 5: HOT → DAY1 (caseAge 1+)...");
  const step5 = await cascadeByAge("HOT", "DAY1", 1, LeadCadenceModel);
  console.log(
    `[PB] ✓ ${step5.moved} moved, ${step5.skipped} still fresh, ${step5.errors} errors`,
  );

  // Step 6: Load unpushed → HOT
  console.log("[PB] Step 6: Loading unpushed leads into HOT...");
  const step6 = await loadUnpushedLeads(LeadCadenceModel, company);
  console.log(`[PB] ✓ ${step6.pushed} loaded into HOT`);
  const step7 = await cleanDeactivatedFromPb(LeadCadenceModel);
  console.log("[PB] ══════════════════════════════════════════════════");
  console.log("[PB] Morning Rotation Summary:");
  console.log(
    `[PB]   TRANSFER audit:     ${step1.bounced} back, ${step1.removed} removed`,
  );
  console.log(
    `[PB]   DAY3_10 → DAY10+:   ${step2.moved} aged out, ${step2.skipped} too young`,
  );
  console.log(
    `[PB]   DAY2 → DAY3_10:     ${step3.moved} moved, ${step3.skipped} too young`,
  );
  console.log(
    `[PB]   DAY1 → DAY2:        ${step4.moved} moved, ${step4.skipped} too young`,
  );
  console.log(
    `[PB]   HOT → DAY1:         ${step5.moved} moved, ${step5.skipped} still fresh`,
  );
  console.log(`[PB]   Unpushed → HOT:     ${step6.pushed}`);
  console.log("[PB] ══════════════════════════════════════════════════");

  return {
    transfer: step1,
    day3_10_to_day10_plus: step2,
    day2_to_day3_10: step3,
    day1_to_day2: step4,
    hot_to_day1: step5,
    unpushed_to_hot: step6,
    cleanup: step7,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CALLDONE HANDLER
// ═════════════════════════════════════════════════════════════════════════════

const DNC_KEYS = [
  "YELLOW_DNC",
  "BAD_NUMBER",
  "BAD_NUMBER_YELLOW",
  "AS_DNC",
  "DNC",
];

let actionLog = [];

function mountCallDone(app) {
  app.post("/pb/calldone", async (req, res) => {
    const { status, contact, custom_fields, duration, connected } = req.body;

    const domain = (custom_fields?.["Logics Database"] || "WYNN")
      .toString()
      .toUpperCase();
    const caseId = parseInt(custom_fields?.["Case ID"]);
    const mongoId = custom_fields?.["Mongo ID"];
    const pbContactId = contact?.user_id;
    const key = (status || "").replace(/\s+/g, "_").toUpperCase();

    console.log(
      `[PB-DONE] ${domain} Case:${caseId} "${status}" ${connected === "1" ? "LIVE" : "no-answer"} ${duration || 0}s`,
    );

    try {
      if (DNC_KEYS.includes(key)) {
        // Full deactivation: Logics 173 + Mongo + PB removal
        const phone10 = (contact?.phone || "").replace(/\D/g, "");
        await deactivateLead({
          phone:
            phone10.length === 11 && phone10.startsWith("1")
              ? phone10.slice(1)
              : phone10,
          company: domain,
          reason: "pb-dnc",
          updateLogics: true,
          caseId: caseId ? String(caseId) : null,
          mongoId: mongoId || null,
        }).catch((err) =>
          console.error(`[PB-DONE] Deactivation error: ${err.message}`),
        );
        actionLog.push({ domain, caseId, action: "status:DNC" });
      } else if (key === "TRANSFER") {
        const transferFolder = SEATS.TRANSFER?.folderId;
        if (pbContactId && transferFolder) {
          if (mongoId) {
            const LeadCadence = require("../models/LeadCadence");
            const lead = await LeadCadence.findById(mongoId, {
              pbCurrentFolder: 1,
            }).lean();
            if (lead?.pbCurrentFolder) {
              await LeadCadence.updateOne(
                { _id: mongoId },
                {
                  $set: {
                    pbPreviousFolder: lead.pbCurrentFolder,
                    pbCurrentFolder: "TRANSFER",
                  },
                },
              ).catch(() => {});
            }
          }

          await moveContact(pbContactId, transferFolder, "HOT").catch(() => {});
          console.log(`[PB-DONE] → Moved ${pbContactId} to TRANSFER`);
        }
        actionLog.push({ domain, caseId, action: "transfer" });
      }

      if (mongoId) {
        const LeadCadence = require("../models/LeadCadence");
        await LeadCadence.updateOne(
          { _id: mongoId },
          { $inc: { pbDialCount: 1 }, $set: { pbLastDialedAt: new Date() } },
        ).catch((err) =>
          console.error(`[PB-DONE] Dial count update failed:`, err.message),
        );
      }

      if (caseId) {
        await createActivityLoop(domain, caseId, `PB: ${status}`);
        actionLog.push({ domain, caseId, action: `activity:${key}` });
      }

      return res.sendStatus(200);
    } catch (err) {
      console.error("[PB-DONE] Error:", err);
      return res.sendStatus(500);
    }
  });
}

function getActionLog() {
  return actionLog;
}
function clearActionLog() {
  const copy = [...actionLog];
  actionLog = [];
  return copy;
}

// ═════════════════════════════════════════════════════════════════════════════
// PB CONTACT REMOVAL
// ═════════════════════════════════════════════════════════════════════════════

async function removePbContact(pbContactId) {
  if (!pbContactId) return { success: false, error: "no pbContactId" };
  return removeContact(pbContactId, "HOT");
}

// ═════════════════════════════════════════════════════════════════════════════
// FOLDER HELPERS
// ═════════════════════════════════════════════════════════════════════════════

async function getFolderContacts(seatKey, page = 1, pageSize = 100) {
  const seat = SEATS[seatKey];
  const res = await axios.get(`${PB_BASE}/contacts`, {
    headers: getHeaders(seatKey),
    params: {
      category_id: seat.folderId,
      page,
      page_size: pageSize,
      sort_order: "DESC",
    },
  });
  return res.data?.contacts || {};
}

async function getFolderCount(seatKey) {
  const data = await getFolderContacts(seatKey, 1, 1);
  return parseInt(data.total_results || "0");
}

async function getFolders(seatKey = "HOT") {
  const res = await axios.get(`${PB_BASE}/folders`, {
    headers: getHeaders(seatKey),
    params: { structure: 1 },
  });
  return res.data?.folders || {};
}

async function removeContact(contactId, seatKey = "HOT") {
  try {
    await axios.delete(`${PB_BASE}/contacts/${contactId}`, {
      headers: getHeaders(seatKey),
    });
    console.log(`[PB] ✓ Removed ${contactId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function moveContact(contactId, newFolderId, seatKey = "HOT") {
  try {
    await axios.put(
      `${PB_BASE}/contacts/${contactId}`,
      { category_id: parseInt(newFolderId) },
      { headers: getHeaders(seatKey) },
    );
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function getUsageStats(dateStart, dateEnd, seatKey = "HOT") {
  const res = await axios.get(`${PB_BASE}/dialsession/usage`, {
    headers: getHeaders(seatKey),
    params: { date_start: dateStart, date_end: dateEnd },
  });
  return res.data?.usage || {};
}

async function setConnectMe(phoneNumber, seatKey = "HOT") {
  const res = await axios.put(
    `${PB_BASE}/dialsession/settings`,
    { connectme_preset: phoneNumber.replace(/\D/g, "") },
    { headers: getHeaders(seatKey) },
  );
  console.log(`[PB] ✓ ConnectMe → ${phoneNumber} on ${seatKey}`);
  return res.data?.settings || {};
}

// ═════════════════════════════════════════════════════════════════════════════

module.exports = {
  pushContact,
  pushBatch,
  loadUnpushedLeads,
  morningRotation,
  cascadeFolder,
  cascadeByAge,
  auditTransferFolder,
  mountCallDone,
  mountOAuth,
  initTokenRefresh,
  refreshAccessToken,
  getFolderContacts,
  getFolderCount,
  getFolders,
  removeContact,
  cleanDeactivatedFromPb,
  moveContact,
  removePbContact,
  getFolderForCaseAge,
  businessDaysSince,
  getUsageStats,
  setConnectMe,
  getActionLog,
  clearActionLog,
  SEATS,
};
