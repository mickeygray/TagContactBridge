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
require("dotenv").config();

const connectDB = require("./config/db");
connectDB();
const app = express();

require("dotenv").config();
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
app.use("/api/texts", require("./routes/texts"));
app.use("/api/schedule", require("./routes/schedule"));
app.use("/api/clients", clientRoutes);
const buildDir = path.join(__dirname, "client", "build");
app.use(express.static(buildDir));
app.get("/*", (req, res) => {
  res.sendFile(path.join(buildDir, "index.html"));
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
