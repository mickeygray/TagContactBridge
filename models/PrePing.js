// models/PrePing.js
const mongoose = require("mongoose");

const prePingSchema = new mongoose.Schema({
  emailHash: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now, expires: 300 }, // auto-delete after 5 min
});

module.exports = mongoose.model("PrePing", prePingSchema);
