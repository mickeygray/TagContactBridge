// scripts/fixEmailValid.js
// Quick fix: clear emailValid: false for leads that have a real email
// These were validated during the outage and got stuck

require("dotenv").config();
require("../config/db")().then(async () => {
  const LC = require("../models/LeadCadence");

  const result = await LC.updateMany(
    { active: true, emailValid: false, email: { $nin: [null, ""] } },
    { $set: { emailValid: true } },
  );

  console.log(`Fixed ${result.modifiedCount} leads (emailValid: false → true)`);
  process.exit(0);
});
