import React, { useState, useContext, useEffect } from "react";
import ScheduleContext from "../../../context/schedule/scheduleContext";
import EmailContext from "../../../context/email/emailContext";
import TextContext from "../../../context/text/textContext";
import ClientAnalysisList from "../clientreview/ClientAnalysisList";

const DailyScheduleManager = () => {
  const {
    textQueue,
    emailQueue,
    toReview,
    buildDailySchedule,
    processReviewActions,
    refreshDailyQueues,
    updateScheduleSettings,
  } = useContext(ScheduleContext);

  const { sendEmailBatch } = useContext(EmailContext);
  const { sendTextBatch } = useContext(TextContext);
  const [pace, setPace] = useState(15);
  const [activeQueue, setActiveQueue] = useState("email");
  const [loading, setLoading] = useState(false);

  // Sync pace with schedule if it changes

  // Update pace in backend
  const handlePaceChange = async (e) => {
    const newPace = parseInt(e.target.value, 10) || 1;
    setPace(newPace);
    try {
      await updateScheduleSettings({ pace: newPace });
    } catch (err) {
      console.error("Error updating pace:", err);
    }
  };

  // Build or rebuild the daily schedule
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

  // Send out either emails or texts in batches of `pace`
  const handleSend = async () => {
    setLoading(true);
    try {
      if (activeQueue === "email") {
        await sendEmailBatch(emailQueue);
      } else if (activeQueue === "text") {
        const batch = textQueue.slice(0, pace);
        await sendTextBatch(batch);
      }
      // after sending, rebuild so sent items drop out
      await refreshDailyQueues();
    } catch (err) {
      console.error("Error sending batch:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyReviews = async () => {
    if (toReview.length === 0) return;
    setLoading(true);
    try {
      // toReview should have { caseNumber, decision } shapes
      await processReviewActions(toReview);
      await refreshDailyQueues();
    } catch (err) {
      console.error("Error processing reviews:", err);
    } finally {
      setLoading(false);
    }
  };

  const renderClientList = () => {
    switch (activeQueue) {
      case "text":
        return (
          <ClientAnalysisList
            title={`📱 Text Queue (${textQueue.length})`}
            textQueue={textQueue}
            isDaily
            activeQueue="text"
          />
        );
      case "review":
        return (
          <ClientAnalysisList
            title={`🚨 Needs Review (${toReview.length})`}
            toReview={toReview}
            isDaily
            activeQueue="review"
          />
        );
      case "email":
      default:
        return (
          <ClientAnalysisList
            title={`📨 Email Queue (${emailQueue.length})`}
            emailQueue={emailQueue}
            isDaily
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

        {/* Send button for email/text */}
        {activeQueue === "email" || activeQueue === "text" ? (
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
          // REVIEW queue: Apply bulk review decisions
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
                email: "📨 Email",
                text: "📱 Text",
                review: "🚨 Review",
              }[q]
            }
            &nbsp;(
            {
              {
                email: emailQueue,
                text: textQueue,
                review: toReview,
              }[q].length
            }
            )
          </button>
        ))}
      </div>

      {renderClientList()}
    </div>
  );
};
export default DailyScheduleManager;
