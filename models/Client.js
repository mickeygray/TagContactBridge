const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, default: "" },
  cell: { type: String, default: "" },

  caseNumber: { type: String, required: true, unique: true },
  initialPayment: { type: Number },
  totalPayment: { type: Number },
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
      "documentsSubmitted",
      "filingDocuments",
      "irsContact",
      "irsGuidelines",
    ],
  },
  status: {
    type: String,
    enum: ["active", "partial", "adserv", "inactive", "inReview", "delinquent"],
    default: "active",
  },
  createDate: { type: String },
  invoiceCount: { type: Number },
  lastInvoiceAmount: { type: Number },
  lastInvoiceDate: { type: Date },
  delinquentAmount: { type: Number, default: 0 },
  delinquentDate: { type: Date },
  reviewDates: { type: Array },
  lastContactDate: { type: Date },
  invoiceCountChangeDate: { type: Date },
  stagesReceived: { type: Array },
  stagePieces: { type: [String], default: [] },
});

module.exports = mongoose.model("Client", clientSchema);
