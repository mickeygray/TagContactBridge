// routes/inviteRoutes.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const UserRequest = require("../models/UserRequest");
const sendEmail = require("../utils/sendEmail");

// POST /api/invite (Admin creates an invite)
router.post("/", async (req, res) => {
  const { email, roleRequested, marketingAccess, name } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "User already exists" });

    const existingInvite = await UserRequest.findOne({ email });
    if (existingInvite)
      return res
        .status(400)
        .json({ message: "An invite already exists for this email." });

    const token = crypto.randomBytes(32).toString("hex");
    const expires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    const invite = new UserRequest({
      email,
      name,
      roleRequested,
      marketingAccess,
      inviteToken: token,
      inviteExpires: new Date(expires),
    });

    await invite.save();

    const inviteLink = `${process.env.FRONTEND_URL}/register/${token}`;

    await sendEmail({
      to: email,
      subject: "🚪 You're Invited to Join",
      html: `<p>Click below to complete your registration:</p><p><a href="${inviteLink}">${inviteLink}</a></p><p>This link will expire in 24 hours.</p>`,
    });

    res.json({ message: "Invite sent successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create invite." });
  }
});

// GET /api/invite/:token (validate token)
router.get("/:token", async (req, res) => {
  try {
    const invite = await UserRequest.findOne({ inviteToken: req.params.token });
    if (!invite || invite.status !== "invited")
      return res.status(404).json({ message: "Invalid invite link." });

    if (Date.now() > new Date(invite.inviteExpires))
      return res.status(400).json({ message: "Invite link has expired." });

    res.json({ email: invite.email, roleRequested: invite.roleRequested });
  } catch (err) {
    res.status(500).json({ message: "Failed to validate invite." });
  }
});

// POST /api/invite/:token (complete registration)
router.post("/:token", async (req, res) => {
  const { password } = req.body;

  try {
    const invite = await UserRequest.findOne({ inviteToken: req.params.token });
    if (!invite || invite.status !== "invited")
      return res.status(404).json({ message: "Invalid invite." });

    if (Date.now() > new Date(invite.inviteExpires))
      return res.status(400).json({ message: "Invite expired." });

    const existingUser = await User.findOne({ email: invite.email });
    if (existingUser)
      return res.status(400).json({ message: "User already exists." });

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = new User({
      email: invite.email,
      passwordHash,
      role: invite.roleRequested,
      marketingAccess: invite.marketingAccess || false,
      lastLogin: null,
      isOnline: false,
    });

    await newUser.save();
    invite.status = "registered";
    await invite.save();

    res.status(201).json({ message: "Account created successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Registration failed." });
  }
});

module.exports = router;
