import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../utils/api";

const Register = () => {
  const { token } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: "",
    name: "",
    password: "",
    confirmPassword: "",
  });
  const [passwordError, setPasswordError] = useState("");
  const [matchError, setMatchError] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [inviteValid, setInviteValid] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/api/invite/validate/${token}`);
        setFormData((prev) => ({ ...prev, email: res.data.email, name: res.data.name }));
        setInviteValid(true);
      } catch {
        setError("Invalid or expired invite link.");
      }
    })();
  }, [token]);

  const validatePassword = (pw) =>
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/.test(pw);

  const onChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });

    if (name === "password") {
      setPasswordError(
        validatePassword(value) ? "" : "Must include uppercase, lowercase, number, symbol, 8+ characters"
      );
    }
    if (name === "confirmPassword" || name === "password") {
      const pw = name === "password" ? value : formData.password;
      const confirm = name === "confirmPassword" ? value : formData.confirmPassword;
      setMatchError(confirm && pw !== confirm ? "Passwords do not match" : "");
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const { password, confirmPassword } = formData;
    if (password !== confirmPassword) return setError("Passwords do not match.");
    if (!validatePassword(password))
      return setError("Password must be 8+ characters with uppercase, lowercase, number, and symbol.");

    try {
      await api.post(`/api/invite/complete/${token}`, { password });
      setMessage("Account created! You can now log in.");
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError(err.response?.data?.message || "Error registering.");
    }
  };

  if (!inviteValid && !error) return <div className="loading-overlay"><div className="spinner" /></div>;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
      <div className="card" style={{ width: 400 }}>
        <div className="card-header"><span className="card-title">Complete Registration</span></div>
        {message && <div style={{ color: "var(--accent-green)", marginBottom: 12 }}>{message}</div>}
        {error && <div style={{ color: "var(--accent-red)", marginBottom: 12 }}>{error}</div>}
        {inviteValid && (
          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="text-sm text-secondary">Registering as: <strong>{formData.email}</strong></div>
            <div><label>Password</label><input type="password" name="password" value={formData.password} onChange={onChange} required style={{ width: "100%", marginTop: 4 }} /></div>
            {passwordError && <div style={{ color: "var(--accent-red)", fontSize: "var(--text-xs)" }}>{passwordError}</div>}
            <div><label>Confirm Password</label><input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={onChange} required style={{ width: "100%", marginTop: 4 }} /></div>
            {matchError && <div style={{ color: "var(--accent-red)", fontSize: "var(--text-xs)" }}>{matchError}</div>}
            <button type="submit" className="btn btn-solid" style={{ width: "100%" }}>Create Account</button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Register;
