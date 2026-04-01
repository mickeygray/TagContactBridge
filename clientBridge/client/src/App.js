// client/src/App.js
// ─────────────────────────────────────────────────────────────
// Auth: email + pin code via React Login component.
// Session cookie shared across all three bridges (4000/5000/6000).
//
// Routing:
//   /login        → email picker + pin code entry
//   /dashboard    → main app (auth-gated)
//   /ringbridge   → RingBridge agent status (auth-gated)
//   /metrics      → Metrics dashboard (auth-gated)
//   /deploy       → deploy panel (auth-gated)
//   /             → redirects to /dashboard
// ─────────────────────────────────────────────────────────────

import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider } from "./hooks/useAuth";
import Navbar from "./components/layout/Navbar";
import ToastContainer from "./components/layout/ToastContainer";
import Login from "./components/auth/Login";
import PrivateRoute from "./utils/PrivateRoute";
import AgentDashboard from "./components/interface/AgentDashboard";
import RingBridgeDashboard from "./components/tools/ringcentral/RingBridgeDashboard";
import DeployPanel from "./components/tools/deploypanel/DeployPanel";
import MetricsDashboard from "./components/clientBridge/metrics/MetricsDashboard";

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Navbar />
        <ToastContainer />

        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <AgentDashboard />
              </PrivateRoute>
            }
          />

          <Route
            path="/ringbridge"
            element={
              <PrivateRoute>
                <RingBridgeDashboard />
              </PrivateRoute>
            }
          />

          <Route
            path="/metrics"
            element={
              <PrivateRoute>
                <MetricsDashboard />
              </PrivateRoute>
            }
          />

          <Route
            path="/deploy"
            element={
              <PrivateRoute>
                <DeployPanel />
              </PrivateRoute>
            }
          />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
