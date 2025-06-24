import React, { useState } from "react";
import LogicsFileReader from "../tools/listmanagers/LogicsFileReader";
import ManualEmailSender from "../tools/emailsender/ManualEmailSender";
import TextMessageSender from "../tools/textsender/TextMessageSender";
import NCOAUploader from "../tools/listmanagers/NCOAUploader";
import ScheduleFunnelDashboard from "../tools/schedulemanager/ScheduleFunnelDashboard";
import PeriodContactsFilter from "../tools/listmanagers/PeriodContactsFilter";
import UnifiedClientListManager from "../tools/listmanagers/UnifiedClientListManager";

const AgentDashboard = () => {
  const [activeTool, setActiveTool] = useState(null);

  const renderActiveTool = () => {
    switch (activeTool) {
      case "logics":
        return <LogicsFileReader />;
      case "period":
        return <PeriodContactsFilter />;
      case "search":
        return <UnifiedClientListManager />;
      case "email":
        return <ManualEmailSender />;
      case "text":
        return <TextMessageSender />;
      case "mail":
        return <NCOAUploader />;
      case "daily":
        return <ScheduleFunnelDashboard />;
      default:
        return <LogicsFileReader />;
    }
  };

  return (
    <div className="dashboard-container">
      <div className="lead-list-container">{renderActiveTool()}</div>

      <div className="panel-container">
        <div className="card">
          <h3>🛠️ Marketing Tools</h3>
          <button
            className={`button primary ${
              activeTool === "logics" ? "active" : ""
            }`}
            onClick={() => setActiveTool("logics")}
          >
            📁 List Upload Tool
          </button>
          <br />
          <button
            className={`button primary ${
              activeTool === "text" ? "active" : ""
            }`}
            onClick={() => setActiveTool("text")}
          >
            📞 Text Message Sender
          </button>
          <br />
          <button
            className={`button primary ${
              activeTool === "email" ? "active" : ""
            }`}
            onClick={() => setActiveTool("email")}
          >
            📋 Marketing Emails
          </button>{" "}
          <br />
          <button
            className={`button primary ${
              activeTool === "period" ? "active" : ""
            }`}
            onClick={() => setActiveTool("period")}
          >
            📋 Aged Clients Marketing List
          </button>
          <br />
          <button
            className={`button primary ${
              activeTool === "search" ? "active" : ""
            }`}
            onClick={() => setActiveTool("search")}
          >
            📋 Client Search
          </button>
          <br />
          <button
            className={`button primary ${
              activeTool === "mail" ? "active" : ""
            }`}
            onClick={() => setActiveTool("mail")}
          >
            📋 Direct Mail List
          </button>
          <br />
          <button
            className={`button primary ${
              activeTool === "daily" ? "active" : ""
            }`}
            onClick={() => setActiveTool("daily")}
          >
            📋 Daily Client Contacts
          </button>
        </div>
      </div>
    </div>
  );
};

export default AgentDashboard;
