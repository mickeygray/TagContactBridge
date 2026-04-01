// utils/textStats.js
let sentHour = 0;
let sentDay = 0;
let lastHourReset = Date.now();
let lastDayReset = Date.now();

const RATE_LIMIT_HOURLY = 150;
const RATE_LIMIT_DAILY = 1000;

function resetLimits() {
  const now = Date.now();
  if (now - lastHourReset > 3600_000) {
    sentHour = 0;
    lastHourReset = now;
  }
  if (now - lastDayReset > 86_400_000) {
    sentDay = 0;
    lastDayReset = now;
  }
}

function increment() {
  resetLimits();
  sentHour++;
  sentDay++;
}

function canSend() {
  resetLimits();
  return sentHour < RATE_LIMIT_HOURLY && sentDay < RATE_LIMIT_DAILY;
}

function getStats() {
  resetLimits();
  return {
    sentHour,
    sentDay,
    remainingHour: RATE_LIMIT_HOURLY - sentHour,
    remainingDay: RATE_LIMIT_DAILY - sentDay,
    limitHour: RATE_LIMIT_HOURLY,
    limitDay: RATE_LIMIT_DAILY,
  };
}

module.exports = { resetLimits, increment, canSend, getStats };
