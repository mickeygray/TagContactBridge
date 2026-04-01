// hooks/useAuth.js — replaces AuthState + AuthContext
import { useReducer, useCallback, useEffect, createContext, useContext } from "react";
import { api } from "../utils/api";

const AuthContext = createContext(null);

const initialState = { user: null, isAuthenticated: false, loading: true };

function authReducer(state, action) {
  switch (action.type) {
    case "LOGIN_SUCCESS":
      return { user: action.payload, isAuthenticated: true, loading: false };
    case "LOGOUT":
      return { user: null, isAuthenticated: false, loading: false };
    case "AUTH_LOADED":
      return { ...state, loading: false };
    default:
      return state;
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/api/auth/me");
        dispatch({ type: "LOGIN_SUCCESS", payload: res.data });
      } catch {
        dispatch({ type: "AUTH_LOADED" });
      }
    })();
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post("/api/auth/login", { email, password });
    dispatch({ type: "LOGIN_SUCCESS", payload: res.data });
    return res.data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } catch { /* ignore */ }
    dispatch({ type: "LOGOUT" });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
