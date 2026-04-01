// utils/api.js — singleton Axios instance, not a hook
import axios from "axios";

export const api = axios.create({ baseURL: "", withCredentials: true });

// Global interceptors (set once)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);
