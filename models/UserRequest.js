// models/UserRequest.js
const mongoose = require("mongoose");

const UserRequestSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: String,
  roleRequested: { type: String, enum: ["admin", "agent"], default: "agent" },
  marketingAccess: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ["invited", "registerd"],
    default: "invited",
  },
  inviteToken: { type: String }, // secure token
  inviteExpires: { type: Date }, // expiration timestamp
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("UserRequest", UserRequestSchema);
