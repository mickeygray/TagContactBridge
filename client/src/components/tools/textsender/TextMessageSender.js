import React, { useMemo, useState, useContext } from "react";
import { csv } from "csvtojson";
import TextContext from "../../../context/text/textContext";

const DOMAIN_OPTIONS = ["TAG", "WYNN", "AMITY", "PROSPECTS"];

// Domain selects which phone number gets injected into {phone}
const DOMAIN_PHONE = {
  TAG: "310-620-9976",
  WYNN: "310-861-4607",
  AMITY: "818-926-4286",
  PROSPECTS: "0000000000",
};

// Optional starter templates (can expand later)
const predefinedMessages = [
  {
    name: "Payment Reminder",
    text: "Hi {name}, your monthly payment is past due. Call us at {phone}.",
  },
  {
    name: "Case Update",
    text: "Hi {name}, we have an update on your case. Call {phone} when you have a moment.",
  },
  {
    name: "Prospecting",
    text: "Hi {name}, following up about your taxes. If you still need help, call {phone}.",
  },
];

// Safe token replacer
const renderTemplate = (template, vars) =>
  String(template || "").replace(/\{(\w+)\}/g, (_, key) =>
    String(vars[key] ?? "")
  );

const formatFirstName = (name) =>
  String(name || "")
    .split("(")[0]
    .trim()
    .split(" ")[0]
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

export default function TextMessageSenderSimple() {
  const { sendTextMessage } = useContext(TextContext);

  const [domain, setDomain] = useState("TAG");
  const [uploadedList, setUploadedList] = useState([]);

  const [selectedPreset, setSelectedPreset] = useState("");
  const [messageBody, setMessageBody] = useState("");

  // Variables user can set (global per send)
  const [vars, setVars] = useState({
    url: "",
  });

  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");

  const phone = DOMAIN_PHONE[domain] || "";

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const content = ev.target.result.replace(/\u0000/g, "");
        const rows = await csv().fromString(content);

        const processed = rows
          .map((row) => {
            const name = formatFirstName(row["Name"] || row.name || "");
            const cell = String(row["Cell"] || row.cell || "")
              .trim()
              .replace(/\D/g, "");
            return cell ? { name, phoneNumber: cell } : null;
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

  const handleSelectPreset = (e) => {
    const presetName = e.target.value;
    setSelectedPreset(presetName);

    const preset = predefinedMessages.find((m) => m.name === presetName);
    if (preset) setMessageBody(preset.text);
  };

  // Inserts token at cursor position (better than appending)
  const insertToken = (token) => {
    const textarea = document.getElementById("sms-message");
    if (!textarea) {
      setMessageBody((prev) => `${prev}${token}`);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next =
      messageBody.substring(0, start) + token + messageBody.substring(end);

    setMessageBody(next);

    // put cursor after inserted token
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + token.length;
    });
  };

  const preview = useMemo(() => {
    return uploadedList.slice(0, 3).map((r) => {
      const rendered = renderTemplate(messageBody, {
        name: r.name,
        phone,
        url: vars.url,
      });
      return { name: r.name, text: rendered };
    });
  }, [uploadedList, messageBody, phone, vars.url]);

  const handleSend = async () => {
    if (!messageBody.trim()) {
      setFeedback("⚠️ Type a message or pick a template.");
      return;
    }
    if (!uploadedList.length) {
      setFeedback("⚠️ Upload a CSV first.");
      return;
    }
    if (!phone) {
      setFeedback("⚠️ Missing domain phone mapping.");
      return;
    }

    setSending(true);
    setFeedback("");

    try {
      const payload = uploadedList.map((r) => ({
        trackingNumber: phone, // <-- domain-driven
        phoneNumber: r.phoneNumber, // recipient
        message: renderTemplate(messageBody, {
          name: r.name,
          phone,
          url: vars.url,
        }),
      }));

      await sendTextMessage(payload);
      setFeedback("✅ Messages sent successfully");
      setUploadedList([]);
      setSelectedPreset("");
      setMessageBody("");
      setVars({ url: "" });
    } catch (err) {
      console.error(err);
      setFeedback("❌ Error sending messages");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card email-sender-container">
      <h3 className="title">📩 Bulk Text Sender</h3>

      {/* Domain */}
      <label>🌐 Domain</label>
      <select value={domain} onChange={(e) => setDomain(e.target.value)}>
        {DOMAIN_OPTIONS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      <label>📞 Tracking Number (auto)</label>
      <input value={phone} readOnly />

      {/* Upload */}
      <label>📂 Upload CSV</label>
      <input type="file" accept=".csv" onChange={handleFileUpload} />
      {uploadedList.length > 0 && (
        <p style={{ marginTop: 6, marginBottom: 0 }}>
          Loaded: <strong>{uploadedList.length}</strong>
        </p>
      )}

      {/* Preset */}
      <label style={{ marginTop: 12 }}>✍️ Template (optional)</label>
      <select value={selectedPreset} onChange={handleSelectPreset}>
        <option value="">— Custom message —</option>
        {predefinedMessages.map((m) => (
          <option key={m.name} value={m.name}>
            {m.name}
          </option>
        ))}
      </select>

      {/* Token buttons */}
      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}
      >
        <button type="button" onClick={() => insertToken("{name}")}>
          + {"{name}"}
        </button>
        <button type="button" onClick={() => insertToken("{phone}")}>
          + {"{phone}"}
        </button>
        <button type="button" onClick={() => insertToken("{url}")}>
          + {"{url}"}
        </button>
      </div>

      {/* Variable inputs (only for tokens that need user values) */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ marginBottom: 6 }}>Variables</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <small style={{ opacity: 0.8 }}>
              <strong>{"{url}"}</strong> value
            </small>
            <input
              value={vars.url}
              onChange={(e) => setVars((p) => ({ ...p, url: e.target.value }))}
              placeholder="https://..."
            />
          </div>
        </div>
      </div>

      {/* Message */}
      <label>📝 Message</label>
      <textarea
        id="sms-message"
        rows={4}
        value={messageBody}
        onChange={(e) => setMessageBody(e.target.value)}
        placeholder="Type your message… Use the buttons above to insert tokens."
        style={{
          width: "100%",
          padding: "0.5rem",
          borderRadius: 8,
          border: "1px solid #ccc",
        }}
      />

      {/* Preview */}
      {messageBody && uploadedList.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <strong>Preview (first 3)</strong>
          <ul style={{ marginTop: 6 }}>
            {preview.map((p, i) => (
              <li key={i}>
                <strong>{p.name}:</strong> {p.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Send */}
      <button
        className="button primary"
        onClick={handleSend}
        disabled={sending || !uploadedList.length || !messageBody.trim()}
        style={{ marginTop: 12 }}
      >
        {sending ? "🚀 Sending…" : "📨 Send Messages"}
      </button>

      {feedback && <p className="message">{feedback}</p>}
    </div>
  );
}
