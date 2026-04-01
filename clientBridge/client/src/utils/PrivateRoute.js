import React from "react";
import { useAuth } from "../hooks/useAuth";

export default function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-overlay">
        <div className="spinner" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to loginPanel's server-rendered login page (not a React route)
    window.location.href = "/login";
    return null;
  }

  return children;
}
