// components/layout/Navbar.js — dark terminal navbar
import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

export default function Navbar() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) => location.pathname === path ? "navbar-link active" : "navbar-link";

  // Don't render navbar if not authenticated (loginPanel has its own UI)
  if (!isAuthenticated) return null;

  return (
    <nav className="navbar">
      <div className="navbar-brand" onClick={() => navigate("/dashboard")} style={{ cursor: "pointer" }}>
        TCB
      </div>
      <div className="navbar-links">
        <button className={isActive("/dashboard")} onClick={() => navigate("/dashboard")}>
          Dashboard
        </button>
        <button className={isActive("/ringbridge")} onClick={() => navigate("/ringbridge")}>
          RingBridge
        </button>
        <button className={isActive("/metrics")} onClick={() => navigate("/metrics")}>
          Metrics
        </button>
        <button className={isActive("/debug")} onClick={() => navigate("/debug")}>
          Debug
        </button>
        <button className={isActive("/deploy")} onClick={() => navigate("/deploy")}>
          Deploy
        </button>
        <button className="navbar-link" onClick={logout}>
          Logout
        </button>
      </div>
    </nav>
  );
}
