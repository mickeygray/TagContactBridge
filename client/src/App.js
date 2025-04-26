import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import AuthState from "./context/auth/AuthState";
import PrivateRoute from "./utils/PrivateRoute";
import Login from "./components/auth/Login";
import Register from "./components/auth/Register";
import AdminPanel from "./components/interface/AdminPanel";
import AgentDashboard from "./components/interface/AgentDashboard";
import Navbar from "./components/layout/Navbar";
import AdminState from "./context/admin/AdminState";
import ListState from "./context/list/ListState";
import EmailState from "./context/email/EmailState";
import ScheduleState from "./context/schedule/ScheduleState";
import TextState from "./context/text/TextState";
import ClientState from "./context/client/ClientState";
import ManagementDashboard from "./components/interface/ManagementDashboard";
function App() {
  return (
    <AuthState>
      <AdminState>
        <ListState>
          <ClientState>
            <ScheduleState>
              <TextState>
                <EmailState>
                  <Router>
                    <Navbar />
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
                        element={
                          <div>You are not authorized to view this page.</div>
                        }
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
                </EmailState>
              </TextState>
            </ScheduleState>
          </ClientState>
        </ListState>
      </AdminState>
    </AuthState>
  );
}

export default App;
