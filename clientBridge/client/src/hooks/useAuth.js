// hooks/useAuth.js
// ─────────────────────────────────────────────────────────────
// Auth is handled by loginPanel (leadBridge) — email + pin code.
// loginPanel sets a deploy_session cookie, nginx validates it via
// auth_request to /auth-check, then sets X-Auth-Validated header.
//
// This hook just checks if the session is valid by calling
// GET /api/auth/me (which passes through authMiddleware).
// If the deploy_session cookie is valid → returns ADMIN_USER.
// If not → user needs to go through /login (loginPanel HTML).
//
// There is no React-side login form — the loginPanel serves
// its own HTML at /login with the email picker + code entry.
// ─────────────────────────────────────────────────────────────

import { useReducer, useCallback, useEffect, createContext, useContext } from "react";
import { api } from "../utils/api";

const AuthContext = createContext(null);

const initialState = { user: null, isAuthenticated: false, loading: true };

function authReducer(state, action) {
  switch (action.type) {
    case "AUTHENTICATED":
      return { user: action.payload, isAuthenticated: true, loading: false };
    case "NOT_AUTHENTICATED":
      return { user: null, isAuthenticated: false, loading: false };
    default:
      return state;
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // On mount, check if the deploy_session cookie is valid
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/api/auth/me");
        if (!cancelled) dispatch({ type: "AUTHENTICATED", payload: res.data });
      } catch {
        if (!cancelled) dispatch({ type: "NOT_AUTHENTICATED" });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const logout = useCallback(() => {
    // loginPanel handles logout at /logout (clears deploy_session cookie)
    window.location.href = "/logout";
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
