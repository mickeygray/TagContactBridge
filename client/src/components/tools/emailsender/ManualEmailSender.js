import React, { useState, useContext } from "react";
import { csv } from "csvtojson";
import EmailContext from "../../../context/email/emailContext";
import ListContext from "../../../context/list/listContext";
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

export default function ManualEmailSender() {
  const { sendEmail } = useContext(EmailContext);

  const { filterList, filteredList, clearFilteredList } =
    useContext(ListContext);

  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [uploadedList, setUploadedList] = useState([]);
  const [filtering, setFiltering] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [customSender, setCustomSender] = useState(false);
  const [domain, setDomain] = useState(null);
  const [senderName, setSenderName] = useState("");
  const [senderEmailPrefix, setSenderEmailPrefix] = useState("");
  const [subject, setSubject] = useState("");
  const [attachment, setAttachment] = useState("none");

  // === helpers ===
  const formatName = (name) =>
    name
      .split("(")[0]
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/\B\w/g, (c) => c.toLowerCase())
      .trim();

  // === CSV upload ===
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

          // Use defaultSender for the selected template, fallback to originator or Matt Anderson

          return {
            name: formatName(rowTrimmed.Name || ""),
            email: rowTrimmed.Email?.trim() || "",
            cell: rowTrimmed.Cell?.trim() || "",
            caseNumber: rowTrimmed["Case #"]?.trim() || "",
            home: rowTrimmed.Home?.trim() || "",
            workPhone: rowTrimmed["Work Phone"]?.trim() || "",
            address: rowTrimmed.Address?.trim() || "",
            city: rowTrimmed.City?.trim() || "",
            state: rowTrimmed.State?.trim() || "",
          };
        });

        setUploadedList(processedData);
      } catch (error) {
        console.error("Error processing CSV:", error);
        alert("Error processing the uploaded file.");
      }
    };

    reader.readAsText(file);
  };

  // === Filter list button ===
  const handleFilterList = async () => {
    if (!uploadedList.length) return;
    setFiltering(true);
    try {
      await filterList(uploadedList);
      setMessage(
        `Filtered down to ${filteredList.length || "0"} passing records.`
      );
    } catch (err) {
      setMessage("Filter failed—see console.");
      console.error(err);
    } finally {
      setFiltering(false);
    }
  };

  // === Send ===
  const handleSendEmails = async () => {
    // 1) basic validation
    if (!subject || !selectedTemplate) {
      setMessage("Please select template & subject.");
      return;
    }
    if (!domain) {
      setMessage("Please pick a domain gateway.");
      return;
    }

    // 2) pick your list
    const rawList = filteredList.length > 0 ? filteredList : uploadedList;
    if (rawList.length === 0) {
      setMessage("No recipients to send to.");
      return;
    }

    setSending(true);
    setMessage("");

    // 3) normalize each recipient
    const processedList = rawList.map((r) => ({
      name: formatName(r.name || r.Name || ""),
      email: (r.email || r.Email || "").trim(),
      cell: (r.cell || r.Cell || "").replace(/\D/g, ""),
      senderName: senderName || "Cameron Pierce",
      senderEmailPrefix: senderEmailPrefix || "cameron",
    }));

    // 4) build your payload
    const emailPayload = {
      template: selectedTemplate,
      subject,
      attachment,
      domain, // e.g. "TAG", "WYNN", "AMITY"
      list: processedList,
    };

    // 5) send
    try {
      await sendEmail(emailPayload);
      setMessage("✅ Emails sent successfully!");
      clearFilteredList();
    } catch (err) {
      console.error("Error sending emails:", err);
      setMessage("❌ Error sending emails.");
    } finally {
      setSending(false);
    }
  };

  // === render ===
  return (
    <div className="card email-sender-container">
      <h3 className="title">📩 Manual Email Sender</h3>

      {/* template picker */}
      <label>Template:</label>
      <select onChange={(e) => setSelectedTemplate(e.target.value)}>
        <option value="">Select…</option>
        {emailTemplates.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <div className="form-group">
        <label>
          <input
            type="checkbox"
            checked={customSender}
            onChange={() => setCustomSender((prev) => !prev)}
          />{" "}
          Use custom sender
        </label>
      </div>

      {customSender ? (
        <>
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
        </>
      ) : (
        <div className="form-group">
          <label>👤 Pick a settlement officer:</label>
          <select
            className="input-field"
            value={senderName}
            onChange={(e) => {
              const sel = originators.find(
                (o) => o.settlementOfficer === e.target.value
              );
              if (sel) {
                setSenderName(sel.settlementOfficer);
                setSenderEmailPrefix(sel.emailPrefix);
              } else {
                setSenderName("");
                setSenderEmailPrefix("");
              }
            }}
          >
            <option value="">— select —</option>
            {originators.map((o) => (
              <option key={o.emailPrefix} value={o.settlementOfficer}>
                {o.settlementOfficer}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* get today's list */}
      <button onClick={handleFilterList}>Filter Uploaded List</button>

      {/* file upload */}
      {selectedTemplate && (
        <>
          <label>Upload CSV:</label>
          <input type="file" accept=".csv" onChange={handleFileUpload} />
        </>
      )}

      {/* subject & attachment */}
      <label>Subject:</label>
      <input value={subject} onChange={(e) => setSubject(e.target.value)} />

      <label>Attach:</label>
      <select
        value={attachment}
        onChange={(e) => setAttachment(e.target.value)}
      >
        <option value="none">None</option>
        <option value="433a.pdf">433-a.pdf</option>
        <option value="document.pdf">Tax Organizer TAG</option>
        <option value="Amity TO New.pdf">Tax Organizer Amity</option>
      </select>

      {/* Filter button */}
      <button
        onClick={handleFilterList}
        disabled={filtering || (!uploadedList.length && !filteredList.length)}
      >
        {filtering ? "Filtering…" : "Filter List"}
      </button>

      {/* gateway radio */}
      <div className="form-group">
        <label>🌐 Domain:</label>
        <select
          className="input-field"
          value={domain || ""}
          onChange={(e) => setDomain(e.target.value)}
        >
          <option value="" disabled>
            Select domain
          </option>
          <option value="TAG">TAG</option>
          <option value="WYNN">WYNN</option>
          <option value="AMITY">AMITY</option>
        </select>
      </div>

      {/* send */}
      <button onClick={handleSendEmails} disabled={sending}>
        {sending ? "🚀 Sending…" : "📨 Send Emails"}
      </button>

      {message && <p className="message">{message}</p>}
    </div>
  );
}
