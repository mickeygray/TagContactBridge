// hooks/useAuth.js
// ─────────────────────────────────────────────────────────────
// Auth is email + pin code, managed by clientBridge's auth routes.
//
// Flow:
//   1. React Login component calls POST /api/auth/send-code
//   2. User gets 6-digit pin via SendGrid email
//   3. Login component calls POST /api/auth/verify → server sets session cookie
//   4. Hard redirect to /dashboard → useAuth calls GET /api/auth/me → authenticated
//
// Session cookie (deploy_session) is shared across all three bridges
// via the same domain. nginx auth_request validates at /auth-check.
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

  // Check session on mount
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

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } catch { /* ignore */ }
    dispatch({ type: "NOT_AUTHENTICATED" });
    window.location.href = "/login";
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
