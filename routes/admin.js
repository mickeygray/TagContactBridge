const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const UserRequest = require("../models/UserRequest");
const sendEmail = require("../utils/sendEmail");
const {
  authMiddleware,
  requireAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();

let adminOTPs = {}; // In-memory OTP store (consider Redis in production)

// Admin-only access
router.use(authMiddleware, requireAdmin);

// Get all pending account requests
router.get("/requests", authMiddleware, requireAdmin, async (req, res) => {
  const requests = await UserRequest.find({ status: "pending" });
  res.json(requests);
});

// Send admin OTP
router.post("/request-admin-otp", async (req, res) => {
  const { emailRequesting } = req.body;
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  adminOTPs[emailRequesting] = { code, expires: Date.now() + 5 * 60 * 1000 };

  await sendEmail({
    to: process.env.ADMIN_EMAIL,
    subject: "⚠️ Admin Role OTP Request",
    text: `OTP for ${emailRequesting}: ${code}`,
    html: `<p>One-time admin code for <strong>${emailRequesting}</strong>:</p><h2>${code}</h2>`,
  });

  res.json({ message: "OTP sent for verification" });
});

// Verify admin OTP
router.post("/verify-admin-otp", async (req, res) => {
  const { emailRequesting, otp } = req.body;
  const record = adminOTPs[emailRequesting];

  if (!record || record.code !== otp || Date.now() > record.expires) {
    return res.status(400).json({ message: "Invalid or expired OTP" });
  }

  delete adminOTPs[emailRequesting];
  res.json({ verified: true });
});

// Approve request
router.post("/approve/:id", async (req, res) => {
  try {
    const request = await UserRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });

    const tempPassword = Math.random().toString(36).slice(-8);
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const user = new User({
      email: request.email,
      passwordHash,
      role: request.roleRequested || "agent",
      marketingAccess: request.marketingAccess || false,
      lastLogin: null,
      isOnline: false,
    });

    await user.save();
    request.status = "approved";
    await request.save();

    await sendEmail({
      to: request.email,
      subject: "✅ Account Approved",
      html: `<p>Your account has been approved.<br />Temporary password: <strong>${tempPassword}</strong></p>`,
    });

    res.json({ message: "User approved and created" });
  } catch (err) {
    res.status(500).json({ message: "Error approving user" });
  }
});

// Reject request
router.post("/reject/:id", async (req, res) => {
  try {
    const request = await UserRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });

    request.status = "rejected";
    await request.save();

    await sendEmail({
      to: request.email,
      subject: "❌ Account Rejected",
      html: "<p>Your request to join has been declined.</p>",
    });

    res.json({ message: "Request rejected" });
  } catch (err) {
    res.status(500).json({ message: "Error rejecting request" });
  }
});

// Get all users
router.get("/users", async (req, res) => {
  try {
    const users = await User.find().select("-passwordHash");
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Error fetching users" });
  }
});

// Delete user
router.delete("/user/:id", async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting user" });
  }
});

// Force logout user (flag for frontend to detect if needed)
router.post("/logout-user/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isOnline = false;
    await user.save();

    res.json({ message: "User logged out" });
  } catch (err) {
    res.status(500).json({ message: "Error forcing logout" });
  }
});

module.exports = router;
