// utils/verifyClientStatus.js

// Pull in the core Logics service helpers
const {
  fetchInvoices,
  fetchPastDueAmount,
  fetchActivities,
} = require("../services/logicsService");

// Mongoose Client model for DB writes
const Client = require("../models/Client");

/**
 * 1️⃣ Check invoice count & last-amount mismatch.
 *    If client has been contacted before and mismatch occurs,
 *    mark client.status = 'inReview' and set reviewDate.
 */
async function checkInvoiceMismatch(client) {
  if (!client.lastContactDate) {
    return client;
  }
  try {
    const invoices = await fetchInvoices(client.caseNumber, client.domain);
    const currentCount = invoices.length;
    const lastAmount = invoices.at(-1)?.Amount || 0;

    if (
      client.invoiceCount !== currentCount ||
      client.lastInvoiceAmount !== lastAmount
    ) {
      client.status = "inReview";
      client.reviewDate = new Date();
    }
  } catch (err) {
    console.error(`Invoice mismatch error for ${client.caseNumber}:`, err);
  }
  return client;
}

/**
 * 2️⃣ Flag & update delinquent clients via past-due API.
 *    Only runs for clients previously contacted.
 */
async function flagAndUpdateDelinquent(client) {
  if (!client.lastContactDate) {
    return client;
  }
  try {
    const pastDue = await fetchPastDueAmount(client.caseNumber, client.domain);
    if (pastDue > 0) {
      client.status = "inReview";
      client.reviewDate = new Date();
      client.delinquentAmount = pastDue;
      client.delinquentDate = new Date();
    }
  } catch (err) {
    console.error(`Delinquent check error for ${client.caseNumber}:`, err);
  }
  return client;
}

/**
 * 3️⃣ Review only status-change activities and flag “inReview” if needed.
 *    Only runs for clients previously contacted.
 */
async function reviewClientContact(client) {
  if (!client.lastContactDate) {
    return client;
  }
  try {
    const activities = await fetchActivities(client.caseNumber, client.domain);
    const lastContact = new Date(client.lastContactDate);

    if (Array.isArray(activities) && lastContact) {
      const flagged = activities.some((act) => {
        const created = new Date(act.CreatedDate);
        if (created <= lastContact) return false;
        const text = `${act.Subject || ""} ${act.Comment || ""}`.toLowerCase();
        return text.includes("status changed");
      });
      if (flagged) {
        client.status = "inReview";
        client.reviewDate = new Date();
      }
    }
  } catch (err) {
    console.error(`Activity review error for ${client.caseNumber}:`, err);
  }
  return client;
}

/**
 * Chain the three status checks in order and persist changes.
 * @param {Object} client - plain object representing a client
 */
async function verifyClientStatus(client) {
  let updated = { ...client };
  updated = await checkInvoiceMismatch(updated);
  updated = await flagAndUpdateDelinquent(updated);
  updated = await reviewClientContact(updated);

  // Persist any changes
  try {
    await Client.updateOne(
      { _id: updated._id },
      {
        $set: {
          status: updated.status,
          reviewDate: updated.reviewDate,
          delinquentAmount: updated.delinquentAmount,
          delinquentDate: updated.delinquentDate,
        },
      }
    );
  } catch (err) {
    console.error(`Failed to persist updates for ${updated.caseNumber}:`, err);
  }

  return updated;
}

module.exports = {
  checkInvoiceMismatch,
  flagAndUpdateDelinquent,
  reviewClientContact,
  verifyClientStatus,
};
