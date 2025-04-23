const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User"); // Adjust path as needed

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB Connected");

    // Check if admin user already exists
    const existing = await User.findOne({
      email: "mgray@taxadvocategroup.com",
    });
    if (!existing) {
      const passwordHash = await bcrypt.hash("Tempp@ss1", 10);

      const user = new User({
        email: "mgray@taxadvocategroup.com",
        passwordHash,
        role: "admin",
        marketingAccess: true,
        lastLogin: null,
        isOnline: false,
      });

      await user.save();
      console.log("✅ Admin user created: mgray@taxadvocategroup.com");
    } else {
      console.log("ℹ️ Admin user already exists.");
    }
  } catch (err) {
    console.error("❌ MongoDB Error:", err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
