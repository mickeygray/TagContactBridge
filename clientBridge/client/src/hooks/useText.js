// hooks/useText.js — replaces TextState + TextContext
import { useReducer, useCallback } from "react";
import { api } from "../utils/api";
import { toast } from "../utils/toast";

const initialState = { sending: false, error: null };

function textReducer(state, action) {
  switch (action.type) {
    case "SENDING":
      return { ...state, sending: true, error: null };
    case "SENT":
      return { ...state, sending: false };
    case "ERROR":
      return { ...state, sending: false, error: action.payload };
    default:
      return state;
  }
}

export function useText() {
  const [state, dispatch] = useReducer(textReducer, initialState);

  const sendTextMessage = useCallback(async (payload) => {
    dispatch({ type: "SENDING" });
    try {
      const res = await api.post("/api/texts/send", payload);
      dispatch({ type: "SENT" });
      toast.success("Texts Sent", `${res.data.sent || 0} texts sent`);
      return res.data;
    } catch (err) {
      dispatch({ type: "ERROR", payload: err.message });
      toast.error("Text Error", err.response?.data?.error || err.message);
      throw err;
    }
  }, []);

  const sendTextBatch = useCallback(async (payload) => {
    dispatch({ type: "SENDING" });
    try {
      const res = await api.post("/api/texts/daily", payload);
      dispatch({ type: "SENT" });
      toast.success("Batch Sent", `${res.data.sent || 0} texts sent`);
      return res.data;
    } catch (err) {
      dispatch({ type: "ERROR", payload: err.message });
      toast.error("Batch Error", err.response?.data?.error || err.message);
      throw err;
    }
  }, []);

  return { ...state, sendTextMessage, sendTextBatch };
}
