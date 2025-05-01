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

  // Load current user
  const loadUser = async () => {
    try {
      const res = await api.get("/api/auth/me");
      dispatch({ type: "LOGIN_SUCCESS", payload: res.data });
    } catch {
      dispatch({ type: "LOGOUT" });
    }
  };

  // On mount and every 5 minutes, refresh user session
  useEffect(() => {
    loadUser();
    const interval = setInterval(loadUser, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-logout if server marks user offline
  useEffect(() => {
    if (state.user?.isOnline === false) {
      logout();
    }
  }, [state.user]);

  // Login action
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

  // Invite validation and completion
  const validateInvite = async (token) => {
    const res = await api.get(`/api/invite/${token}`);
    return res.data;
  };

  const completeInvite = async (token, password) => {
    await api.post(`/api/invite/${token}`, { password });
  };

  return (
    <AuthContext.Provider
      value={{
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        loading: state.loading,
        login,
        validateInvite,
        completeInvite,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthState;
