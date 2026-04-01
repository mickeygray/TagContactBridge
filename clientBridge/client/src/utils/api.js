// utils/api.js — singleton Axios instance
import axios from "axios";

export const api = axios.create({ baseURL: "", withCredentials: true });

// 401 interceptor: let useAuth handle the initial /me check,
// but for all other API calls a 401 means session expired.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (
      err.response?.status === 401 &&
      !err.config?.url?.includes("/api/auth/")
    ) {
      // Session expired mid-use — force re-login
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
