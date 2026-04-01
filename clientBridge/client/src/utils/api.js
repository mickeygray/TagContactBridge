// utils/api.js — singleton Axios instance
// New code should import { api } directly.
// Legacy context providers use useApi() which returns the same instance.
import axios from "axios";

export const api = axios.create({ baseURL: "", withCredentials: true });

// Global interceptors (set once)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Avoid redirect loop if already on login
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

// Legacy compat: useApi() hook returns the singleton.
// Existing context providers (EmailState, SmsState, etc.) call useApi().
// The old version rebuilt the instance every render and wired loading/error
// through MessageContext. This version just returns the singleton — the
// loading overlay and toast behavior now come from the new hooks + toast.js.
export function useApi() {
  return api;
}
