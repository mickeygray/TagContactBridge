import React, { useState, useContext } from "react";
import { csv } from "csvtojson";
import TextContext from "../../../context/text/textContext";
import ListContext from "../../../context/list/listContext";
import MessageContext from "../../../context/message/messageContext";

const predefinedMessages = [
  {
    name: "Payment Reminder",
    text: "Hi {name}, your monthly payment for the Tax Advocate Group is past due. Call us at 818-937-0439 to discuss options.",
    trackingNumber: "818-937-0439",
  },
  {
    name: "Extension Notice",
    text: "Hi {name}, Cameron from the Tax Advocate Group. We have been trying to reach you about dealing with 2024. Call us today to to update your case file.",
    trackingNumber: "310-861-9120",
  },
  {
    name: "Prospecting-1",
    text: "Hi {name}, we recently spoke about your taxes. Lets resolve your obligations and get you a refund for 2024. I'm available for a call today. You can reach me here.",
    trackingNumber: "310-945-2810",
  },
  {
    name: "Prospecting-2",
    text: "{name}, we are filing 2024 returns for our active clients this week, if you still have unfiled taxes or aren't getting a refund when you file, lets talk about how we can fix that for you.",
    trackingNumber: "310-945-2810",
  },
  {
    name: "Prospecting-3",
    text: "Cameron here. We spoke recently about your taxes, but haven't heard back from you. If you did not file 2024 or your refund was taken, call us, call 310-945-2810.",
    trackingNumber: "310-945-2810",
  },
  {
    name: "2026 Tax Filing 1",
    text: "Hi {name}. This is your tax attorney's office. We are preparing to file 2025 for all active clients, and want to update your case so that we can submit all necessary paperwork in a timely manner. Call 818-926-4286 and a senior consultant will help you get ready to file taxes.",
    trackingNumber: "818-926-4286",
  },
  {
    name: "Review Request",
    text: "Hi {name}, its Cameron from the tax office. Attorney staff reviewed your case, and have determined that your resolution requires updating financial documentation. Call 818-722-9677 so we can update your file and provide you with the proper documentation.",
    trackingNumber: "818-722-9677",
  },
  {
    name: "TO followup",
    text: "Hi {name}. This is Cameron from the tax attorney's office. We recently received documents for your case and need to discuss them. Can you call 818-937-0439 so we can review them. ",
    trackingNumber: "818-937-0439",
  },
  {
    name: "Prepare Finance",
    text: "Hey {name}, it’s Cameron from your tax attorney's office. We’re preparing a financial statement for your case and want to make sure all information is current and correct, call me at 818-722-9677 when you have a moment to discuss.",
    trackingNumber: "818-722-9677",
  },
  {
    name: "Extension Text",
    text: "{name}, The 2024 filing extension deadline is fast approaching.  Filing late can lead to the IRS revoking your protected status or increasing their collection actions. Contact us at 818-722-9677 to stay on track. ",
    trackingNumber: "818-722-9677",
  },
];

const TextMessageSender = () => {
  const { sendTextMessage } = useContext(TextContext);
  const { filterList, filteredClients, clearFilterList } =
    useContext(ListContext);
  const { startLoading, stopLoading } = useContext(MessageContext);
  const [domain, setDomain] = useState("TAG");
  const [uploadedList, setUploadedList] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isFiltered, setIsFiltered] = useState(false);
  // Format first name properly
  const formatName = (name) =>
    name
      .split("(")[0]
      .trim()
      .split(" ")[0]
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const content = ev.target.result.replace(/\u0000/g, "");
        const rows = await csv().fromString(content);
        const processed = rows
          .map((row) => {
            const name = formatName(row["Name"] || row.name || "");
            const phone = (row["Cell"] || row.cell || "")
              .trim()
              .replace(/\D/g, "");
            const pastDue = row["PastDue"] || row.pastdueamount || "";
            const caseNumber = (row["Case #"] || row.caseNumber || "")
              .toString()
              .trim();
            return phone
              ? { name, phoneNumber: phone, pastDueAmount: pastDue, caseNumber }
              : null;
          })
          .filter(Boolean);
        setUploadedList(processed);
        setFeedback(`✅ Loaded ${processed.length} contacts`);
      } catch (err) {
        console.error(err);
        setFeedback("❌ Failed to parse CSV");
      }
    };
    reader.readAsText(file);
  };

  const handleSelectMessage = (e) => {
    const msg = predefinedMessages.find((m) => m.name === e.target.value);
    setSelectedMessage(msg || null);
  };

  const generateMessage = ({ name, pastDueAmount }) => {
    return selectedMessage.text
      .replace("{name}", name)
      .replace("{pastDueAmount}", pastDueAmount ? `$${pastDueAmount}` : "");
  };

  const handleFilterList = async () => {
    if (!uploadedList.length) return;
    try {
      startLoading();
      await filterList(uploadedList, domain);
      setIsFiltered(true);
      setFeedback(`✅ ${filteredClients.length} clients passed filter`);
    } catch (err) {
      console.error(err);
      setFeedback("❌ Filter failed—see console");
    } finally {
      stopLoading();
    }
  };

  const handleClearFilter = () => {
    setIsFiltered(false);
    clearFilterList();
    setFeedback("Filter cleared, using raw list");
  };

  const handleSend = async () => {
    if (!selectedMessage) {
      setFeedback("⚠️ Please select a text template");
      return;
    }
    const baseList = isFiltered ? filteredClients : uploadedList;
    if (baseList.length === 0) {
      setFeedback("⚠️ No contacts to send");
      return;
    }

    setSending(true);
    setFeedback("");
    try {
      const payload = baseList.map((r) => ({
        trackingNumber: selectedMessage.trackingNumber,
        phoneNumber: r.phoneNumber,
        message: generateMessage(r),
      }));
      await sendTextMessage(payload);
      setFeedback("✅ Messages sent successfully");
      setUploadedList([]);
      setSelectedMessage(null);
      if (isFiltered) handleClearFilter();
    } catch (err) {
      console.error(err);
      setFeedback("❌ Error sending messages");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card p-4 text-sender-container">
      <h3 className="text-xl font-semibold mb-4">📩 Bulk Text Sender</h3>

      {/* CSV Upload */}
      <div className="form-group mb-4">
        <label className="block mb-2">📂 Upload CSV:</label>
        <input
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          className="input"
        />
      </div>

      {/* Message Selector */}
      <div className="form-group mb-4">
        <label className="block mb-2">✍️ Select Template:</label>
        <select
          value={selectedMessage?.name || ""}
          onChange={handleSelectMessage}
          className="input"
        >
          <option value="">-- Choose a Message --</option>
          {predefinedMessages.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {/* Preview first 5 */}
      {selectedMessage &&
        (filteredClients?.length || uploadedList.length) > 0 && (
          <div className="preview-section mb-4">
            <h4 className="font-semibold mb-2">
              🔍 {filteredClients?.length > 0 ? "Filtered Preview" : "Preview"}
            </h4>
            <ul className="list-disc pl-5">
              {(filteredClients?.length > 0 ? filteredClients : uploadedList)
                .slice(0, 5)
                .map((r, i) => (
                  <li key={i}>
                    <strong>{r.name}:</strong> {generateMessage(r)}
                  </li>
                ))}
              {(filteredClients?.length > 0 ? filteredClients : uploadedList)
                .length > 5 && (
                <li>
                  …and{" "}
                  {(filteredClients?.length > 0
                    ? filteredClients
                    : uploadedList
                  ).length - 5}{" "}
                  more
                </li>
              )}
            </ul>
          </div>
        )}

      {/* Send Button */}
      <select name="domain" onChange={(e) => setDomain(e.target.value)}>
        <option value="TAG">TAG</option>
        <option value="AMITY">AMITY</option>
        <option value="WYNN">WYNN</option>
      </select>
      <button className="button primary" onClick={handleFilterList}>
        Filter Uploaded List
      </button>
      <button
        className="button primary"
        onClick={handleSend}
        disabled={sending || !selectedMessage || uploadedList.length === 0}
      >
        {sending ? "🚀 Sending…" : "📨 Send Messages"}
      </button>

      {feedback && <p className="mt-3 text-sm">{feedback}</p>}
    </div>
  );
};

export default TextMessageSender;
