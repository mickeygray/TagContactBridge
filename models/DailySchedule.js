const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  caseNumber: { type: String, required: true },
  email: { type: String },
  domain: { type: String, enum: ["TAG", "WYNN", "AMITY"], default: "TAG" }, // Optional, used in emailQueue
  cell: { type: String }, // Optional, used in textQueue// e.g., "f433a", "penaltyAbatement"
  stagePiece: { type: String, required: true }, // e.g., "433a Text 1"
  contactType: { type: String, enum: ["email", "text"], required: true },
  token: { type: String },
});

const dailyScheduleSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, unique: true }, // e.g., "2025-04-22"
    emailQueue: [contactSchema],
    textQueue: [contactSchema],
    pace: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DailySchedule", dailyScheduleSchema);
