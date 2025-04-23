import React, { useState, useContext, useRef, useEffect } from "react";
import { csv } from "csvtojson";
import ScheduleContext from "../context/schedule/scheduleContext";
import ScheduledLeadsPanel from "./ScheduledLeadsPanel";
import { v4 as uuidv4 } from "uuid";
const emailTemplates = [
  "welcome",
  "transcripts-1",
  "433a-1",
  "433a-1Wynn",
  "433a-1Amity",
  "433a-2",
  "marketing-1",
  "marketing-2",
  "TaxReturns-1",
  "TaxReturns-2",
  "TaxReturnsWynn-1",
  "TaxReturnsAmity-1",
  "past-due",
  "past-dueWynn",
  "important-update",
  "Extensions-1",
  "Extensions-1Amity",
];
const scheduleSlots = [
  { day: "Monday", time: "8:00 AM" },
  { day: "Monday", time: "9:00 AM" },
  { day: "Monday", time: "10:00 AM" },
  { day: "Monday", time: "11:00 AM" },
  { day: "Monday", time: "12:00 PM" },
  { day: "Monday", time: "1:00 PM" },
  { day: "Monday", time: "2:00 PM" },
  { day: "Monday", time: "3:00 PM" },
  { day: "Tuesday", time: "8:00 AM" },
  { day: "Tuesday", time: "9:00 AM" },
  { day: "Tuesday", time: "10:00 AM" },
  { day: "Tuesday", time: "11:00 AM" },
  { day: "Tuesday", time: "12:00 PM" },
  { day: "Tuesday", time: "1:00 PM" },
  { day: "Tuesday", time: "2:00 PM" },
  { day: "Tuesday", time: "3:00 PM" },
  { day: "Wednesday", time: "8:00 AM" },
  { day: "Wednesday", time: "9:00 AM" },
  { day: "Wednesday", time: "10:00 AM" },
  { day: "Wednesday", time: "11:00 AM" },
  { day: "Wednesday", time: "12:00 PM" },
  { day: "Wednesday", time: "1:00 PM" },
  { day: "Wednesday", time: "2:00 PM" },
  { day: "Wednesday", time: "3:00 PM" },
  { day: "Thursday", time: "8:00 AM" },
  { day: "Thursday", time: "9:00 AM" },
  { day: "Thursday", time: "10:00 AM" },
  { day: "Thursday", time: "11:00 AM" },
  { day: "Thursday", time: "12:00 PM" },
  { day: "Thursday", time: "1:00 PM" },
  { day: "Thursday", time: "2:00 PM" },
  { day: "Thursday", time: "3:00 PM" },
  { day: "Friday", time: "8:00 AM" },
  { day: "Friday", time: "9:00 AM" },
  { day: "Friday", time: "10:00 AM" },
  { day: "Friday", time: "11:00 AM" },
  { day: "Friday", time: "12:00 PM" },
  { day: "Friday", time: "1:00 PM" },
  { day: "Friday", time: "2:00 PM" },
  { day: "Friday", time: "3:00 PM" },
];
const textMessages = [
  {
    name: "Payment Reminder",
    text: "Hi {name}, your payment for the Tax Advocate Group is past due by {pastDueAmount}. Call us at 818-937-0439 to discuss options.",
    trackingNumber: "818-937-0439",
  },
  {
    name: "Extension Notice",
    text: "Hi {name}, Matthew from the Tax Advocate Group. We have been trying to reach you about dealing with 2024. Call us today to to update your case file.",
    trackingNumber: "310-861-9120",
  },
  {
    name: "Prospecting-1",
    text: "Hi {name}, we recently spoke about your taxes. Lets resolve your obligations and get you a refund for 2024. I'm available for a call today. You can reach me here.",
    trackingNumber: "310-945-2810",
  },
  {
    name: "Tax Season Promo",
    text: "Hi {name}, tax season is here! Let us help maximize your refund. Call us now!",
    trackingNumber: "818-926-4286",
  },
];
const gateways = [
  { name: "Tax Advocate", domain: "TaxAdvocateGroup.com" },
  { name: "Wynn", domain: "WynnTaxSolutions.com" },
  { name: "Amity", domain: "AmityTaxGroup.com" },
];

const ScheduledUpload = () => {
  const { scheduleMessages, scheduledLeads, updateScheduledLeads } =
    useContext(ScheduleContext);

  const [contactType, setContactType] = useState("");
  const [uploadedLeads, setUploadedLeads] = useState([]);

  // ✅ Leads scheduled manually
  const [scheduleEntryLeads, setScheduleEntryLeads] = useState([]);

  // ✅ Lead object that matches the MongoDB schema

  const [scheduleEntry, setScheduleEntry] = useState({
    // "manual" or "auto"
    messageType: "",
    selectedTimeSlot: "",
    textMessage: "",
    textMessageName: "",
    textMessageTrackingNumber: "",
    gateway: "",
    template: "",
    senderName: "",
    senderEmailPrefix: "",
    day: "",
  });

  const [scheduleEntryRules, setScheduleEntryRules] = useState({
    schedulingMethod: "",
    maxPerInterval: "",
    interval: "",
    startTime: "",
  });
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleScheduleChange = (field, value) => {
    setScheduleEntry((prev) => {
      let updatedEntry = { ...prev, [field]: value };

      // ✅ Generate senderEmail if both prefix and gateway are set
      if (updatedEntry.senderEmailPrefix && updatedEntry.gateway) {
        const gatewayDomain =
          gateways.find((g) => g.name === updatedEntry.gateway)?.domain ||
          "TaxAdvocateGroup.com";

        updatedEntry.senderEmail = `${updatedEntry.senderEmailPrefix}@${gatewayDomain}`;
      }

      return updatedEntry;
    });
  };

  const handleScheduleRuleChange = (field, value) => {
    setScheduleEntryRules((prevRules) => ({
      ...prevRules,
      [field]: value,
    }));
  };
  // ✅ Format Names: Sentence Case, Remove "(" and everything after
  const formatName = (name) => {
    return name
      .split("(")[0]
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  // ✅ Process Uploaded CSV File
  const [selectedFile, setSelectedFile] = useState(null); // ✅ Store file in state
  const generatePreviewMessage = (messageTemplate, recipient) => {
    if (!messageTemplate) return ""; // Handle empty messages gracefully

    let message = messageTemplate;

    // Replace {name} placeholder if the name exists
    message = message.replace("{name}", recipient.name || "");

    // Replace {pastDueAmount} placeholder if pastDueAmount exists
    message = message.replace(
      "{pastDueAmount}",
      recipient.pastDueAmount ? `$${recipient.pastDueAmount}` : ""
    );

    return message;
  };

  const handleFileUpload = async () => {
    if (!selectedFile) {
      alert("❌ No file selected!");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const cleanedContent = e.target.result.replace(/\u0000/g, "");
        const jsonData = await csv().fromString(cleanedContent);

        const processedData = jsonData.map((row) => {
          const rowTrimmed = Object.fromEntries(
            Object.entries(row).map(([key, value]) => [key.trim(), value])
          );

          return {
            caseId: rowTrimmed["Case #"] || "",
            name: formatName(rowTrimmed.Name || ""),
            email: rowTrimmed.Email?.trim() || "",
            phoneNumber: rowTrimmed.Cell?.trim() || "",
            contactType, // ✅ Assigned from radio selection
          };
        });

        setUploadedLeads(processedData); // ✅ Store raw leads
        setSelectedFile(null); // ✅ Reset file input after processing
      } catch (error) {
        console.error("Error processing CSV:", error);
        alert("❌ Error processing the uploaded file.");
      }
    };

    reader.readAsText(selectedFile);
  };

  const generateAutoSchedule = (list, scheduleRules, scheduleEntry) => {
    const { maxPerInterval, interval, startTime } = scheduleRules;
    const autoScheduledList = [];

    console.log("🔍 Initial Schedule Rules:", scheduleRules);
    console.log("📅 Starting Time Selection:", startTime);

    // ✅ Find the starting index in the scheduleSlots array
    let startIndex = scheduleSlots.findIndex(
      (slot) => slot.day === startTime.day && slot.time === startTime.time
    );

    // ✅ Default to first slot if not found
    if (startIndex === -1) startIndex = 0;

    console.log(
      `🚀 Starting at index ${startIndex}:`,
      scheduleSlots[startIndex]
    );

    // ✅ Ensure valid leads
    const validLeads = list.filter((lead) => lead.name && lead.email);
    console.log("✅ Valid Leads:", validLeads.length);

    // ✅ Step 1: Use `.map()` to create intervalBatches (Array of Arrays) in a single pass
    const intervalBatches = Array.from(
      { length: Math.ceil(validLeads.length / maxPerInterval) },
      (_, index) =>
        validLeads.slice(index * maxPerInterval, (index + 1) * maxPerInterval)
    );

    console.log("📦 Interval Batches (Before Scheduling):", intervalBatches);

    // ✅ Step 2: Loop through intervalBatches and assign schedule slots
    intervalBatches.forEach((batch, batchIndex) => {
      if (batch.length === 0) return; // Skip empty batches

      const campaignId = uuidv4(); // ✅ Generate shared campaign ID for this batch
      console.log(
        `🆕 Assigned Campaign ID for Batch ${batchIndex + 1}:`,
        campaignId
      );

      // ✅ Assign current scheduling slot
      if (startIndex >= scheduleSlots.length) {
        console.log("🔄 Wrapping to the beginning of the schedule");
        startIndex = 0;
      }

      const scheduledSlot = scheduleSlots[startIndex];
      console.log(
        `📅 Scheduling Batch ${batchIndex + 1} at: ${scheduledSlot.day} - ${
          scheduledSlot.time
        }`
      );

      // ✅ Assign batch leads a shared `campaignId`
      batch.forEach((lead) => {
        console.log(`✉️ Scheduling Lead: ${lead.name} | ${lead.email}`);

        autoScheduledList.push({
          name: lead.name,
          email: lead.email,
          phoneNumber: lead.phoneNumber,
          caseId: lead.caseId,
          contactType: lead.contactType,
          scheduledDrops: [
            {
              campaignId, // ✅ Shared campaign ID for this batch
              scheduledDay: scheduledSlot.day,
              scheduledTime: scheduledSlot.time,
              messageType: scheduleEntry.messageType || "email",
              textMessageTrackingNumber:
                scheduleEntry.textMessageTrackingNumber || "",
              textMessageName: scheduleEntry.textMessageName || "",
              textMessage:
                generatePreviewMessage(scheduleEntry.textMessage, lead) || "",
              template: scheduleEntry.template || "",
              senderName: scheduleEntry.senderName || "",
              senderEmailPrefix: scheduleEntry.senderEmailPrefix || "",
            },
          ],
        });
      });

      // ✅ Move to the next scheduling slot based on interval
      console.log(
        `⏩ Moving forward by interval: ${interval} slots from index ${startIndex}`
      );
      startIndex += interval;

      // ✅ Ensure proper looping into the next available time slot
      if (startIndex >= scheduleSlots.length) {
        console.log(
          "🔄 Wrapping to next available slot at beginning of schedule"
        );
        startIndex = startIndex % scheduleSlots.length;
      }

      console.log(
        `📍 New start index after increment: ${startIndex} | New Slot:`,
        scheduleSlots[startIndex]
      );
    });

    console.log("📌 Final Auto-Scheduled List:", autoScheduledList);
    return autoScheduledList;
  };

  const clearScheduleForm = () => {
    setScheduleEntry({
      messageType: "",
      selectedTimeSlot: "",
      gateway: "",
      template: "",
      textMessage: "",
      textMessageName: "",
      textMessageTrackingNumber: "",
      senderName: "",
      senderEmailPrefix: "",
      senderEmail: "",
      day: "",
    });

    setScheduleEntryRules({
      schedulingMethod: "",
      maxPerInterval: "",
      interval: "",
      startTime: "",
    });

    setUploadedLeads([]);
    setContactType("");
  };

  // ✅ Handles both Manual & Auto Scheduling

  const handleSchedule = () => {
    const campaignId = uuidv4(); // ✅ Generate ONE Campaign ID per schedule entry

    let scheduledLeadsBatch = [];

    if (scheduleEntryRules.schedulingMethod === "manual") {
      scheduledLeadsBatch = uploadedLeads.map((lead) => ({
        ...lead,
        scheduledDrops: [
          {
            campaignId, // ✅ Shared campaign ID
            scheduledDay: scheduleEntry.day,
            scheduledTime: scheduleEntry.selectedTimeSlot,
            messageType: scheduleEntry.messageType,
            textMessageTrackingNumber: scheduleEntry.textMessageTrackingNumber,
            textMessageName: scheduleEntry.textMessageName,
            textMessage:
              generatePreviewMessage(scheduleEntry.textMessage, lead) || "",
            template: scheduleEntry.template || "",
            senderName: scheduleEntry.senderName || "",
            senderEmailPrefix: scheduleEntry.senderEmailPrefix || "",
            senderEmail: scheduleEntry.senderEmail || "",
          },
        ],
      }));
    } else {
      scheduledLeadsBatch = generateAutoSchedule(
        uploadedLeads,
        scheduleEntryRules,
        scheduleEntry
      ).map((drop) => ({
        ...drop,
        scheduledDrops: drop.scheduledDrops.map((d) => ({
          ...d,
          campaignId, // ✅ Shared campaign ID
        })),
      }));
    }

    console.log(scheduledLeadsBatch, "batch");
    setScheduleEntryLeads((prev) => [...prev, ...scheduledLeadsBatch]);
    updateScheduledLeads(scheduledLeadsBatch);
    clearScheduleForm();
  };

  // ✅ Prepare the Data for API Call

  // ✅ Handle Sending Messages

  return (
    <div className="card scheduled-upload-container">
      <h3 className="title">📅 Schedule a Message Drop</h3>

      <div className="form-group">
        <label>📂 Classify This List:</label>
        <div className="radio-group">
          <label>
            <input
              type="radio"
              value="client"
              checked={contactType === "client"}
              onChange={(e) => setContactType(e.target.value)}
            />{" "}
            Clients
          </label>
          <label>
            <input
              type="radio"
              value="prospect"
              checked={contactType === "prospect"}
              onChange={(e) => setContactType(e.target.value)}
            />{" "}
            Prospects
          </label>
        </div>
      </div>

      {/* Step 2: Show Upload Section AFTER Client/Prospect Selection */}
      {contactType.length > 0 && (
        <div className="form-group">
          <label>📂 Upload CSV File:</label>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setSelectedFile(e.target.files[0])} // ✅ Store file in state
            className="file-input"
          />
          {uploadedLeads.length === 0 && (
            <button
              onClick={handleFileUpload}
              className="button primary"
              disabled={!selectedFile} // Disable button until a file is selected
            >
              📤 Process CSV
            </button>
          )}
        </div>
      )}

      {uploadedLeads.length > 0 && (
        <>
          <div className="form-group">
            <label>🕒 Scheduling Method:</label>
            <select
              onChange={(e) =>
                handleScheduleRuleChange("schedulingMethod", e.target.value)
              }
              className="input-field"
            >
              <option value="">Select A Scheduling Method</option>
              <option value="manual">Manual (Select Time Slot)</option>
              <option value="auto">
                Auto-Paced (Spread Throughout the Day)
              </option>
            </select>
          </div>

          {scheduleEntryRules.schedulingMethod === "auto" && (
            <>
              <div className="form-group">
                <label>⏳ Max Per Interval (1 - 150):</label>
                <input
                  type="number"
                  min="1"
                  max="150"
                  value={scheduleEntryRules.maxPerInterval}
                  onChange={(e) =>
                    handleScheduleRuleChange("maxPerInterval", e.target.value)
                  }
                  className="input-field"
                />
              </div>

              <div className="form-group">
                <label>🔁 Send Interval:</label>
                <select
                  onChange={(e) =>
                    handleScheduleRuleChange("interval", Number(e.target.value))
                  }
                  className="input-field"
                >
                  <option value="">Select Interval</option>
                  <option value="1">Every Slot (Every Hour)</option>
                  <option value="2">Every 2 Slots (Every 2 Hours)</option>
                  <option value="4">Every 4 Slots (Every 4 Hours)</option>
                  <option value="8">Next Day at Same Time</option>
                  <option value="16">Skip a Full Day</option>
                </select>
              </div>

              <div className="form-group">
                <label>📅 Start Time:</label>
                <select
                  onChange={(e) =>
                    handleScheduleRuleChange(
                      "startTime",
                      JSON.parse(e.target.value)
                    )
                  }
                  className="input-field"
                >
                  <option value="">Select Start Time</option>
                  {scheduleSlots.map((slot, index) => (
                    <option key={index} value={JSON.stringify(slot)}>
                      {slot.day} - {slot.time}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {scheduleEntryRules.schedulingMethod === "manual" && (
            <>
              <div className="form-group">
                <label>📅 Select Drop Day:</label>
                <select
                  onChange={(e) =>
                    setScheduleEntry({ ...scheduleEntry, day: e.target.value })
                  }
                  className="input-field"
                >
                  <option value="">Select Day</option>
                  {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map(
                    (day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div className="form-group">
                <label>🕒 Select Drop Time:</label>
                <select
                  onChange={(e) =>
                    setScheduleEntry({
                      ...scheduleEntry,
                      selectedTimeSlot: e.target.value,
                    })
                  }
                  className="input-field"
                >
                  <option value="">Select Time</option>
                  {[
                    "8:00 AM",
                    "9:00 AM",
                    "10:00 AM",
                    "11:00 AM",
                    "12:00 PM",
                    "1:00 PM",
                    "2:00 PM",
                    "3:00 PM",
                  ].map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="form-group">
            <label>📩 Message Type:</label>
            <select
              onChange={(e) =>
                setScheduleEntry({
                  ...scheduleEntry,
                  messageType: e.target.value,
                })
              }
              className="input-field"
            >
              <option value="">Select Type</option>
              <option value="email">Email</option>
              <option value="text">Text</option>
            </select>
          </div>

          {scheduleEntry.messageType === "email" && (
            <div>
              {/* Select Email Template */}
              <div className="form-group">
                <label>📜 Email Template:</label>
                <select
                  onChange={(e) =>
                    setScheduleEntry({
                      ...scheduleEntry,
                      template: e.target.value,
                    })
                  }
                  className="input-field"
                >
                  <option value="">Select Template</option>
                  {emailTemplates.map((template) => (
                    <option key={template} value={template}>
                      {template}
                    </option>
                  ))}
                </select>
              </div>

              {/* Select Gateway */}
              <div className="form-group">
                <label>🌐 Email Gateway:</label>
                <select
                  onChange={(e) =>
                    setScheduleEntry({
                      ...scheduleEntry,
                      gateway: e.target.value,
                    })
                  }
                  className="input-field"
                >
                  <option value="">Select Gateway</option>
                  {gateways.map((gateway) => (
                    <option key={gateway.name} value={gateway.name}>
                      {gateway.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sender Name */}
              <div className="form-group">
                <label>👤 Sender Name:</label>
                <input
                  type="text"
                  value={scheduleEntry.senderName}
                  onChange={(e) =>
                    setScheduleEntry({
                      ...scheduleEntry,
                      senderName: e.target.value,
                    })
                  }
                  className="input-field"
                />
              </div>

              {/* Sender Email Prefix */}
              <div className="form-group">
                <label>📧 Sender Email Prefix:</label>
                <input
                  type="text"
                  value={scheduleEntry.senderEmailPrefix}
                  onChange={(e) =>
                    setScheduleEntry({
                      ...scheduleEntry,
                      senderEmailPrefix: e.target.value,
                    })
                  }
                  className="input-field"
                />
              </div>

              {/* Display Full Sender Email Address */}
              <div className="form-group">
                <label>📨 Sender Email Address:</label>
                <input
                  type="text"
                  value={
                    scheduleEntry.senderEmailPrefix && scheduleEntry.gateway
                      ? `${scheduleEntry.senderEmailPrefix}@${
                          gateways.find((g) => g.name === scheduleEntry.gateway)
                            ?.domain || "TaxAdvocateGroup.com"
                        }`
                      : ""
                  }
                  readOnly
                  onChange={(e) =>
                    setScheduleEntry({
                      ...scheduleEntry,
                      senderEmail: e.target.value,
                    })
                  }
                  className="input-field"
                />
              </div>
            </div>
          )}

          {scheduleEntry.messageType === "text" && (
            <div>
              {/* Select Text Message */}
              <div className="form-group">
                <label>💬 Select Text Message:</label>
                <select
                  onChange={(e) => {
                    const selectedMessage = textMessages.find(
                      (msg) => msg.name === e.target.value
                    );

                    setScheduleEntry({
                      ...scheduleEntry,
                      textMessageName: selectedMessage?.name || "",
                      textMessageTrackingNumber:
                        selectedMessage?.trackingNumber || "",
                      textMessage: selectedMessage?.text || "",
                    });
                  }}
                  className="input-field"
                >
                  <option value="">Select Message</option>
                  {textMessages.map((msg) => (
                    <option key={msg.name} value={msg.name}>
                      {msg.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Display & Edit Message Preview */}
              {scheduleEntry.textMessage && (
                <div className="form-group">
                  <label>📄 Edit Message (Optional):</label>
                  <textarea
                    className="input-field"
                    value={scheduleEntry.textMessage}
                    onChange={(e) =>
                      setScheduleEntry({
                        ...scheduleEntry,
                        textMessage: e.target.value,
                      })
                    }
                  />
                </div>
              )}
            </div>
          )}

          {/* Button to add leads to the schedule (updates context but doesn’t submit yet) */}

          <button
            className="button primary update-button"
            onClick={handleSchedule}
            disabled={!uploadedLeads.length}
          >
            📋 Update Schedule
          </button>

          {/* Show Send Button only when there are scheduled leads */}

          {message && <p className="message">{message}</p>}
        </>
      )}

      <div className="scheduled-leads-panel-container">
        <ScheduledLeadsPanel
          scheduledLeads={scheduledLeads}
          updateScheduledLeads={updateScheduledLeads}
        />
      </div>
    </div>
  );
};

export default ScheduledUpload;
