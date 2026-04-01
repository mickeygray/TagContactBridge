// client/src/App.js
// ─────────────────────────────────────────────────────────────
// Routing:
//   /login        → email + pin code
//   /dashboard    → main tools (auth-gated)
//   /ringbridge   → agent phone monitoring (auth-gated)
//   /metrics      → ops dashboard (auth-gated)
//   /debug        → system log viewer (auth-gated)
//   /deploy       → build & deploy panel (auth-gated)
//   /agent        → agent CX widget (auth-gated, no navbar)
//   /             → redirects to /dashboard
// ─────────────────────────────────────────────────────────────

import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";

import { AuthProvider } from "./hooks/useAuth";
import Navbar from "./components/layout/Navbar";
import ToastContainer from "./components/layout/ToastContainer";
import Login from "./components/auth/Login";
import PrivateRoute from "./utils/PrivateRoute";
import AgentDashboard from "./components/interface/AgentDashboard";
import RingBridgeDashboard from "./components/tools/ringcentral/RingBridgeDashboard";
import DeployPanel from "./components/tools/deploypanel/DeployPanel";
import MetricsDashboard from "./components/clientBridge/metrics/MetricsDashboard";
import SystemDebugPanel from "./components/clientBridge/debug/SystemDebugPanel";
import AgentWidget from "./components/ringBridge/cx/AgentWidget";

// Navbar hidden on /login and /agent (those have their own chrome)
function ConditionalNavbar() {
  const { pathname } = useLocation();
  if (pathname === "/login" || pathname.startsWith("/agent")) return null;
  return <Navbar />;
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <ConditionalNavbar />
        <ToastContainer />

        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Agent widget — standalone, no navbar */}
          <Route
            path="/agent"
            element={
              <PrivateRoute>
                <AgentWidget />
              </PrivateRoute>
            }
          />

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
            path="/debug"
            element={
              <PrivateRoute>
                <SystemDebugPanel />
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
