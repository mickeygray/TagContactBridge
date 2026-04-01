import React, { useContext, useState } from "react";
import ScheduleContext from "../../../context/schedule/scheduleContext";
import NewClientCreationForm from "./NewClientCreationForm";
import DailyScheduleManager from "./DailyScheduleManager";

const ScheduleFunnelDashboard = () => {
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
    </div>
  );
};

export default ScheduleFunnelDashboard;
