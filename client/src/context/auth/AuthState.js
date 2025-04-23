import React, { useReducer, useEffect } from "react";
import axios from "axios";
import AuthContext from "./authContext";
import AuthReducer from "./authReducer";

const AuthState = ({ children }) => {
  const initialState = {
    user: null,
    isAuthenticated: false,
    loading: true,
  };

  const [state, dispatch] = useReducer(AuthReducer, initialState);

  const loadUser = async () => {
    try {
      const res = await axios.get("/api/auth/me", { withCredentials: true });
      dispatch({ type: "LOGIN_SUCCESS", payload: res.data });
    } catch {
      dispatch({ type: "LOGOUT" });
    }
  };

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      loadUser();
    }, 60000); // every 5 minutes

    return () => clearInterval(interval); // cleanup
  }, []);
  useEffect(() => {
    if (state.user && state.user.isOnline === false) {
      logout();
    }
  }, [state.user]);

  console.log(state.user);
  const login = async (email, password) => {
    await axios.post(
      "/api/auth/login",
      { email, password },
      { withCredentials: true }
    );
    loadUser();
  };

  const logout = async () => {
    await axios.post("/api/auth/logout", {}, { withCredentials: true });
    dispatch({ type: "LOGOUT" });
  };
  const validateInvite = async (token) => {
    const res = await axios.get(`/api/invite/${token}`);
    return res.data; // should include email and role info
  };

  const completeInvite = async (token, password) => {
    await axios.post(`/api/invite/${token}`, { password });
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
