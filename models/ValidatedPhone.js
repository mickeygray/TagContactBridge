const mongoose = require("mongoose");
const { Schema } = mongoose;

const ValidatedPhoneSchema = new Schema(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      match: [/^\d{10}$/, "Phone number must be exactly 10 digits"],
    },
  },
  {
    timestamps: true, // adds createdAt/updatedAt if you ever need them
  }
);

// optionally, you could uncomment to auto‑expire records after e.g. 90 days:
// ValidatedPhoneSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
module.exports = mongoose.model("ValidatedPhone", ValidatedPhoneSchema);
