// services/smsContent.js
// ─────────────────────────────────────────────────────────────
// All prospect SMS content lives here.
// The webhook and cadence engine both call getSmsContent()
// to get the right message for the sequence number.
//
// Chain: 3 texts over 3 days
//   Text 1 (Day 0): Welcome — brochure link
//   Text 2 (Day 1): Value prop — consultation nudge
//   Text 3 (Day 2): Urgency — final push
// ─────────────────────────────────────────────────────────────

const LOCAL_PHONE = "310-561-1009";
const TOLL_FREE = "866-770-3749";
const BROCHURE_URL = "https://www.wynntaxsolutions.com/services-brochure";

/**
 * Get SMS content for a given sequence number.
 *
 * @param {string} name - Prospect's first name
 * @param {string} scheduleUrl - Calendly or scheduling link
 * @param {number} textNumber - 1, 2, or 3
 * @returns {string} SMS body text
 */
function getSmsContent(name, scheduleUrl, textNumber = 1) {
  const greeting = name || "there";

  switch (textNumber) {
    // ── TEXT 1: Welcome ─────────────────────────────────────
    case 1:
      return (
        `Hi ${greeting}! Thanks for your interest in Wynn Tax Solutions. ` +
        `Learn how we can help resolve your tax situation: ${BROCHURE_URL}\n\n` +
        `Questions? Call us: ${LOCAL_PHONE}`
      );

    // ── TEXT 2: Value / Consultation ────────────────────────
    case 2:
      return (
        `Hi ${greeting}, it's Wynn Tax Solutions. Our team has helped thousands ` +
        `of clients resolve IRS and state tax issues. We'd love to do the same for you.\n\n` +
        `Schedule a free, no-obligation consultation: ${scheduleUrl}\n\n` +
        `Or call us: ${TOLL_FREE}`
      );

    // ── TEXT 3: Urgency / Final ─────────────────────────────
    case 3:
      return (
        `Hi ${greeting}, just a final check-in from Wynn Tax Solutions. ` +
        `Tax issues can escalate quickly — penalties and interest add up daily. ` +
        `A quick call with our team can help you understand your options.\n\n` +
        `Book a free consultation: ${scheduleUrl}\n` +
        `Call: ${TOLL_FREE}\n\n` +
        `We're here whenever you're ready.`
      );

    // Fallback (shouldn't happen, but safe)
    default:
      return (
        `Hi ${greeting}, Wynn Tax Solutions is here to help with your tax situation. ` +
        `Call us anytime: ${TOLL_FREE}`
      );
  }
}

module.exports = {
  getSmsContent,
  LOCAL_PHONE,
  TOLL_FREE,
  BROCHURE_URL,
};
