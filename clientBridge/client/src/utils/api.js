// utils/api.js — singleton Axios instance
import axios from "axios";

export const api = axios.create({ baseURL: "", withCredentials: true });

// 401 interceptor: redirect to loginPanel for session expiry.
// Skip redirect for /api/auth/me (useAuth handles that gracefully).
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (
      err.response?.status === 401 &&
      !err.config?.url?.includes("/api/auth/me")
    ) {
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// Legacy compat: useApi() returns the singleton for components
// that haven't been migrated yet (e.g. ListScrubber).
export function useApi() {
  return api;
}
