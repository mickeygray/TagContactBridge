// services/validationService.js
const axios = require("axios");

const REAL_VALIDATION_BASE = process.env.REAL_VALIDATION_URL;
const REAL_VALIDATION_TOKEN = process.env.REAL_VALIDATION_API_KEY;
const NEVERBOUNCE_KEY = process.env.NEVERBOUNCE_API_KEY;
const NEVERBOUNCE_ROUTE =
  process.env.NEVERBOUNCE_ROUTE ||
  "https://api.neverbounce.com/v4/single/check";

/* -------------------------------------------------------------------------- */
/*                        REALPHONEVALIDATION (DNCPlus)                       */
/* -------------------------------------------------------------------------- */

/**
 * Validate a single phone number via RealPhoneValidation DNCPlus API.
 *
 * DNCPlus Response fields:
 *   - status: "connected" | "disconnected" | "unknown"
 *   - error_text: {} or error message
 *   - iscell: "Y" | "N"
 *   - national_dnc: "Y" | "N"
 *   - state_dnc: "Y" | "N"
 *   - dma: "Y" | "N" (Direct Marketing Association DNC)
 *   - litigator: "Y" | "N" (known TCPA litigator)
 *
 * @param {string} phone - 10-digit phone number
 * @returns {object} Normalized validation result
 */
async function validatePhone(phone) {
  if (!phone) {
    return { phone, error: "No phone provided", isValid: false };
  }

  // Strip to digits only
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length !== 10) {
    return { phone, error: "Invalid phone length", isValid: false };
  }

  try {
    const params = {
      phone: digits,
      token: REAL_VALIDATION_TOKEN,
      output: "json",
    };

    const { data } = await axios.get(REAL_VALIDATION_BASE, { params });

    // Normalize response
    const result = {
      phone: digits,
      raw: data,

      // Connection status
      status: data.status || "unknown",
      isConnected: data.status === "connected",

      // Phone type
      isCell: data.iscell === "Y",

      // DNC flags
      onNationalDNC: data.national_dnc === "Y",
      onStateDNC: data.state_dnc === "Y",
      onDMA: data.dma === "Y",

      // Risk flags
      isLitigator: data.litigator === "Y",

      // Overall validity for our purposes
      // Valid = connected + is cell + not litigator
      // Note: DNC doesn't apply to opt-in leads
      isValid: data.status === "connected",
      canText: data.status === "connected" && data.iscell === "Y",
      canCall: data.status === "connected" && data.litigator !== "Y",

      // Error handling
      error:
        data.error_text && Object.keys(data.error_text).length > 0
          ? data.error_text
          : null,
    };

    console.log(
      `[VALIDATION] Phone ${digits}: status=${result.status}, isCell=${result.isCell}, DNC=${result.onNationalDNC}, litigator=${result.isLitigator}`,
    );

    return result;
  } catch (err) {
    console.error(
      `[VALIDATION] Phone ${digits} error:`,
      err.response?.data || err.message,
    );
    return {
      phone: digits,
      error: err.response?.data || err.message,
      isValid: false,
      canText: false,
      canCall: false,
    };
  }
}

/**
 * Validate multiple phone numbers sequentially.
 * Rate limited to 10/second per API docs.
 *
 * @param {string[]} phones - Array of phone numbers
 * @returns {object[]} Array of validation results
 */
async function validatePhones(phones) {
  const results = [];
  for (const phone of phones) {
    const validation = await validatePhone(phone);
    results.push(validation);

    // Rate limit: max 10/second, so wait 100ms between calls
    await new Promise((r) => setTimeout(r, 100));
  }
  return results;
}

/* -------------------------------------------------------------------------- */
/*                              NEVERBOUNCE                                   */
/* -------------------------------------------------------------------------- */

/**
 * Validate a single email via NeverBounce API.
 *
 * NeverBounce Response fields:
 *   - status: "success" | "error"
 *   - result: "valid" | "invalid" | "disposable" | "catchall" | "unknown"
 *   - flags: ["has_dns", "has_dns_mx", ...]
 *   - suggested_correction: "" or suggested email
 *   - execution_time: ms
 *
 * Result interpretation:
 *   - valid: Safe to send
 *   - invalid: Will bounce - DON'T SEND
 *   - disposable: Temporary email - DON'T SEND
 *   - catchall: Accept-all domain - risky but often valid
 *   - unknown: Couldn't verify - allow to proceed
 *
 * @param {string} email - Email address to validate
 * @returns {object} Normalized validation result
 */
async function validateEmail(email) {
  if (!email) {
    return { email, error: "No email provided", isValid: false };
  }

  try {
    const url = `${NEVERBOUNCE_ROUTE}?key=${NEVERBOUNCE_KEY}&email=${encodeURIComponent(email)}`;
    const { data } = await axios.get(url);

    // Check API status first
    if (data.status !== "success") {
      console.error(`[VALIDATION] NeverBounce API error:`, data);
      return {
        email,
        error: data.message || "API error",
        isValid: false,
        result: "error",
      };
    }

    const result = data.result;

    // Normalize response
    const validation = {
      email,
      raw: data,

      // Result code
      result: result,

      // Interpretation
      isValid: result === "valid",
      isInvalid: result === "invalid",
      isDisposable: result === "disposable",
      isCatchall: result === "catchall",
      isUnknown: result === "unknown",

      // Flags
      flags: data.flags || [],
      hasDNS: (data.flags || []).includes("has_dns"),
      hasMX: (data.flags || []).includes("has_dns_mx"),

      // Suggestion
      suggestedCorrection: data.suggested_correction || null,

      // Safe to send?
      // Allow: valid, catchall, unknown
      // Block: invalid, disposable
      canSend: ["valid", "catchall", "unknown"].includes(result),

      error: null,
    };

    console.log(
      `[VALIDATION] Email ${email}: result=${result}, canSend=${validation.canSend}`,
    );

    return validation;
  } catch (err) {
    console.error(
      `[VALIDATION] Email ${email} error:`,
      err.response?.data || err.message,
    );
    return {
      email,
      error: err.response?.data || err.message,
      result: "error",
      isValid: false,
      canSend: false,
    };
  }
}

/**
 * Validate multiple emails sequentially.
 *
 * @param {string[]} emails - Array of email addresses
 * @returns {object[]} Array of validation results
 */
async function validateEmails(emails) {
  const results = [];
  for (const email of emails) {
    const validation = await validateEmail(email);
    results.push(validation);

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 50));
  }
  return results;
}

/* -------------------------------------------------------------------------- */
/*                         COMBINED VALIDATION                                */
/* -------------------------------------------------------------------------- */

/**
 * Validate both phone and email for a lead.
 *
 * @param {object} lead - { phone, email }
 * @returns {object} Combined validation results
 */
async function validateLead(lead) {
  const [phoneResult, emailResult] = await Promise.all([
    lead.phone ? validatePhone(lead.phone) : Promise.resolve(null),
    lead.email ? validateEmail(lead.email) : Promise.resolve(null),
  ]);

  return {
    phone: phoneResult,
    email: emailResult,

    // Summary
    phoneValid: phoneResult?.isConnected || false,
    phoneIsCell: phoneResult?.isCell || false,
    phoneCanCall: phoneResult?.canCall || false,
    phoneCanText: phoneResult?.canText || false,

    emailValid: emailResult?.isValid || false,
    emailCanSend: emailResult?.canSend || false,
    emailResult: emailResult?.result || null,
  };
}

module.exports = {
  validatePhone,
  validatePhones,
  validateEmail,
  validateEmails,
  validateLead,
};
