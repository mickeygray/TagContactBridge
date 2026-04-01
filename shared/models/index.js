// shared/models/index.js
// Barrel export for all shared models

const Client = require("./Client");
const ConsentRecord = require("./ConsentRecord");
const ContactActivity = require("./ContactActivity");
const DailySchedule = require("./DailySchedule");
const LeadCadence = require("./LeadCadence");
const PeriodContacts = require("./PeriodContacts");
const PrePing = require("./PrePing");
const Prospect = require("./Prospect");
const SmsConversation = require("./SmsConversation");
const TiktokCommentReply = require("./TiktokCommentReply");
const TiktokToken = require("./TiktokToken");
const User = require("./User");
const UserRequest = require("./UserRequest");
const ValidatedPhone = require("./ValidatedPhone");

module.exports = {
  Client,
  ConsentRecord,
  ContactActivity,
  DailySchedule,
  LeadCadence,
  PeriodContacts,
  PrePing,
  Prospect,
  SmsConversation,
  TiktokCommentReply,
  TiktokToken,
  User,
  UserRequest,
  ValidatedPhone,
};
