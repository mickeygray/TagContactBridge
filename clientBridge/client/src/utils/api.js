// utils/api.js — singleton Axios instance
import axios from "axios";

export const api = axios.create({ baseURL: "", withCredentials: true });

// Read CSRF token from cookie and attach to every mutating request
function getCsrfToken() {
  const match = document.cookie.match(/(?:^|; )tcb_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

api.interceptors.request.use((config) => {
  // Attach CSRF token to all non-GET requests
  if (config.method !== "get") {
    config.headers["X-CSRF-Token"] = getCsrfToken();
  }
  return config;
});

// 401 on any non-auth API call means session expired → re-login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (
      err.response?.status === 401 &&
      !err.config?.url?.includes("/api/auth/")
    ) {
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// Legacy compat for ListScrubber and other components using useApi()
export function useApi() {
  return api;
}
