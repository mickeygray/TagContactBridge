import React, { useState } from "react";
import ManualEmailSender from "../tools/ManualEmailSender";
import TextMessageSender from "../tools/TextMessageSender";
import NCOAUploader from "../tools/NCOAUploader";
import ScheduleFunnelDashboard from "../tools/ScheduleFunnelDashboard";

const ManagementDashboard = () => {
  const [showManualEmailSender, setShowManualEmailSender] = useState(false);
  const [showTextSender, setShowTextSender] = useState(false);
  const [showScheduler, setScheduler] = useState(true);
  const [showNCOAUploader, setShowNCOAUploader] = useState(false);

  return (
    <div className="dashboard-container">
      <div className="lead-list-container">
        {showManualEmailSender ? (
          <ManualEmailSender />
        ) : showTextSender ? (
          <TextMessageSender />
        ) : showNCOAUploader ? (
          <NCOAUploader />
        ) : showScheduler ? (
          <ScheduleFunnelDashboard />
        ) : (
          <ScheduleFunnelDashboard />
        )}
      </div>

      <div className="panel-container">
        <div className="card">
          <h3>🛠️ Marketing Tools</h3>
          <button
            className={`button primary ${
              showManualEmailSender ? "active" : ""
            }`}
            onClick={() => {
              setShowManualEmailSender(true);
              setShowTextSender(false);
              setShowNCOAUploader(false);
              setScheduler(false);
            }}
          >
            ✉️ Manual Email Sender
          </button>
          <br />
          <button
            className={`button primary ${showTextSender ? "active" : ""}`}
            onClick={() => {
              setShowManualEmailSender(false);
              setShowTextSender(true);
              setShowNCOAUploader(false);
              setScheduler(false);
            }}
          >
            📩 Text Message Sender
          </button>

          <button
            className={`button primary ${showNCOAUploader ? "active" : ""}`}
            onClick={() => {
              setShowManualEmailSender(false);
              setShowTextSender(false);
              setScheduler(false);
              setShowNCOAUploader(true);
            }}
          >
            📋 NCOA Lead Uploader
          </button>
          <button
            className={`button primary ${showNCOAUploader ? "active" : ""}`}
            onClick={() => {
              setShowManualEmailSender(false);
              setShowTextSender(false);
              setScheduler(true);
              setShowNCOAUploader(false);
            }}
          >
            🧭 New Client Funnel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManagementDashboard;
