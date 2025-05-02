import React, { useContext, useState } from "react";
import ScheduleContext from "../../../context/schedule/scheduleContext";
import NewClientCreationForm from "./NewClientCreationForm";
import DailyScheduleManager from "./DailyScheduleManager";
import ClientAnalysisList from "../client review/ClientAnalysisList";

const ScheduleFunnelDashboard = () => {
  const { textQueue, emailQueue, toReview } = useContext(ScheduleContext);
  const [selectedQueue, setSelectedQueue] = useState("email");

  const renderQueue = () => {
    switch (selectedQueue) {
      case "text":
        return <ClientAnalysisList title="📱 Text Queue" clients={textQueue} />;
      case "review":
        return (
          <ClientAnalysisList title="🚨 Needs Review" clients={toReview} />
        );
      case "email":
      default:
        return (
          <ClientAnalysisList title="📨 Email Queue" clients={emailQueue} />
        );
    }
  };

  return (
    <div className="schedule-dashboard-container">
      <div className="top-panels">
        <div className="panel-left">
          <NewClientCreationForm />
        </div>
        <div className="panel-right">
          <DailyScheduleManager />
        </div>
      </div>

      <div className="bottom-panel">
        <div className="queue-toggle-buttons mb-4">
          <button
            className={`btn ${
              selectedQueue === "email" ? "btn-primary" : "btn-outline"
            }`}
            onClick={() => setSelectedQueue("email")}
          >
            📨 Email Queue
          </button>
          <button
            className={`btn ${
              selectedQueue === "text" ? "btn-primary" : "btn-outline"
            } ml-2`}
            onClick={() => setSelectedQueue("text")}
          >
            📱 Text Queue
          </button>
          <button
            className={`btn ${
              selectedQueue === "review" ? "btn-primary" : "btn-outline"
            } ml-2`}
            onClick={() => setSelectedQueue("review")}
          >
            🚨 Review Queue
          </button>
        </div>

        {renderQueue()}
      </div>
    </div>
  );
};

export default ScheduleFunnelDashboard;
