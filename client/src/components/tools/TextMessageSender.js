import React, { useState, useContext } from "react";
import { csv } from "csvtojson";
import TextContext from "../../context/text/textContext";
import ListContext from "../../context/list/listContext";
const predefinedMessages = [
  {
    name: "Payment Reminder",
    text: "Hi {name}, your monthly payment for the Tax Advocate Group is past due. Call us at 818-937-0439 to discuss options.",
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
    name: "Prospecting-2",
    text: "{name}, we are filing 2024 returns for our active clients this week, if you still have unfiled taxes or aren't getting a refund when you file, lets talk about how we can fix that for you.",
    trackingNumber: "310-945-2810",
  },
  {
    name: "Prospecting-3",
    text: "Matt here. We spoke recently about your taxes, but haven't heard back from you. If you did not file 2024 or your refund was taken, call us, call 310-945-2810.",
    trackingNumber: "310-945-2810",
  },
  {
    name: "433a followup",
    text: "Hi {name}. This is Matthew from your tax attorneys office. \n\n The Tax Filing deadline is today. We want to make sure you have submitted everything we need to file for you or take appropriate action to file an extension.\n\nIf you have not submitted anything, you need to call us today.If we have spoken to you already, please disregard this message. \n\nCall 818-926-4286, please do not respond via text. ",
    trackingNumber: "818-926-4286",
  },
  {
    name: "Review Request",
    text: "Hi {name}, its Matt from the tax office. Attorney staff reviewed your case, and have determined that your resolution requires updating financial documentation. Call 818-722-9677 so we can update your file and provide you with the proper documentation.",
    trackingNumber: "818-722-9677",
  },
  {
    name: "TO followup",
    text: "Hi {name}. This is Matthew from the tax attorney's office. We recently received documents for your case and need to discuss them. Can you call 818-937-0439 so we can review them. ",
    trackingNumber: "818-937-0439",
  },
];

const TextMessageSender = () => {
  const { sendTextMessage } = useContext(TextContext);
  const { contactList } = useContext(ListContext);
  const [useContactList, setUseContactList] = useState(false);

  const [uploadedList, setUploadedList] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const normalizeContactList = () => {
    return contactList
      .map((entry) => {
        const name = entry.name || entry.Name || entry["Full Name"] || "Client";

        const formattedName = name
          .split("(")[0]
          .trim()
          .split(" ")[0]
          .toLowerCase()
          .replace(/\b\w/g, (char) => char.toUpperCase());

        return {
          name: formattedName,
          phoneNumber:
            entry.cell ||
            entry.Cell ||
            entry.home ||
            entry.Home ||
            entry.WorkPhone ||
            "",
          pastDueAmount:
            parseFloat(
              entry.lastInvoiceAmount || entry["Last Invoice Amount"]
            ) || "",
        };
      })
      .filter((e) => e.phoneNumber);
  };

  // ✅ **Handle CSV Upload**
  // ✅ Format name properly: Sentence Case & Remove Extra Data
  const formatName = (name) => {
    return name
      .split("(")[0] // Remove everything after "("
      .trim()
      .split(" ")[0] // Get only the first word (assumed first name)
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase()); // Capitalize first letter
  };

  // ✅ Handle CSV Upload
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const cleanedContent = e.target.result.replace(/\u0000/g, "");
        const jsonData = await csv().fromString(cleanedContent);

        const processedData = jsonData.map((row) => {
          const rowTrimmed = Object.fromEntries(
            Object.entries(row).map(([key, value]) => [
              key.replace(/\s+/g, "").toLowerCase(), // Normalize key
              value,
            ])
          );

          return {
            name: formatName(rowTrimmed.name || ""), // ✅ Format name
            phoneNumber: rowTrimmed.cell?.trim() || "",
            pastDueAmount: rowTrimmed.pastdueamount
              ? parseFloat(rowTrimmed.pastdueamount).toFixed(2) // ✅ Ensure two decimal places
              : "",
          };
        });

        const filteredData = processedData.filter((entry) => entry.phoneNumber);
        setUploadedList(filteredData);
      } catch (error) {
        console.error("Error processing CSV:", error);
        alert("Error processing the uploaded file.");
      }
    };

    reader.readAsText(file);
  };

  // ✅ **Set Message from Dropdown**
  const handleSelectMessage = (e) => {
    const selected = predefinedMessages.find(
      (msg) => msg.name === e.target.value
    );
    if (!selected) return;

    setSelectedMessage(selected);

    // If no uploaded list, fall back to contactList and normalize
    if (uploadedList.length === 0 && contactList.length > 0) {
      const normalized = contactList
        .map((entry) => {
          const name =
            entry.name || entry.Name || entry["Full Name"] || "Client";

          const formattedName = name
            .split("(")[0]
            .trim()
            .split(" ")[0]
            .toLowerCase()
            .replace(/\b\w/g, (char) => char.toUpperCase());

          return {
            name: formattedName,
            phoneNumber:
              entry.cell ||
              entry.Cell ||
              entry.home ||
              entry.Home ||
              entry.WorkPhone ||
              "",
            pastDueAmount:
              parseFloat(
                entry.lastInvoiceAmount || entry["Last Invoice Amount"]
              ) || "",
          };
        })
        .filter((e) => e.phoneNumber);

      setUploadedList(normalized); // now "uploadedList" holds a fully usable fallback list
    }
  };

  // ✅ **Generate Message Preview**
  const generatePreviewMessage = (recipient) => {
    let message = selectedMessage.text;

    // Replace {name} placeholder if name exists
    message = message.replace("{name}", recipient.name || "");

    // Replace {pastDueAmount} placeholder if pastDueAmount exists
    message = message.replace(
      "{pastDueAmount}",
      recipient.pastDueAmount ? `$${recipient.pastDueAmount}` : ""
    );

    return message;
  };

  // ✅ **Handle Send Messages (Calls `sendTextMessage`)**
  const handleSendTextMessages = async () => {
    if (!selectedMessage) {
      setMessage("⚠️ Please select a message.");
      return;
    }

    const baseList =
      uploadedList.length > 0 ? uploadedList : normalizeContactList();

    if (baseList.length === 0) {
      setMessage("⚠️ No recipients found.");
      return;
    }

    setSending(true);
    setMessage("");

    const messagesPayload = baseList.map((recipient) => ({
      trackingNumber: selectedMessage.trackingNumber,
      phoneNumber: recipient.phoneNumber,
      message: generatePreviewMessage(recipient),
    }));

    try {
      await sendTextMessage(messagesPayload);
      setMessage("✅ Messages sent successfully.");
    } catch (error) {
      console.error("❌ Error sending messages:", error);
      setMessage("❌ An error occurred while sending messages.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card text-sender-container">
      <h3 className="title">📩 Bulk Text Message Sender</h3>
      {/* ✅ Choose List Source */}
      {contactList.length > 0 && (
        <div className="form-group radio-group">
          <h4>📂 Choose List Source:</h4>
          <label>
            <input
              type="radio"
              checked={!useContactList}
              onChange={() => setUseContactList(false)}
            />{" "}
            Use Uploaded List
          </label>
          <label>
            <input
              type="radio"
              checked={useContactList}
              onChange={() => setUseContactList(true)}
            />{" "}
            Use Contact List ({contactList.length} entries)
          </label>
        </div>
      )}

      {/* Upload CSV */}
      <div className="form-group">
        <label>📂 Upload CSV File:</label>
        <input
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          className="file-input"
        />
      </div>

      {/* Select Predefined Message */}
      <div className="form-group">
        <label>✍️ Select Message:</label>
        <select onChange={handleSelectMessage} className="input-field">
          <option value="">Select a Message</option>
          {predefinedMessages.map((msg) => (
            <option key={msg.name} value={msg.name}>
              {msg.name}
            </option>
          ))}
        </select>
      </div>

      {/* Message Preview */}
      {/* ✅ Message Preview */}
      <div className="preview-section">
        <h4>🔍 Message Preview</h4>
        {(() => {
          const baseList = useContactList
            ? normalizeContactList()
            : uploadedList.length > 0
            ? uploadedList
            : normalizeContactList();

          return baseList.length > 0 ? (
            <ul>
              {baseList.slice(0, 5).map((recipient, index) => (
                <li key={index}>
                  <strong>{recipient.name}:</strong>{" "}
                  {generatePreviewMessage(recipient)}
                </li>
              ))}
            </ul>
          ) : (
            <p>No recipients available.</p>
          );
        })()}
      </div>

      {/* Send Button */}
      <button
        className="button primary send-button"
        onClick={handleSendTextMessages}
        disabled={sending}
      >
        {sending ? "🚀 Sending Messages..." : "📨 Send Messages"}
      </button>

      {message && <p className="message">{message}</p>}
    </div>
  );
};

export default TextMessageSender;
