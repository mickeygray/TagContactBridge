import React, { useState } from "react";
import LogicsFileReader from "../tools/listmanagers/LogicsFileReader";
import CallFetcher from "../tools/callmonitor/CallFetcher";
import LexisAppendList from "../tools/listmanagers/LexisAppendList";
import PeriodContactsFilter from "../tools/listmanagers/PeriodContactsFilter";
import ClientAnalysisList from "../tools/clientreview/ClientAnalysisList";

const AgentDashboard = () => {
  const [activeTool, setActiveTool] = useState(null);

  const renderActiveTool = () => {
    switch (activeTool) {
      case "logics":
        return <LogicsFileReader />;
      case "calls":
        return <CallFetcher />;
      case "lexis":
        return <LexisAppendList />;
      case "period":
        return <PeriodContactsFilter />;
      case "analysis":
        <ClientAnalysisList />;
      default:
        return <p>Please select a tool from the right panel.</p>;
    }
  };

  return (
    <div className="dashboard-container">
      <div className="lead-list-container">{renderActiveTool()}</div>

      <div className="panel-container">
        <div className="card">
          <h3>🛠️ Agent Tools</h3>
          <button
            className={`button primary ${
              activeTool === "logics" ? "active" : ""
            }`}
            onClick={() => setActiveTool("logics")}
          >
            📁 Logics File Reader
          </button>
          <br />
          <button
            className={`button primary ${
              activeTool === "calls" ? "active" : ""
            }`}
            onClick={() => setActiveTool("calls")}
          >
            📞 Call Fetcher
          </button>
          <br />
          <button
            className={`button primary ${
              activeTool === "lexis" ? "active" : ""
            }`}
            onClick={() => setActiveTool("lexis")}
          >
            📋 Lexis Append List
          </button>{" "}
          <br />
          <button
            className={`button primary ${
              activeTool === "period" ? "active" : ""
            }`}
            onClick={() => setActiveTool("period")}
          >
            📋 Period Contacts Filter
          </button>
          <br />
          <button
            className={`button primary ${
              activeTool === "period" ? "active" : ""
            }`}
            onClick={() => setActiveTool("period")}
          >
            📋 Client Analysis List
          </button>
        </div>
      </div>
    </div>
  );
};

export default AgentDashboard;
