// components/interface/AgentDashboard.js — dark terminal tool switcher
import React, { useState } from "react";
import MessagingHub from "../clientBridge/messaging/MessagingHub";
import LogicsFileReader from "../tools/listmanagers/LogicsFileReader";
import NCOAUploader from "../tools/listmanagers/NCOAUploader";
import PeriodContactsFilter from "../tools/listmanagers/PeriodContactsFilter";
import UnifiedClientListManager from "../tools/listmanagers/UnifiedClientListManager";
import ListScrubber from "../tools/cleaner/ListScrubber";
import ScheduleFunnelDashboard from "../tools/schedulemanager/ScheduleFunnelDashboard";
import ConsentVault from "../tools/admin/ConsentVault";

const TOOLS = [
  { id: "messaging", label: "Messaging Hub" },
  { id: "cleaner", label: "Phone/Email Scrubber" },
  { id: "mail", label: "NCOA Direct Mail" },
  { id: "consent", label: "Consent Vault" },
  { id: "logics", label: "List Upload" },
  { id: "period", label: "Aged Clients" },
  { id: "search", label: "Client Search" },
  { id: "daily", label: "Daily Contacts" },
];

function renderTool(id) {
  switch (id) {
    case "messaging": return <MessagingHub />;
    case "logics": return <LogicsFileReader />;
    case "cleaner": return <ListScrubber />;
    case "period": return <PeriodContactsFilter />;
    case "search": return <UnifiedClientListManager />;
    case "mail": return <NCOAUploader />;
    case "daily": return <ScheduleFunnelDashboard />;
    case "consent": return <ConsentVault />;
    default: return <MessagingHub />;
  }
}

export default function AgentDashboard() {
  const [activeTool, setActiveTool] = useState("messaging");

  return (
    <div className="dashboard">
      <div className="tool-switcher">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            className={`tool-btn ${activeTool === tool.id ? "active" : ""}`}
            onClick={() => setActiveTool(tool.id)}
          >
            {tool.label}
          </button>
        ))}
      </div>
      {renderTool(activeTool)}
    </div>
  );
}
