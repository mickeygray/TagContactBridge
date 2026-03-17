// client/src/utils/PrivateRoute.js
// ─────────────────────────────────────────────────────────────
// If authenticated → render children
// If loading → show spinner
// If not authenticated → nginx would have already redirected
//   to /panel, but as a fallback redirect to /login
// ─────────────────────────────────────────────────────────────

import React, { useContext } from "react";
import { Navigate } from "react-router-dom";
import AuthContext from "../context/auth/authContext";

const PrivateRoute = ({ children, requiredRole }) => {
  const { user, isAuthenticated, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "60vh",
        }}
      >
        <div className="spinner" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" />;

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/unauthorized" />;
  }

  return children;
};

export default PrivateRoute;
