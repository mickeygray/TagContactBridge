// components/auth/Login.js — email + pin code login
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../utils/api";
import { useAuth } from "../../hooks/useAuth";

export default function Login() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState("email");     // "email" | "code"
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // If already authenticated, go to dashboard
  useEffect(() => {
    if (isAuthenticated) navigate("/dashboard", { replace: true });
  }, [isAuthenticated, navigate]);

  // Fetch allowed emails on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/api/auth/allowed-emails");
        setEmails(res.data.emails || []);
        if (res.data.emails?.length > 0) setSelectedEmail(res.data.emails[0]);
      } catch {
        setError("Failed to load. Refresh the page.");
      }
    })();
  }, []);

  const handleSendCode = async () => {
    if (!selectedEmail) return;
    setSending(true);
    setError("");
    try {
      await api.post("/api/auth/send-code", { email: selectedEmail });
      setStep("code");
    } catch (err) {
      setError(err.response?.data?.error || "Failed to send code");
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setSending(true);
    setError("");
    try {
      await api.post("/api/auth/verify", { email: selectedEmail, code });
      // Cookie is set by the server — reload to pick it up
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err.response?.data?.error || "Invalid code");
      setCode("");
      setSending(false);
    }
  };

  const handleCodeInput = (e) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
    setCode(val);
    if (val.length === 6) {
      // Auto-verify when 6 digits entered
      setTimeout(() => {
        setSending(true);
        setError("");
        api.post("/api/auth/verify", { email: selectedEmail, code: val })
          .then(() => { window.location.href = "/dashboard"; })
          .catch((err) => {
            setError(err.response?.data?.error || "Invalid code");
            setCode("");
            setSending(false);
          });
      }, 100);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "var(--bg-base)" }}>
      <div style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-default)",
        borderRadius: 12,
        padding: 40,
        width: 340,
        textAlign: "center",
      }}>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 18,
          fontWeight: 700,
          color: "var(--accent-terminal)",
          letterSpacing: 2,
          marginBottom: 8,
        }}>
          TCB
        </div>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginBottom: 24 }}>
          Email verification required
        </div>

        {step === "email" && (
          <div>
            <select
              value={selectedEmail}
              onChange={(e) => setSelectedEmail(e.target.value)}
              style={{
                width: "100%",
                padding: 10,
                marginBottom: 12,
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-sm)",
                background: "var(--bg-base)",
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
            >
              {emails.map((e) => (
                <option key={e} value={e}>{e.split("@")[0]}@</option>
              ))}
            </select>
            <button
              onClick={handleSendCode}
              disabled={sending || !selectedEmail}
              style={{
                width: "100%",
                padding: 12,
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: sending ? "not-allowed" : "pointer",
                background: sending ? "var(--border-default)" : "var(--accent-terminal)",
                color: sending ? "var(--text-muted)" : "var(--bg-base)",
                transition: "all 0.2s",
              }}
            >
              {sending ? "Sending..." : "Send Code to Email"}
            </button>
          </div>
        )}

        {step === "code" && (
          <div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={handleCodeInput}
              placeholder="000000"
              autoFocus
              style={{
                width: "100%",
                padding: 14,
                fontFamily: "var(--font-mono)",
                fontSize: 24,
                textAlign: "center",
                letterSpacing: 12,
                background: "var(--bg-base)",
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                color: "#fff",
                marginBottom: 16,
                outline: "none",
              }}
            />
            <button
              onClick={handleVerify}
              disabled={sending || code.length !== 6}
              style={{
                width: "100%",
                padding: 12,
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                background: "#fff",
                color: "var(--bg-base)",
              }}
            >
              {sending ? "Verifying..." : "Verify"}
            </button>
            <button
              onClick={() => { setStep("email"); setCode(""); setError(""); }}
              style={{
                marginTop: 12,
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                fontSize: "var(--text-sm)",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
              }}
            >
              Back
            </button>
          </div>
        )}

        {error && (
          <div style={{ color: "var(--accent-red)", fontSize: "var(--text-sm)", marginTop: 12 }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
