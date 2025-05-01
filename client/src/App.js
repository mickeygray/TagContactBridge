import React, { useContext } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import MessageState from "./context/message/MessageState";
import MessageContext from "./context/message/messageContext";
import AuthState from "./context/auth/AuthState";
import AdminState from "./context/admin/AdminState";
import ListState from "./context/list/ListState";
import ClientState from "./context/client/ClientState";
import ScheduleState from "./context/schedule/ScheduleState";
import TextState from "./context/text/TextState";
import EmailState from "./context/email/EmailState";

import Navbar from "./components/layout/Navbar";
import Login from "./components/auth/Login";
import Register from "./components/auth/Register";
import PrivateRoute from "./utils/PrivateRoute";
import AdminPanel from "./components/interface/AdminPanel";
import ManagementDashboard from "./components/interface/ManagementDashboard";
import AgentDashboard from "./components/interface/AgentDashboard";
import Toast from "./components/layout/Toast";
// AppContent is rendered within all providers so it can use MessageContext
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
        <Route path="/login" element={<Login />} />
        <Route path="/invite/:token" element={<Register />} />

        <Route
          path="/admin"
          element={
            <PrivateRoute requiredRole="admin">
              <AdminPanel />
            </PrivateRoute>
          }
        />
        <Route
          path="/management"
          element={
            <PrivateRoute requiredRole="admin">
              <ManagementDashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/unauthorized"
          element={<div>You are not authorized to view this page.</div>}
        />
        <Route
          path="/agent"
          element={
            <PrivateRoute>
              <AgentDashboard />
            </PrivateRoute>
          }
        />
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
                    <AppContent />
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
