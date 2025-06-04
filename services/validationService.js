// services/validationService.js
const axios = require("axios");
const client = new NeverBounce({ apiKey: process.env.NEVERBOUNCE_API_KEY });
const BASE = process.env.REAL_VALIDATION_URL;
const TOKEN = process.env.REAL_VALIDATION_API_KEY;

/**
 * Validate a single 10‑digit phone number against DNCPlus.
 * Returns an object that always includes the original phone.
 */
async function validatePhone(phone) {
  const params = { phone, token: TOKEN, output: "json" };
  const { data } = await axios.get(BASE, { params });
  // attach the phone so callers never lose track of which number this is
  return Object.assign({ phone }, data);
}

/**
 * Validate an array of phone numbers sequentially,
 * so you can reliably match each result to its input.
 */
async function validatePhones(phones) {
  const results = [];
  for (const phone of phones) {
    try {
      const validation = await validatePhone(phone);
      results.push(validation);
    } catch (err) {
      // on error, still include the phone and the error message
      results.push({ phone, error: err.message });
    }
  }
  return results;
}

async function validateEmail(email) {
  try {
    const result = await client.single.check(email);
    // NeverBounce "result" property is 0 for valid
    return result.result === 0; // 0 = valid, 1 = invalid, 2 = disposable, etc.
  } catch (err) {
    console.warn(`Email validation error (${email}): ${err.message}`);
    return false;
  }
}

module.exports = {
  validatePhone,
  validateEmail,
  validatePhones,
};
