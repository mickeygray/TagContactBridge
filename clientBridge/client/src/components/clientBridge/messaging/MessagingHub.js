// components/clientBridge/messaging/MessagingHub.js
// Merged UI: Inbox (SMS Intelligence) + Email Campaign + SMS Campaign + Template Studio
import React, { useState } from "react";

// Import existing tool components (they'll be refactored to use hooks later)
import SmsInbox from "../../tools/smsinbox/SmsInbox";
import ManualEmailSender from "../../tools/emailsender/ManualEmailSender";
import TextMessageSender from "../../tools/textsender/TextMessageSender";
import TemplateStudio from "./TemplateStudio";

const TABS = [
  { key: "inbox", label: "Inbox" },
  { key: "email", label: "Email Campaign" },
  { key: "sms", label: "SMS Campaign" },
  { key: "templates", label: "Template Studio" },
];

export default function MessagingHub() {
  const [activeTab, setActiveTab] = useState("inbox");

  return (
    <div>
      <div className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`tab ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === "inbox" && <SmsInbox />}
        {activeTab === "email" && <ManualEmailSender />}
        {activeTab === "sms" && <TextMessageSender />}
        {activeTab === "templates" && <TemplateStudio />}
      </div>
    </div>
  );
}
