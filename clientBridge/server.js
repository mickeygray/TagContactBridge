require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
require("../shared/utils/processGuard")("clientBridge");
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
app.use("/api/metrics", require("./routes/metrics"));

// Auth check for nginx auth_request (used by all three bridges)
const { checkSession } = require("./routes/auth");
app.get("/auth-check", checkSession);

// System log SSE + query endpoints
const { addSSEClient, queryLogs, getLogStats } = require("../shared/utils/systemLog");
const { authMiddleware: logAuth } = require("../shared/middleware/authMiddleware");

app.get("/api/logs/stream", logAuth, (req, res) => addSSEClient(res));

app.get("/api/logs", logAuth, async (req, res) => {
  const { bridge, level, category, limit, before } = req.query;
  const logs = await queryLogs({ bridge, level, category, limit: Number(limit) || 100, before });
  res.json(logs);
});

app.get("/api/logs/stats", logAuth, async (req, res) => {
  const stats = await getLogStats();
  res.json(stats);
});

app.post("/sms/inbound", smsInbound);

// Health check (before static/catch-all)
const { expressErrorHandler, healthCheck } = require("../shared/utils/processGuard");
app.get("/health", healthCheck("clientBridge"));

// Serve React build
app.use(express.static(path.join(__dirname, "client", "build")));

// Catch-all — serves index.html for React Router
app.get("*", (req, res) => {
  res.sendFile(path.resolve(__dirname, "client", "build", "index.html"));
});

// Express error handler (must be after all routes including catch-all)
app.use(expressErrorHandler("clientBridge"));

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startAutoSendLoop();
});
