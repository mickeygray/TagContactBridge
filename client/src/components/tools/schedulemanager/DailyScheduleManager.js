import React, { useState, useContext, useEffect } from "react";
import ScheduleContext from "../../../context/schedule/scheduleContext";
import EmailContext from "../../../context/email/emailContext";
import TextContext from "../../../context/text/textContext";
import DailyClientAnalysisList from "../lists/DailyClientAnalysisList";

const DailyScheduleManager = () => {
  const {
    textQueue,
    emailQueue,
    toReview,
    buildDailySchedule,
    processReviewActions,
    refreshDailyQueues,
    pace, // current pace from context
    updateScheduleSettings, // helper to PUT new pace
  } = useContext(ScheduleContext);

  const { sendEmailBatch } = useContext(EmailContext);
  const { sendTextBatch } = useContext(TextContext);

  const [activeQueue, setActiveQueue] = useState("email");
  const [loading, setLoading] = useState(false);
  const [newPace, setNewPace] = useState(pace);

  // whenever context.pace changes (from build or elsewhere), reset our local input
  useEffect(() => {
    setNewPace(pace);
  }, [pace]);

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

  const handlePaceChange = async () => {
    const num = parseInt(newPace, 10);
    if (isNaN(num) || num < 1) {
      return alert("Please enter a valid positive number");
    }
    setLoading(true);
    try {
      await updateScheduleSettings({ pace: num });
      // context.pace will update → our useEffect will reset newPace
    } catch (err) {
      console.error("Error updating pace:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    setLoading(true);
    try {
      if (activeQueue === "email") {
        // emails: send the entire queue
        await sendEmailBatch(emailQueue);
      } else {
        // texts: only up to pace
        const slice = textQueue.slice(0, pace);
        await sendTextBatch(slice);
      }
      await refreshDailyQueues();
    } catch (err) {
      console.error("Error sending batch:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyReviews = async () => {
    if (!toReview.length) return;
    setLoading(true);
    try {
      await processReviewActions(toReview);
      await refreshDailyQueues();
    } catch (err) {
      console.error("Error processing reviews:", err);
    } finally {
      setLoading(false);
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

        <label>
          <span>📊 Pace: {pace} per drop</span>
          <br />
          <input
            type="number"
            min="1"
            className="input w-20"
            value={newPace}
            onChange={(e) => setNewPace(e.target.value)}
          />

          <button
            className="btn btn-sm"
            onClick={handlePaceChange}
            disabled={loading || newPace === pace}
          >
            Change
          </button>
          <br />
          <span className="ml-2 text-sm text-gray-600"></span>
        </label>

        {["email", "text"].includes(activeQueue) ? (
          <button
            className="button secondary"
            onClick={handleSend}
            disabled={
              loading ||
              (activeQueue === "email"
                ? emailQueue.length === 0
                : textQueue.length === 0)
            }
          >
            {loading
              ? activeQueue === "email"
                ? "Sending Emails..."
                : "Sending Texts..."
              : activeQueue === "email"
              ? "Send Emails"
              : `Send Texts (up to ${pace})`}
          </button>
        ) : (
          <button
            className="button secondary"
            onClick={handleApplyReviews}
            disabled={loading || toReview.length === 0}
          >
            {loading ? "Applying Reviews..." : "Apply Reviews"}
          </button>
        )}
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
                email: `📨 Email (${emailQueue.length})`,
                text: `📱 Text (${textQueue.length})`,
                review: `🚨 Review (${toReview.length})`,
              }[q]
            }
          </button>
        ))}
      </div>
      <DailyClientAnalysisList activeTab={activeQueue} />
    </div>
  );
};

export default DailyScheduleManager;
