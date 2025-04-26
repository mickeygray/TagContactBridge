import React, { useContext, useState } from "react";
import ScheduleContext from "../../../context/schedule/scheduleContext";
import ScheduleForm from "./ScheduleForm";
import ScheduleUpdater from "./ScheduleUpdater"; // New component

const ScheduleFunnelDashboard = () => {
  const {
    textQueue,
    emailQueue,
    toReview,
    dailySchedule,
    periodContacts,
    updateDailySchedule,
  } = useContext(ScheduleContext);
  const [viewMode, setViewMode] = useState("form"); // 'form', 'review', or 'updater'

  const renderContent = () => {
    switch (viewMode) {
      case "form":
        return (
          <>
            <h2 className="mb-4">🧭 Client Scheduling Funnel</h2>
            <ScheduleForm />
          </>
        );
      case "updater":
        return (
          <>
            <h2 className="mb-4">⚙️ Schedule & Contacts Updater</h2>
            <ScheduleUpdater
              dailySchedule={dailySchedule}
              periodContacts={periodContacts}
              updateDailySchedule={updateDailySchedule}
            />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="container">
      <div className="mb-3">
        <button
          className={`btn btn-${viewMode === "form" ? "primary" : "outline"}`}
          onClick={() => setViewMode("form")}
        >
          Add New Client
        </button>
        <button
          className={`btn btn-${
            viewMode === "review" ? "primary" : "outline"
          } ml-2"`}
          onClick={() => setViewMode("review")}
        >
          View Today's Lists
        </button>
        <button
          className={`btn btn-${
            viewMode === "updater" ? "primary" : "outline"
          } ml-2"`}
          onClick={() => setViewMode("updater")}
        >
          Schedule Updater
        </button>
      </div>
      {renderContent()}
    </div>
  );
};

export default ScheduleFunnelDashboard;
