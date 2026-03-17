import React, { useState } from "react";
import LogicsFileReader from "../tools/listmanagers/LogicsFileReader";
import ManualEmailSender from "../tools/emailsender/ManualEmailSender";
import TextMessageSender from "../tools/textsender/TextMessageSender";
import NCOAUploader from "../tools/listmanagers/NCOAUploader";
import ScheduleFunnelDashboard from "../tools/schedulemanager/ScheduleFunnelDashboard";
import PeriodContactsFilter from "../tools/listmanagers/PeriodContactsFilter";
import UnifiedClientListManager from "../tools/listmanagers/UnifiedClientListManager";
import ListScrubber from "../tools/cleaner/ListScrubber";
import CallFireDialer from "../tools/schedulemanager/CallFireDialer";
import SmsInbox from "../tools/smsinbox/SmsInbox";

const AgentDashboard = () => {
  const [activeTool, setActiveTool] = useState("sms");

  const renderActiveTool = () => {
    switch (activeTool) {
      case "sms":
        return <SmsInbox />;
      case "logics":
        return <LogicsFileReader />;
      case "cleaner":
        return <ListScrubber />;
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
      case "callfire":
        return <CallFireDialer />;
      default:
        return <SmsInbox />;
    }
  };

  // Active tools configuration
  const tools = [
    { id: "sms", label: "SMS Intelligence", icon: "🤖", active: true },
    { id: "email", label: "Email Campaign Sender", icon: "✉️", active: true },
    { id: "text", label: "SMS Campaign Sender", icon: "💬", active: true },
    { id: "callfire", label: "CallFire Auto-Dialer", icon: "🔥", active: true },
    { id: "cleaner", label: "Phone/Email Scrubber", icon: "🧹", active: true },
    { id: "mail", label: "NCOA Direct Mail Prep", icon: "📬", active: true },
    // Inactive tools - uncomment when ready
    // { id: "logics", label: "List Upload Tool", icon: "📁", active: false },
    // { id: "period", label: "Aged Clients List", icon: "📅", active: false },
    // { id: "search", label: "Client Search", icon: "🔍", active: false },
    // { id: "daily", label: "Daily Contacts", icon: "📋", active: false },
  ];

  return (
    <div className="dashboard-container">
      <div className="lead-list-container">{renderActiveTool()}</div>

      <div className="panel-container">
        <div className="card">
          <h3>🛠️ Marketing Tools</h3>

          {tools
            .filter((t) => t.active)
            .map((tool) => (
              <button
                key={tool.id}
                className={`button primary ${activeTool === tool.id ? "active" : ""}`}
                onClick={() => setActiveTool(tool.id)}
                style={{ marginBottom: "8px", display: "block", width: "100%" }}
              >
                {tool.icon} {tool.label}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
};

export default AgentDashboard;
