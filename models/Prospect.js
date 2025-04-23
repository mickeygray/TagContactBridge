const mongoose = require("mongoose");

const prospectSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  phone: String,
  hasResponded: { type: Boolean, default: false },
  lastEmailSent: { type: String, default: null },
  emailRespondedTo: { type: String, default: null },
  lastContactDate: { type: Date, default: null },
  responseDate: { type: Date, default: null },
  addDate: { type: Date, default: null },
});

module.exports = mongoose.model("Prospect", prospectSchema);
