const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const inviteRoutes = require("./routes/invite");
const listRoutes = require("./routes/list");
const callRoutes = require("./routes/recording");
const clientRoutes = require("./routes/clients");
const path = require("path");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { inbound: smsInbound } = require("./controllers/smsController");
const { startAutoSendLoop } = require("./services/smsService");
const connectDB = require("../shared/config/db");
connectDB();
const app = express();

// Middleware
app.set("trust proxy", 1);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(express.json());

app.use(cookieParser());
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/calls", callRoutes);
app.use("/api/list", listRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/invite", inviteRoutes);
app.use("/api/emails", require("./routes/emails"));
app.use("/api/sms", require("./routes/sms"));
app.use("/api/cleaner", require("./routes/cleaner"));
app.use("/api/texts", require("./routes/texts"));
app.use("/api/schedule", require("./routes/schedule"));
app.use("/api/clients", clientRoutes);
app.use("/api/templates", require("./routes/templates"));

// Metrics placeholder
const { authMiddleware: metricsAuth } = require("../shared/middleware/authMiddleware");
app.get("/api/metrics/daily-summary", metricsAuth, async (req, res) => {
  res.json({ message: "Metrics endpoint placeholder" });
});

app.post("/sms/inbound", smsInbound);
// Serve React build
app.use(express.static(path.join(__dirname, "client", "build")));

// Catch-all — serves index.html for React Router
app.get("*", (req, res) => {
  res.sendFile(path.resolve(__dirname, "client", "build", "index.html"));
});
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startAutoSendLoop();
});
