const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const router = express.Router();
const nodemailer = require("nodemailer");
const passport = require("passport");
const UserRequest = require("../models/UserRequest");
const rateLimit = require("express-rate-limit");
const { authMiddleware } = require("../middleware/authMiddleware");
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 10,
  message: "Too many login attempts. Please try again later.",
});
let googleStrategy;

if (process.env.ENABLE_GOOGLE_OAUTH === "true") {
  const GoogleStrategy = require("passport-google-oauth20").Strategy;
  googleStrategy = new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      // …your lookup / isDomainAllowed / user creation / issue JWT…
      done(null, user);
    }
  );
  passport.use(googleStrategy);
}

if (process.env.ENABLE_GOOGLE_OAUTH === "true") {
  router.get(
    "/google",
    passport.authenticate("google", { scope: ["email", "profile"] })
  );

  router.get(
    "/google/callback",
    passport.authenticate("google", { failureRedirect: "/login" }),
    (req, res) => {
      // success → issue JWT, redirect home
      res.redirect("/");
    }
  );
} else {
  // stub routes locally so you don’t get 404s
  router.get("/google", (req, res) =>
    res.send("OAuth disabled in dev—use local login")
  );
  router.get("/google/callback", (req, res) =>
    res.send("OAuth disabled in dev—use local login")
  );
}

// POST /api/auth/request
router.post("/request-account", loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  try {
    const existing = await UserRequest.findOne({ email });
    if (existing)
      return res.status(400).json({ message: "Request already exists" });

    const passwordHash = await bcrypt.hash(password, 10);
    const newRequest = new UserRequest({ email, passwordHash });
    await newRequest.save();

    // Send email to you
    const transporter = nodemailer.createTransport({
      host: "smtp.sendgrid.net", // SendGrid SMTP Server
      port: 587, // Use 587 for TLS (recommended)
      secure: false, // False for TLS, True for SSL (port 465)
      auth: {
        user: process.env.SENDGRID_USER, // SendGrid requires "apikey" as the username
        pass: process.env.TAXAD_API_KEY, // Use API key as the password
      },
    });

    await transporter.sendMail({
      from: `"Account Request" <${process.env.ADMIN_EMAIL}>`,
      to: process.env.ADMIN_EMAIL,
      subject: "New User Request",
      text: `New user request for email: ${email}`,
    });

    res.status(201).json({
      message: "Request submitted. You will be notified if approved.",
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-passwordHash");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Register
router.post("/register", loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "User already exists" });

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = new User({ email, passwordHash });
    await newUser.save();

    res.status(201).json({ message: "User registered" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Login
router.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });
    user.isOnline = true;
    await user.save();

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // HTTPS only in prod
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/logout", async (req, res) => {
  try {
    const token = req.cookies.token;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (user) {
        user.isOnline = false;
        await user.save();
      }
    }

    res.clearCookie("token").json({ message: "Logged out" });
  } catch (err) {
    res.status(500).json({ message: "Logout failed" });
  }
});

module.exports = router;
