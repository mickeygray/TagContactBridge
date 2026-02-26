/**
 * prospectListCleaner.js
 *
 * Clean prospect lists using RealValidation (DNC) and NeverBounce (email).
 */

const {
  validatePhone,
  validateEmail,
} = require("../services/validationService");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Clean prospect phones - DNC + cell verification
 */
async function cleanProspectPhones(contacts) {
  const clean = [];
  const removed = [];

  console.log(`[phones] starting cleanup: ${contacts.length} contacts`);

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    const phone = (contact.phone || contact.cell || "").replace(/\D/g, "");

    // progress log every 100 records
    if ((i + 1) % 100 === 0) {
      console.log(
        `[phones] progress ${i + 1}/${contacts.length} | clean=${
          clean.length
        } removed=${removed.length}`
      );
    }

    if (phone.length !== 10) {
      removed.push({ ...contact, reason: "Invalid phone (not 10 digits)" });
      console.log(`[phones] removed (invalid phone): ${phone || "(blank)"}`);
      continue;
    }

    try {
      const result = await validatePhone(phone);

      if (result.national_dnc === "Y" || result.state_dnc === "Y") {
        removed.push({ ...contact, reason: "On DNC list" });
        console.log(`[phones] removed (DNC): ${phone}`);
        continue;
      }

      if (result.iscell !== "Y") {
        removed.push({ ...contact, reason: "Not a cell phone" });
        console.log(`[phones] removed (not cell): ${phone}`);
        continue;
      }

      if (["disconnected", "invalid-phone", "ERROR"].includes(result.status)) {
        removed.push({ ...contact, reason: `Phone: ${result.status}` });
        console.log(`[phones] removed (${result.status}): ${phone}`);
        continue;
      }

      clean.push({ ...contact, phone });
    } catch (err) {
      removed.push({ ...contact, reason: `Error: ${err.message}` });
      console.error(`[phones] error validating ${phone}:`, err.message);
    }

    await sleep(50);
  }

  console.log(
    `[phones] done | total=${contacts.length} clean=${clean.length} removed=${removed.length}`
  );

  return { clean, removed };
}

/**
 * Clean prospect emails - NeverBounce validation
 */
async function cleanProspectEmails(contacts) {
  const clean = [];
  const removed = [];

  console.log(`[emails] starting cleanup: ${contacts.length} contacts`);

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    const email = (contact.email || "").trim().toLowerCase();

    // progress log every 100 records
    if ((i + 1) % 100 === 0) {
      console.log(
        `[emails] progress ${i + 1}/${contacts.length} | clean=${
          clean.length
        } removed=${removed.length}`
      );
    }

    if (!email || !email.includes("@")) {
      removed.push({ ...contact, reason: "Invalid email format" });
      console.log(`[emails] removed (invalid email): ${email || "(blank)"}`);
      continue;
    }

    try {
      const result = await validateEmail(email);

      if (result === "valid" || result === "catchall") {
        clean.push({ ...contact, email });
      } else {
        removed.push({ ...contact, reason: `Email: ${result}` });
        console.log(`[emails] removed (${result}): ${email}`);
      }
    } catch (err) {
      removed.push({ ...contact, reason: `Error: ${err.message}` });
      console.error(`[emails] error validating ${email}:`, err.message);
    }

    await sleep(50);
  }

  console.log(
    `[emails] done | total=${contacts.length} clean=${clean.length} removed=${removed.length}`
  );

  return { clean, removed };
}

module.exports = { cleanProspectPhones, cleanProspectEmails };
