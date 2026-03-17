require("dotenv").config();
require("./config/db")().then(async () => {
  const LC = require("./models/LeadCadence");

  console.log(
    "emailValid false:",
    await LC.countDocuments({ active: true, emailValid: false }),
  );
  console.log(
    "emailValid null/missing:",
    await LC.countDocuments({
      active: true,
      emailValid: { $in: [null, undefined] },
    }),
  );
  console.log(
    "emailValid true:",
    await LC.countDocuments({ active: true, emailValid: true }),
  );

  console.log("\nrvmsSent distribution (active leads):");
  const leads = await LC.find(
    { active: true },
    {
      rvmsSent: 1,
      emailsSent: 1,
      textsSent: 1,
      emailValid: 1,
      email: 1,
      caseId: 1,
    },
  ).lean();
  const rvmCounts = {};
  leads.forEach((l) => {
    const k = l.rvmsSent || 0;
    rvmCounts[k] = (rvmCounts[k] || 0) + 1;
  });
  console.log(rvmCounts);

  console.log("\nSample lead with rvmsSent >= 4:");
  const sample = await LC.findOne(
    { active: true, rvmsSent: { $gte: 4 } },
    {
      caseId: 1,
      rvmsSent: 1,
      emailsSent: 1,
      textsSent: 1,
      emailValid: 1,
      email: 1,
    },
  ).lean();
  console.log(sample);

  console.log("\nLeads with emailValid=false AND have an email:");
  const badEmail = await LC.countDocuments({
    active: true,
    emailValid: false,
    email: { $nin: [null, ""] },
  });
  console.log(badEmail);

  process.exit(0);
});
