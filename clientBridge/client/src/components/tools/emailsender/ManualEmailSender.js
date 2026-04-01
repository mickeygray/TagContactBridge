import React, { useState, useMemo } from "react";
import { csv } from "csvtojson";
import { useEmail } from "../../../hooks/useEmail";

const DOMAIN_OPTIONS = ["TAG", "WYNN", "AMITY", "TGC"];

// Keep this tiny: base template + version descriptions
const TEMPLATE_SERIES = {
  TaxOrganizer2026: {
    label: "Tax Organizer 2026 (5-part)",
    versions: {
      1: {
        name: "Welcome",
        intent: "Warm kickoff. ‘Tax season is here—let’s get ready.’",
      },
      2: {
        name: "Checklist + Organizer",
        intent: "Quick checklist + organizer attached.",
      },
      3: {
        name: "Time to file / Schedule",
        intent: "Prompt to schedule so we can file on time.",
      },
      4: { name: "Last call", intent: "Final warning before filing deadline." },
      5: { name: "Extension", intent: "Extension guidance + call to action." },
    },
  },
  TaxOrganizer2026Prospect: {
    label: "Tax Organizer 2026 Prospects",
    versions: {
      1: {
        name: "Welcome — Prospect",
        intent: "Warm kickoff. ‘Tax season is here—let’s get ready.’",
      },
    },
  },
};

export default function ManualEmailSender() {
  const { sendEmails } = useEmail();

  const [domain, setDomain] = useState("TAG");
  const [baseEmailName, setBaseEmailName] = useState("");
  const [index, setIndex] = useState(1);
  const [includeAttachment, setIncludeAttachment] = useState(true);

  const [uploadedList, setUploadedList] = useState([]);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  const series = baseEmailName ? TEMPLATE_SERIES[baseEmailName] : null;

  const versionMeta = useMemo(() => {
    if (!series) return null;
    return series.versions?.[index] || null;
  }, [series, index]);

  const formatName = (name) =>
    String(name || "")
      .split("(")[0]
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/\B\w/g, (c) => c.toLowerCase())
      .trim();

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !baseEmailName) {
      alert("Select a Base Template first.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const cleanedContent = e.target.result.replace(/\u0000/g, "");
        const jsonData = await csv().fromString(cleanedContent);

        const processedData = jsonData
          .map((row) => {
            const rowTrimmed = Object.fromEntries(
              Object.entries(row).map(([key, value]) => [key.trim(), value])
            );

            const email = String(
              rowTrimmed.Email || rowTrimmed.email || ""
            ).trim();
            if (!email) return null;

            return {
              name: formatName(rowTrimmed.Name || rowTrimmed.name || ""),
              email,
              cell: String(rowTrimmed.Cell || rowTrimmed.cell || "").trim(),
            };
          })
          .filter(Boolean);

        setUploadedList(processedData);
        setMessage(`Loaded ${processedData.length} recipients.`);
      } catch (err) {
        console.error(err);
        setMessage("❌ Error processing CSV.");
      }
    };

    reader.readAsText(file);
  };

  const handleSendEmails = async () => {
    if (!domain || !baseEmailName || !index) {
      setMessage("Pick Domain, Base Template, and Version.");
      return;
    }
    if (!uploadedList.length) {
      setMessage("Upload a CSV first.");
      return;
    }

    setSending(true);
    setMessage("");

    const list = uploadedList.map((r) => ({
      name: formatName(r.name),
      email: String(r.email || "").trim(),
      cell: String(r.cell || "").replace(/\D/g, ""), // digits only
    }));

    const payload = {
      domain, // "TAG" | "WYNN" | "AMITY" | "TGC"
      baseEmailName, // e.g. "TaxOrganizer2026"
      index, // 1..5
      list,
      includeAttachment,
    };

    try {
      await sendEmails(payload);
      setMessage(`✅ Sent to ${list.length} recipients.`);
    } catch (err) {
      console.error(err);
      setMessage("❌ Error sending emails.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card email-sender-container">
      <h3 className="title">📩 Manual Email Sender</h3>

      {/* Domain */}
      <div className="form-group">
        <label>🌐 Domain</label>
        <select
          className="input-field"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        >
          {DOMAIN_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {/* Base template */}
      <div className="form-group">
        <label>📦 Base Template</label>
        <select
          className="input-field"
          value={baseEmailName}
          onChange={(e) => {
            setBaseEmailName(e.target.value);
            setIndex(1);
            setUploadedList([]);
            setMessage("");
          }}
        >
          <option value="">Select…</option>
          {Object.entries(TEMPLATE_SERIES).map(([key, cfg]) => (
            <option key={key} value={key}>
              {cfg.label}
            </option>
          ))}
        </select>
      </div>

      {/* Version */}
      {series && (
        <div className="form-group">
          <label>🔢 Version</label>
          <select
            className="input-field"
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
          >
            {Object.keys(series.versions).map((k) => (
              <option key={k} value={k}>
                {k} — {series.versions[k].name}
              </option>
            ))}
          </select>

          {versionMeta && (
            <p style={{ marginTop: 8, marginBottom: 0, opacity: 0.85 }}>
              <strong>
                {baseEmailName}
                {index}
              </strong>
              : {versionMeta.intent}
            </p>
          )}
        </div>
      )}

      {/* Upload */}
      {series && (
        <div className="form-group">
          <label>📎 Upload CSV</label>
          <input type="file" accept=".csv" onChange={handleFileUpload} />
          {uploadedList.length > 0 && (
            <p style={{ marginTop: 8, marginBottom: 0 }}>
              Loaded: <strong>{uploadedList.length}</strong> recipients
            </p>
          )}
        </div>
      )}
      <div className="form-group checkbox-row">
        <label>
          <input
            type="checkbox"
            checked={includeAttachment}
            onChange={(e) => setIncludeAttachment(e.target.checked)}
          />
          Include PDF attachment
        </label>
      </div>
      {/* Send */}
      <div className="form-group">
        <button
          onClick={handleSendEmails}
          disabled={sending || !uploadedList.length || !baseEmailName}
        >
          {sending ? "🚀 Sending…" : "📨 Send Emails"}
        </button>
      </div>

      {message && <p className="message">{message}</p>}
    </div>
  );
}
