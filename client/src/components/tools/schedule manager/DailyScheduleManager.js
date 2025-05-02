import React, { useState, useContext } from "react";
import ScheduleContext from "../../../context/schedule/scheduleContext";

const DailyScheduleManager = () => {
  const {
    textQueue,
    emailQueue,
    toReview,
    buildDailySchedule,
    updateDailySchedule,
    dailySchedule,
  } = useContext(ScheduleContext);

  const [pace, setPace] = useState(dailySchedule?.pace || 15);
  const [activeQueue, setActiveQueue] = useState("text"); // 'text', 'email', 'review'
  const [loading, setLoading] = useState(false);

  const handleBuildSchedule = async () => {
    setLoading(true);
    try {
      await buildDailySchedule();
    } catch (err) {
      console.error("Error building schedule:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePaceChange = async (e) => {
    const newPace = parseInt(e.target.value, 10);
    setPace(newPace);
    await updateDailySchedule({ pace: newPace });
  };

  return (
    <div className="card p-4">
      <h3 className="text-xl font-semibold mb-3">⚙️ Daily Schedule Manager</h3>

      <div className="flex items-center mb-4 gap-4">
        <button
          className="button primary"
          onClick={handleBuildSchedule}
          disabled={loading}
        >
          🔄 {loading ? "Building..." : "Build Daily Schedule"}
        </button>

        <label className="flex items-center gap-2">
          Pace:
          <input
            type="number"
            value={pace}
            min="1"
            onChange={handlePaceChange}
            className="input w-20"
          />
        </label>
      </div>

      <div className="flex gap-3 mb-4">
        <button
          className={`btn ${
            activeQueue === "text" ? "btn-primary" : "btn-outline"
          }`}
          onClick={() => setActiveQueue("text")}
        >
          📲 Text Queue ({textQueue.length})
        </button>
        <button
          className={`btn ${
            activeQueue === "email" ? "btn-primary" : "btn-outline"
          }`}
          onClick={() => setActiveQueue("email")}
        >
          📧 Email Queue ({emailQueue.length})
        </button>
        <button
          className={`btn ${
            activeQueue === "review" ? "btn-primary" : "btn-outline"
          }`}
          onClick={() => setActiveQueue("review")}
        >
          📝 Review List ({toReview.length})
        </button>
      </div>
    </div>
  );
};

export default DailyScheduleManager;
