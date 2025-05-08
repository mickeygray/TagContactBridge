// Express setup assumed
const express = require("express");
const router = express.Router();

const ctrl = require("../controllers/scheduleController");
const { authMiddleware } = require("../middleware/authMiddleware");

router.use(authMiddleware);
// @route   POST /api/scheduledmessages
// @desc    Add new scheduled client

router.post("/build", ctrl.buildDailySchedule);
router.get("/refresh", ctrl.refreshDailySchedule);
router.put("/update", ctrl.updateDailySchedule);
module.exports = router;
