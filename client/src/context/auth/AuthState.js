// client/src/context/auth/AuthState.js
// ─────────────────────────────────────────────────────────────
// Simplified auth context.
//
// On mount: calls /api/auth/me
//   - If nginx SMS gate is active → backend returns admin user → authenticated
//   - If JWT cookie exists → backend validates → authenticated
//   - If neither → not authenticated → redirect to /login (or nginx redirects to /panel)
//
// Login/logout kept for future agent support.
// ─────────────────────────────────────────────────────────────

import React, { useReducer, useEffect } from "react";
import AuthContext from "./authContext";
import AuthReducer from "./authReducer";
import { useApi } from "../../utils/api";

const AuthState = ({ children }) => {
  const initialState = {
    user: null,
    isAuthenticated: false,
    loading: true,
  };

  const [state, dispatch] = useReducer(AuthReducer, initialState);
  const api = useApi();
  api.defaults.withCredentials = true;

  // Load current user — works for both nginx gate and JWT
  const loadUser = async () => {
    try {
      const res = await api.get("/api/auth/me");
      dispatch({ type: "LOGIN_SUCCESS", payload: res.data });
    } catch {
      dispatch({ type: "LOGOUT" });
    }
  };

  // On mount, check session
  useEffect(() => {
    loadUser();
    // Refresh every 5 minutes to keep session alive
    const interval = setInterval(loadUser, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Login action (for future agents using JWT)
  const login = async (email, password) => {
    try {
      await api.post("/api/auth/login", { email, password });
      await loadUser();
    } catch (err) {
      // errors handled by interceptor
    }
  };

  // Logout action
  const logout = async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      // ignore errors
    }
    dispatch({ type: "LOGOUT" });
  };

  return (
    <AuthContext.Provider
      value={{
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        loading: state.loading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthState;
