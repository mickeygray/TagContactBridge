// services/smsContent.js
// ─────────────────────────────────────────────────────────────
// All prospect SMS content lives here.
// Company-aware: pass company key to get branded messages.
//
// Chain: 5 texts over ~7 days
//   Text 1 (Day 0, immediate):   Acknowledge request, establish credibility
//   Text 2 (Day 0, 30-60 min):   IRS consequences, urgency
//   Text 3 (Day 1):              Time-sensitive, penalties growing
//   Text 4 (Day 3):              Specific relief options, direct CTA
//   Text 5 (Day 7):              Final — window closing
//
// NOTE: CallRail automatically appends "Reply STOP to opt out"
//       so we do NOT include it in the message body.
// ─────────────────────────────────────────────────────────────

const { getCompanyConfig } = require("../../shared/config/companyConfig");

/**
 * Normalize a first name: "JOHN DOE" → "John", "jane" → "Jane"
 */
function formatFirstName(raw) {
  if (!raw || typeof raw !== "string") return "";
  const first = raw.trim().split(/\s+/)[0];
  if (!first) return "";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/**
 * Get SMS content for a given sequence number.
 *
 * @param {string} name - Prospect's full name (will extract first name)
 * @param {string} scheduleUrl - Calendly or scheduling link
 * @param {number} textNumber - 1 through 5
 * @param {string} [company="wynn"] - Company key
 * @returns {string} SMS body text
 */
function getSmsContent(name, scheduleUrl, textNumber = 1, company = "wynn") {
  const firstName = formatFirstName(name) || "there";
  const config = getCompanyConfig(company);
  const co = config.name;
  const phone = config.localPhone || config.tollFreePhone || "";

  switch (textNumber) {
    case 1:
      return (
        `${firstName}, this is ${co}. We received your request for tax relief assistance. ` +
        `The IRS adds penalties and interest daily — the sooner we review your case, the more options you have.\n\n` +
        `Call us now: ${phone}`
      );
    case 2:
      return (
        `${firstName}, following up from ${co}. ` +
        `If you owe the IRS, they can garnish wages, levy bank accounts, and file liens without warning. ` +
        `We may be able to reduce what you owe or stop collections.\n\n` +
        `Speak with our team today: ${phone}`
      );
    case 3:
      return (
        `${firstName}, ${co} here. Penalties on your tax debt are compounding daily. ` +
        `Our clients have saved thousands by acting quickly — some qualify to settle for a fraction of what they owe.\n\n` +
        `Don't wait. Call us: ${phone}`
      );
    case 4:
      return (
        `${firstName}, this is ${co}. You may qualify for an Offer in Compromise, installment agreement, or penalty abatement — ` +
        `but these programs have deadlines and eligibility requirements.\n\n` +
        `Let us review your case before your options narrow: ${phone}`
      );
    case 5:
      return (
        `${firstName}, this is our final follow-up from ${co}. ` +
        `Every day without a resolution plan is another day the IRS has the upper hand. ` +
        `If you want to take control of your tax situation, we're ready to help.\n\n` +
        `${phone}`
      );
    default:
      return (
        `${firstName}, ${co} is ready to help resolve your tax situation. ` +
        `The IRS won't wait — neither should you.\n\n` +
        `Call us: ${phone}`
      );
  }
}

module.exports = {
  getSmsContent,
  formatFirstName,
};
