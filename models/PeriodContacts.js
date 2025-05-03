const mongoose = require("mongoose");

const periodContactsSchema = new mongoose.Schema({
  createDateStage: {
    type: String,
  },
  createDateClientIDs: {
    type: [String], // Just IDs; full logic runs from the client model
    default: [],
  },
  filters: { type: Object },
  periodStartDate: {
    type: Date,
    required: true,
  },
  periodContactsComplete: { type: Boolean },
});

module.exports = mongoose.model("PeriodContacts", periodContactsSchema);
