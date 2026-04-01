// hooks/useEmail.js — replaces EmailState + EmailContext
import { useReducer, useCallback } from "react";
import { api } from "../utils/api";
import { toast } from "../utils/toast";

const initialState = { sending: false, error: null, stats: null };

function emailReducer(state, action) {
  switch (action.type) {
    case "SENDING":
      return { ...state, sending: true, error: null };
    case "SENT":
      return { ...state, sending: false };
    case "ERROR":
      return { ...state, sending: false, error: action.payload };
    case "SET_STATS":
      return { ...state, stats: action.payload };
    default:
      return state;
  }
}

export function useEmail() {
  const [state, dispatch] = useReducer(emailReducer, initialState);

  const sendEmails = useCallback(async (payload) => {
    dispatch({ type: "SENDING" });
    try {
      const res = await api.post("/api/emails/send", payload);
      dispatch({ type: "SENT" });
      toast.success("Emails Sent", `${res.data.sent || 0} emails sent successfully`);
      return res.data;
    } catch (err) {
      dispatch({ type: "ERROR", payload: err.message });
      toast.error("Email Error", err.response?.data?.error || err.message);
      throw err;
    }
  }, []);

  const sendEmailBatch = useCallback(async (payload) => {
    dispatch({ type: "SENDING" });
    try {
      const res = await api.post("/api/emails/daily", payload);
      dispatch({ type: "SENT" });
      toast.success("Batch Sent", `${res.data.sent || 0} emails sent`);
      return res.data;
    } catch (err) {
      dispatch({ type: "ERROR", payload: err.message });
      toast.error("Batch Error", err.response?.data?.error || err.message);
      throw err;
    }
  }, []);

  const fetchEmailStats = useCallback(async () => {
    try {
      const res = await api.get("/api/emails/stats");
      dispatch({ type: "SET_STATS", payload: res.data });
      return res.data;
    } catch (err) {
      toast.error("Stats Error", err.message);
    }
  }, []);

  return { ...state, sendEmails, sendEmailBatch, fetchEmailStats };
}
