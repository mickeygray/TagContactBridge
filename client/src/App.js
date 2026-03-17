// client/src/App.js
// ─────────────────────────────────────────────────────────────
// Simplified routing:
//   /dashboard  → main app (auth-gated)
//   /deploy     → deploy tracker (auth-gated)
//   /login      → fallback for JWT agents (nginx gate handles primary auth)
//   /           → redirects to /dashboard
// ─────────────────────────────────────────────────────────────

import React, { useContext } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import MessageState from "./context/message/MessageState";
import MessageContext from "./context/message/messageContext";
import AuthState from "./context/auth/AuthState";
import AdminState from "./context/admin/AdminState";
import ListState from "./context/list/ListState";
import ClientState from "./context/client/ClientState";
import ScheduleState from "./context/schedule/ScheduleState";
import TextState from "./context/text/TextState";
import EmailState from "./context/email/EmailState";
import SmsState from "./context/sms/SmsState";

import Navbar from "./components/layout/Navbar";
import Login from "./components/auth/Login";
import PrivateRoute from "./utils/PrivateRoute";
import AgentDashboard from "./components/interface/AgentDashboard";
import Toast from "./components/layout/Toast";
import DeployTracker from "./components/tools/deploymentguide/DeploymentGuide";

function AppContent() {
  const { loading, message, error, clearMessage } = useContext(MessageContext);

  return (
    <Router>
      <Navbar />

      {message && (
        <Toast
          title={message.title}
          message={message.text}
          error={error}
          onClose={clearMessage}
        />
      )}

      {loading && (
        <div className="loading-overlay">
          <div className="spinner" />
        </div>
      )}

      <Routes>
        {/* Login — fallback for JWT agents, nginx gate handles primary auth */}
        <Route path="/login" element={<Login />} />

        {/* Main dashboard */}
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <AgentDashboard />
            </PrivateRoute>
          }
        />

        {/* Catch-all → dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}

export default function App() {
  return (
    <MessageState>
      <AuthState>
        <AdminState>
          <ListState>
            <ClientState>
              <ScheduleState>
                <TextState>
                  <EmailState>
                    <SmsState>
                      <AppContent />
                    </SmsState>
                  </EmailState>
                </TextState>
              </ScheduleState>
            </ClientState>
          </ListState>
        </AdminState>
      </AuthState>
    </MessageState>
  );
}
