const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  cell: { type: String, required: true, unique: true },
  caseNumber: { type: String, required: true, unique: true },
  initialPayment: { type: Number },
  secondPaymentDate: { type: Date },
  domain: { type: String, enum: ["TAG", "WYNN", "AMITY"], default: "TAG" },
  saleDate: { type: Date },
  stage: {
    type: String,
    enum: [
      "prac",
      "poa",
      "f433a",
      "update433a",
      "penaltyAbatement",
      "taxOrganizer",
      "taxDeadline",
      "yearReview",
      "adserv",
    ],
    default: "prac",
  },
  status: {
    type: String,
    enum: ["active", "partial", "adserv", "inactive", "inReview", "delinquent"],
    default: "active",
  },
  token: { type: String },
  tokenExpiresAt: { type: Date },
  createDate: { type: String },
  invoiceCount: { type: Number },
  lastInvoiceAmount: { type: Number },
  delinquentAmount: { type: Number, default: 0 },
  delinquentDate: { type: Date },
  reviewDate: { type: Date },
  invoiceCountChangeDate: { type: Date },
  contactedThisPeriod: { type: Boolean },
  stagesRecieved: { type: Array },
});
module.exports = mongoose.model("Client", clientSchema);
