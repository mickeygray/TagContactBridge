import React, { useState, useContext, useEffect } from "react";
import ScheduleContext from "../../../context/schedule/scheduleContext";
import ClientAnalysisList from "../client review/ClientAnalysisList";

export default function DailyScheduleManager() {
  const {
    textQueue,
    emailQueue,
    toReview,
    buildDailySchedule,
    updateDailySchedule,
    dailySchedule,
  } = useContext(ScheduleContext);

  const [pace, setPace] = useState(dailySchedule?.pace || 15);
  const [activeQueue, setActiveQueue] = useState("email");
  const [loading, setLoading] = useState(false);

  // when the schedule first loads, ensure pace is in sync
  useEffect(() => {
    setPace(dailySchedule?.pace ?? 15);
  }, [dailySchedule]);

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
    const newPace = parseInt(e.target.value, 10) || 1;
    setPace(newPace);
    try {
      await updateDailySchedule({ pace: newPace });
    } catch (err) {
      console.error("Error updating pace:", err);
    }
  };

  // decide which list to render
  const renderClientList = () => {
    switch (activeQueue) {
      case "text":
        return (
          <ClientAnalysisList
            title={`📱 Text Queue (${textQueue.length})`}
            textQueue={textQueue}
            isDaily={true}
            activeQueue="text"
          />
        );
      case "review":
        return (
          <ClientAnalysisList
            title={`🚨 Needs Review (${toReview.length})`}
            toReview={toReview}
            isDaily={true}
            activeQueue="review"
          />
        );
      case "email":
      default:
        return (
          <ClientAnalysisList
            title={`📨 Email Queue (${emailQueue.length})`}
            emailQueue={emailQueue}
            isDaily={true}
            activeQueue="email"
          />
        );
    }
  };

  return (
    <div className="daily-schedule-manager card p-4">
      <h3 className="text-xl font-semibold mb-3">⚙️ Daily Schedule Manager</h3>

      <div className="flex items-center mb-4 gap-4">
        <button
          className="button primary"
          onClick={handleBuildSchedule}
          disabled={loading}
        >
          🔄 {loading ? "Building..." : "Build Schedule"}
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

      <div className="queue-toggle-buttons mb-4 flex gap-2">
        {["email", "text", "review"].map((q) => (
          <button
            key={q}
            className={`btn ${
              activeQueue === q ? "btn-primary" : "btn-outline"
            }`}
            onClick={() => setActiveQueue(q)}
          >
            {
              {
                email: "📨 Email",
                text: "📱 Text",
                review: "🚨 Review",
              }[q]
            }
            &nbsp;(
            {{ email: emailQueue, text: textQueue, review: toReview }[q].length}
            )
          </button>
        ))}
      </div>

      {renderClientList()}
    </div>
  );
}
