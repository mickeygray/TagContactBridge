import React, { useState } from "react";
import { csv } from "csvtojson";
import EmailContext from "../../context/email/emailContext";
import ListContext from "../../context/list/listContext";
const emailTemplates = [
  "welcome",
  "transcripts-1",
  "433a-1",
  "433a-1Wynn",
  "433a-1Amity",
  "433a-2",
  "marketing-1",
  "marketing-2",
  "marketing-3",
  "TaxReturns-1",
  "TaxReturns-2",
  "TaxReturnsWynn-1",
  "TaxReturnsWynn-2",
  "TaxReturnsAmity-1",
  "past-due",
  "past-dueWynn",
  "important-update",
  "Extensions-1",
  "Extensions-1Amity",
  "poa-tag",
  "tax-organizer-urgent",
  "tax-organizer-urgent-2",
  "tax-organizer-urgent-3",
  "tax-organizer-urgent-amity",
];

const originators = [
  { settlementOfficer: "Eva Gray", emailPrefix: "egray" },
  { settlementOfficer: "Eli Hayes", emailPrefix: "ehayes" },
  { settlementOfficer: "Bruce Allen", emailPrefix: "ballen" },
  { settlementOfficer: "Phil Olson", emailPrefix: "polson" },
  { settlementOfficer: "Matt Anderson", emailPrefix: "matt" },
  { settlementOfficer: "Hailey Davis", emailPrefix: "hdavis" },
  { settlementOfficer: "Jake Wallace", emailPrefix: "jwallace" },
  { settlementOfficer: "Dani Pearson", emailPrefix: "dpearson" },
  { settlementOfficer: "Kassy Burton", emailPrefix: "kburton" },
  { settlementOfficer: "Andrew Wells", emailPrefix: "awells" },
];
const defaultSenders = {
  "past-due": { senderName: "Hailey Davis", senderEmailPrefix: "hdavis" },
  "past-duewynn": { senderName: "Hailey Davis", senderEmailPrefix: "hdavis" },
  "433a-1": { senderName: "Matt Anderson", senderEmailPrefix: "matt" },
  "433a-2": { senderName: "Matt Anderson", senderEmailPrefix: "matt" },
  "433a-1Wynn": { senderName: "Matt Anderson", senderEmailPrefix: "matt" },
  "important-update": {
    senderName: "Matt Anderson",
    senderEmailPrefix: "matt",
  },
};

const ManualEmailSender = () => {
  const { sendTaxAdEmails, sendWynnEmails, sendAmityEmails } =
    React.useContext(EmailContext);

  const { getClientCreatedTodayList, clients } = React.useContext(ListContext);

  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [uploadedList, setUploadedList] = useState([]);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [smtpGateway, setSMTPGateway] = useState(null); // 🚀 Sends to correct API
  const [senderName, setSenderName] = useState(""); // 🚀 Overrides if filled
  const [senderEmailPrefix, setSenderEmailPrefix] = useState(""); // 🚀 Overrides if filled
  const [subject, setSubject] = useState("");
  const [attachment, setAttachment] = useState("none");

  // ✅ Format name properly (Title Case, Remove Extra Data)
  const formatName = (name) => {
    return name
      .split("(")[0]
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .replace(/\B\w/g, (char) => char.toLowerCase())
      .trim();
  };

  // ✅ Process uploaded CSV
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !selectedTemplate) {
      alert("Please select an email template before uploading a list.");
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

          const settlementOfficer = rowTrimmed["Settlement Officer"]?.trim();
          const matchedOriginator = originators.find(
            (o) => o.settlementOfficer === settlementOfficer
          );

          // Use defaultSender for the selected template, fallback to originator or Matt Anderson
          const defaultSender = defaultSenders[selectedTemplate] || {
            senderName: "Matthew Anderson",
            senderEmailPrefix: "matt",
          };

          return {
            name: formatName(rowTrimmed.Name || ""),
            email: rowTrimmed.Email?.trim() || "",
            cell: rowTrimmed.Cell?.trim() || "",
            home: rowTrimmed.Home?.trim() || "",
            workPhone: rowTrimmed["Work Phone"]?.trim() || "",
            address: rowTrimmed.Address?.trim() || "",
            city: rowTrimmed.City?.trim() || "",
            state: rowTrimmed.State?.trim() || "",
            lastInvoiceDate: rowTrimmed["Last Invoice Date"] || "N/A",
            lastInvoiceAmount:
              parseFloat(rowTrimmed["Last Invoice Amount"]) || null,
            settlementOfficer: settlementOfficer || "N/A",
            senderName:
              senderName ||
              matchedOriginator?.settlementOfficer ||
              defaultSender.senderName,
            senderEmailPrefix:
              senderEmailPrefix ||
              matchedOriginator?.emailPrefix ||
              defaultSender.senderEmailPrefix,
          };
        });

        const filteredData = processedData.filter(
          (entry) =>
            entry.email &&
            (entry.lastInvoiceAmount === undefined ||
              entry.lastInvoiceAmount === null ||
              entry.lastInvoiceAmount !== 0)
        );

        setUploadedList(filteredData);
      } catch (error) {
        console.error("Error processing CSV:", error);
        alert("Error processing the uploaded file.");
      }
    };

    reader.readAsText(file);
  };

  console.log(subject, uploadedList.length, selectedTemplate);
  const handleSendEmails = async () => {
    if (!subject || !selectedTemplate) {
      setMessage("Please fill out all fields and upload a recipient list.");
      return;
    }

    if (smtpGateway === null) {
      setMessage("Please Select A Sender Gateway");
      return;
    }

    setSending(true);
    setMessage("");

    const domainMap = {
      TaxAdvocate: "TaxAdvocateGroup.com",
      Wynn: "WynnTaxSolutions.com",
      Amity: "AmityTaxGroup.com",
    };

    const domain = domainMap[smtpGateway] || "TaxAdvocateGroup.com";
    const rawList = uploadedList.length > 0 ? uploadedList : clients;

    const processedList = rawList.map((recipient) => {
      const name = recipient.name || recipient.Name || "Unnamed";
      const formattedName = name
        .split("(")[0]
        .replace(/\b\w/g, (char) => char.toUpperCase())
        .replace(/\B\w/g, (char) => char.toLowerCase())
        .trim();

      const matchedOriginator = originators.find(
        (o) =>
          o.settlementOfficer === recipient.settlementOfficer ||
          o.settlementOfficer === recipient["Settlement Officer"]
      );

      const defaultSender = defaultSenders[selectedTemplate] || {
        senderName: "Matthew Anderson",
        senderEmailPrefix: "matt",
      };

      return {
        name: formattedName,
        email: recipient.email || recipient.Email || "",
        cell: recipient.cell || recipient.Cell || "",
        home: recipient.home || recipient.Home || "",
        workPhone: recipient.workPhone || recipient["Work Phone"] || "",
        address: recipient.address || recipient.Address || "",
        city: recipient.city || recipient.City || "",
        state: recipient.state || recipient.State || "",
        lastInvoiceDate:
          recipient.lastInvoiceDate || recipient["Last Invoice Date"] || "N/A",
        lastInvoiceAmount:
          parseFloat(
            recipient.lastInvoiceAmount ||
              recipient["Last Invoice Amount"] ||
              "0"
          ) || null,
        settlementOfficer:
          recipient.settlementOfficer ||
          recipient["Settlement Officer"] ||
          "N/A",
        senderName:
          senderName ||
          matchedOriginator?.settlementOfficer ||
          defaultSender.senderName,
        senderEmailPrefix:
          senderEmailPrefix ||
          matchedOriginator?.emailPrefix ||
          defaultSender.senderEmailPrefix,
      };
    });

    const emailPayload = {
      subject,
      attachment,
      template: selectedTemplate,
      list: processedList.map((recipient) => ({
        ...recipient,
        senderEmailFull: `${recipient.senderEmailPrefix}@${domain}`,
      })),
    };

    try {
      if (smtpGateway === "TaxAdvocate") {
        await sendTaxAdEmails(emailPayload);
      } else if (smtpGateway === "Wynn") {
        await sendWynnEmails(emailPayload);
      } else if (smtpGateway === "Amity") {
        await sendAmityEmails(emailPayload);
      }

      setMessage("Emails sent successfully.");
    } catch (error) {
      console.error("Error sending emails:", error);
      setMessage("An error occurred while sending emails.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card email-sender-container">
      <h3 className="title">📩 Manual Email Sender</h3>
      <div className="form-group">
        <label>📜 Email Template:</label>
        <select
          onChange={(e) => setSelectedTemplate(e.target.value)}
          className="input-field"
        >
          <option value="">Select Template</option>
          {emailTemplates.map((template) => (
            <option key={template} value={template}>
              {template}
            </option>
          ))}
        </select>
        <div className="form-group">
          <label>✉️ Use Todays Client List:</label>
          <button
            onClick={(e) => getClientCreatedTodayList()}
            className="btn btn-primary send-button"
          >
            Get Today's List
          </button>
        </div>
      </div>
      {/* Upload CSV */}
      {selectedTemplate && (
        <div className="form-group">
          <label>📂 Upload CSV File:</label>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="file-input"
          />
        </div>
      )}

      {/* Email Subject */}
      <div className="form-group">
        <label>✉️ Email Subject:</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="input-field"
        />
      </div>

      {/* Attachment */}
      <div className="form-group">
        <label>📎 Attachment:</label>
        <select
          value={attachment}
          onChange={(e) => setAttachment(e.target.value)}
          className="input-field"
        >
          <option value="none">None</option>
          <option value="433a.pdf">433-a.pdf</option>
          <option value="document.pdf">Tax Organizer TAG</option>{" "}
          <option value="Amity TO New.pdf">Tax Organizer Amity</option>
        </select>
      </div>

      {/* Sender Overrides */}
      <div className="form-group">
        <label>👤 Override Sender Name:</label>
        <input
          type="text"
          value={senderName}
          onChange={(e) => setSenderName(e.target.value)}
          className="input-field"
        />
      </div>

      <div className="form-group">
        <label>📧 Override Sender Email Prefix:</label>
        <input
          type="text"
          value={senderEmailPrefix}
          onChange={(e) => setSenderEmailPrefix(e.target.value)}
          className="input-field"
        />
      </div>

      {/* Lead or Prospect Selection */}
      <div className="form-group radio-group">
        <h4>📂 Classify This List:</h4>
        <label>
          <input
            type="radio"
            checked={smtpGateway === "TaxAdvocate"}
            onChange={() => setSMTPGateway("TaxAdvocate")}
          />{" "}
          Tax Ad
        </label>
        <label>
          <input
            type="radio"
            checked={smtpGateway === "Wynn"}
            onChange={() => setSMTPGateway("Wynn")}
          />{" "}
          Wynn
        </label>
        <label>
          <input
            type="radio"
            checked={smtpGateway === "Amity"}
            onChange={() => setSMTPGateway("Amity")}
          />{" "}
          Amity
        </label>
      </div>

      {/* Send Button */}
      <button
        className="button primary send-button"
        onClick={handleSendEmails}
        disabled={sending}
      >
        {sending ? "🚀 Sending Emails..." : "📨 Send Emails"}
      </button>

      {message && <p className="message">{message}</p>}
    </div>
  );
};

export default ManualEmailSender;
