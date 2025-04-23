import React, { useState } from "react";
import LeadListOrganizer from "./LeadListOrganizer";
import ScheduledDropOrganizer from "./ScheduledDropOrganizer";
import ManualEmailSender from "./ManualEmailSender";
import ScheduledUpload from "./ScheduledUpload";
import TextMessageSender from "./TextMessageSender";
import RVMFileUploader from "./RVMFileUploader";

const Dashboard = () => {
  const [showDropOrganizer, setShowDropOrganizer] = useState(false);
  const [showManualEmailSender, setShowManualEmailSender] = useState(false);
  const [showLeadList, setShowLeadList] = useState(false);
  const [showTextSender, setShowTextSender] = useState(false);
  const [showScheduleUpload, setShowScheduleUpload] = useState(false);
  const [showRVMScraper, setShowRVMScraper] = useState(false); // ✅ New state for RVM Scraper

  return (
    <div className="dashboard-container">
      <div className="lead-list-container">
        {showManualEmailSender ? (
          <ManualEmailSender />
        ) : showDropOrganizer ? (
          <ScheduledDropOrganizer />
        ) : showTextSender ? (
          <TextMessageSender />
        ) : showLeadList ? (
          <LeadListOrganizer />
        ) : showScheduleUpload ? (
          <ScheduledUpload />
        ) : showRVMScraper ? ( // ✅ Render RVM Scraper when active
          <RVMFileUploader />
        ) : (
          "Please Select A Messaging Tool"
        )}
      </div>

      <div className="panel-container">
        <div className="card">
          {/* Navigation Buttons */}
          <button
            className={`button primary ${showLeadList ? "active" : ""}`}
            onClick={() => {
              setShowLeadList(true);
              setShowDropOrganizer(false);
              setShowManualEmailSender(false);
              setShowTextSender(false);
              setShowScheduleUpload(false);
              setShowRVMScraper(false);
            }}
          >
            📋 Lead List
          </button>
          <br />
          <button
            className={`button primary ${showScheduleUpload ? "active" : ""}`}
            onClick={() => {
              setShowLeadList(false);
              setShowDropOrganizer(false);
              setShowManualEmailSender(false);
              setShowTextSender(false);
              setShowScheduleUpload(true);
              setShowRVMScraper(false);
            }}
          >
            Drop Scheduler
          </button>
          <br />
          <button
            className={`button primary ${showDropOrganizer ? "active" : ""}`}
            onClick={() => {
              setShowLeadList(false);
              setShowDropOrganizer(true);
              setShowManualEmailSender(false);
              setShowTextSender(false);
              setShowScheduleUpload(false);
              setShowRVMScraper(false);
            }}
          >
            📦 Open Scheduled Drop Organizer
          </button>
          <br />
          <button
            className={`button primary ${
              showManualEmailSender ? "active" : ""
            }`}
            onClick={() => {
              setShowLeadList(false);
              setShowDropOrganizer(false);
              setShowManualEmailSender(true);
              setShowTextSender(false);
              setShowScheduleUpload(false);
              setShowRVMScraper(false);
            }}
          >
            ✉️ Manual Email Sender
          </button>
          <button
            className={`button primary ${showTextSender ? "active" : ""}`}
            onClick={() => {
              setShowLeadList(false);
              setShowDropOrganizer(false);
              setShowManualEmailSender(false);
              setShowTextSender(true);
              setShowScheduleUpload(false);
              setShowRVMScraper(false);
            }}
          >
            📩 Text Message Sender
          </button>
          <br />
          {/* ✅ New Button for RVM Lead Scraper */}
          <button
            className={`button primary ${showRVMScraper ? "active" : ""}`}
            onClick={() => {
              setShowLeadList(false);
              setShowDropOrganizer(false);
              setShowManualEmailSender(false);
              setShowTextSender(false);
              setShowScheduleUpload(false);
              setShowRVMScraper(true);
            }}
          >
            📞 RVM Lead Scraper
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
