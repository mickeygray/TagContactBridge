const mongoose = require("mongoose");

const periodContactsSchema = new mongoose.Schema({
  createDateStage: {
    type: String,
    enum: [
      "taxOrganizer",
      "update433a",
      "taxDeadline",
      "penaltyAbatement",
      "yearReview",
    ],
  },
  createDateClientIDs: {
    type: [String], // Just IDs; full logic runs from the client model
    default: [],
  },

  periodStartDate: {
    type: Date,
    required: true,
  },
  periodContactsComplete: { type: Boolean },
});

module.exports = mongoose.model("PeriodContacts", periodContactsSchema);
