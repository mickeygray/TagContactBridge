const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String },
  passwordHash: { type: String, required: true },
  role: { type: String, default: "agent" },
  isOnline: { type: Boolean, default: false }, // ✅ Add this
  createdAt: { type: Date, default: Date.now },
  marketingAccess: { type: Boolean, default: false },
});

module.exports = mongoose.model("User", UserSchema);
