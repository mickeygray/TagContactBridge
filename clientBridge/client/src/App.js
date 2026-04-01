// client/src/App.js
// ─────────────────────────────────────────────────────────────
// v2 — AuthProvider is the only truly new Context.
// Legacy context providers are kept for existing tool components
// (SmsInbox, ManualEmailSender, etc.) that haven't been migrated
// to custom hooks yet. They wrap only the dashboard route, not
// the entire app. New components should use hooks from hooks/.
//
// Migration path: as each tool component is rewritten to use
// hooks, remove its corresponding legacy provider from here.
// ─────────────────────────────────────────────────────────────

import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider } from "./hooks/useAuth";

// Legacy context providers — kept for existing tool components
import MessageState from "./context/message/MessageState";
import AdminState from "./context/admin/AdminState";
import ListState from "./context/list/ListState";
import ClientState from "./context/client/ClientState";
import ScheduleState from "./context/schedule/ScheduleState";
import TextState from "./context/text/TextState";
import EmailState from "./context/email/EmailState";
import SmsState from "./context/sms/SmsState";

import Navbar from "./components/layout/Navbar";
import ToastContainer from "./components/layout/ToastContainer";
import Login from "./components/auth/Login";
import PrivateRoute from "./utils/PrivateRoute";
import AgentDashboard from "./components/interface/AgentDashboard";
import RingBridgeDashboard from "./components/tools/ringcentral/RingBridgeDashboard";
import DeployPanel from "./components/tools/deploypanel/DeployPanel";
import MetricsDashboard from "./components/clientBridge/metrics/MetricsDashboard";

// Wraps dashboard tools that still use legacy context providers.
// Remove providers as components migrate to hooks.
function LegacyProviders({ children }) {
  return (
    <MessageState>
      <AdminState>
        <ListState>
          <ClientState>
            <ScheduleState>
              <TextState>
                <EmailState>
                  <SmsState>
                    {children}
                  </SmsState>
                </EmailState>
              </TextState>
            </ScheduleState>
          </ClientState>
        </ListState>
      </AdminState>
    </MessageState>
  );
}

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
                <LegacyProviders>
                  <AgentDashboard />
                </LegacyProviders>
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
