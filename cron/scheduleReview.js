// UNUSED — Never imported or called by any module.
// References stale Client schema fields (stage, poaDate, finalEmailDate, tokenExpiresAt).
// Kept for reference; may be adapted for future scheduled review logic.
/*
const cron = require("node-cron");
const Client = require("../models/Client");

let reviewList = {
  prac: [],
  poa: [],
  f433a: [],
  textQueue: [],
};

const getDateNDaysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
};

const refreshReviewList = async () => {
  try {
    const allClients = await Client.find();

    const today = new Date().toISOString().split("T")[0];
    const pracThreshold = getDateNDaysAgo(3);
    const poaThreshold = today;
    const finalThreshold = today;
    const deleteResult = await Client.deleteMany({
      tokenExpiresAt: { $lte: today },
    });

    if (deleteResult.deletedCount > 0) {
      console.log(`Removed ${deleteResult.deletedCount} expired client(s)`);
    }
    const oldClients = allClients.filter((client) => !client.saleDate);
    const newClients = allClients.filter((client) => client.saleDate);
    reviewList = {
      prac: newClients.filter(
        (c) => c.stage === "prac" && c.saleDate <= pracThreshold && !c.poaDate
      ),
      poa: newClients.filter(
        (c) =>
          c.stage === "poa" && c.poaDate <= poaThreshold && !c.finalEmailDate
      ),
      f433a: newClients.filter(
        (c) => c.stage === "433" && c.finalEmailDate <= finalThreshold
      ),
      textQueue: oldClients,
    };

    console.log("Schedule Review List refreshed at 7:00 AM");
  } catch (err) {
    console.error("Error refreshing review list:", err);
  }
};

cron.schedule("0 7 * * *", refreshReviewList);
refreshReviewList();

module.exports = () => reviewList;
*/
