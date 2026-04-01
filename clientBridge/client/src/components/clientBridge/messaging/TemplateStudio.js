// components/clientBridge/messaging/TemplateStudio.js
// AI-powered email/SMS template creation and preview
import React, { useState } from "react";
import { api } from "../../../utils/api";
import { toast } from "../../../utils/toast";

export default function TemplateStudio() {
  const [type, setType] = useState("email");
  const [purpose, setPurpose] = useState("");
  const [brand, setBrand] = useState("TAG");
  const [tone, setTone] = useState("professional");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!purpose.trim()) return;

    setGenerating(true);
    setResult(null);
    try {
      const res = await api.post("/api/templates/generate", {
        type,
        purpose: purpose.trim(),
        brand,
        tone,
      });
      setResult(res.data);
      toast.success("Generated", "Template created by AI");
    } catch (err) {
      toast.error("Generate Error", err.response?.data?.error || err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">AI Template Generator</span>
      </div>

      <form onSubmit={handleGenerate} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <label>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: "100%", marginTop: 4 }}>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
            </select>
          </div>
          <div>
            <label>Brand</label>
            <select value={brand} onChange={(e) => setBrand(e.target.value)} style={{ width: "100%", marginTop: 4 }}>
              <option value="TAG">Tax Advocate Group</option>
              <option value="WYNN">Wynn Tax Solutions</option>
            </select>
          </div>
          <div>
            <label>Tone</label>
            <select value={tone} onChange={(e) => setTone(e.target.value)} style={{ width: "100%", marginTop: 4 }}>
              <option value="professional">Professional</option>
              <option value="friendly">Friendly</option>
              <option value="urgent">Urgent</option>
              <option value="empathetic">Empathetic</option>
            </select>
          </div>
        </div>

        <div>
          <label>Purpose / Description</label>
          <textarea
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g., Payment reminder for clients who missed their monthly installment..."
            rows={3}
            style={{ width: "100%", marginTop: 4, resize: "vertical" }}
          />
        </div>

        <button className="btn btn-solid" type="submit" disabled={generating || !purpose.trim()}>
          {generating ? "Generating..." : "Generate Template"}
        </button>
      </form>

      {result && (
        <div style={{ marginTop: 20 }}>
          <div className="card" style={{ background: "var(--bg-inset)" }}>
            {result.subject && (
              <div style={{ marginBottom: 12 }}>
                <label>Subject</label>
                <div style={{ fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>
                  {result.subject}
                </div>
              </div>
            )}
            <div>
              <label>Body</label>
              <pre style={{
                marginTop: 4,
                padding: 12,
                background: "var(--bg-base)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-sm)",
                whiteSpace: "pre-wrap",
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-sm)",
                color: "var(--text-secondary)",
                lineHeight: 1.6,
              }}>
                {result.body}
              </pre>
            </div>
            {result.tokens && result.tokens.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <label>Merge Tokens</label>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                  {result.tokens.map((t) => (
                    <span key={t} className="badge badge-blue">{t}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
