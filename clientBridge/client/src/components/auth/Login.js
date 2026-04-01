// components/auth/Login.js — dark terminal login
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAuthenticated) navigate("/dashboard");
  }, [isAuthenticated, navigate]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
    } catch {
      setError("Invalid credentials");
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
      <div className="card" style={{ width: 360 }}>
        <div className="card-header">
          <span className="card-title">Login</span>
        </div>
        {error && (
          <div style={{ color: "var(--accent-red)", fontSize: "var(--text-sm)", marginBottom: 12 }}>
            {error}
          </div>
        )}
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ width: "100%", marginTop: 4 }}
            />
          </div>
          <div>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: "100%", marginTop: 4 }}
            />
          </div>
          <button className="btn btn-solid" type="submit" style={{ width: "100%" }}>
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
