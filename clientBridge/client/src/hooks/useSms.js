// hooks/useSms.js — replaces SmsState + SmsContext
import { useReducer, useCallback, useRef, useEffect } from "react";
import { api } from "../utils/api";
import { toast } from "../utils/toast";

const initialState = {
  conversations: [],
  totalConversations: 0,
  currentPage: 1,
  totalPages: 1,
  activeConversation: null,
  stats: null,
  settings: null,
  filters: { status: "pending", company: "", contactType: "", search: "" },
  loading: false,
  error: null,
};

function smsReducer(state, action) {
  switch (action.type) {
    case "SET_CONVERSATIONS":
      return {
        ...state,
        conversations: action.payload.conversations,
        totalConversations: action.payload.total,
        currentPage: action.payload.page,
        totalPages: action.payload.totalPages,
        loading: false,
      };
    case "SET_ACTIVE":
      return { ...state, activeConversation: action.payload };
    case "CLEAR_ACTIVE":
      return { ...state, activeConversation: null };
    case "UPDATE_CONVERSATION": {
      const updated = action.payload;
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c._id === updated._id ? updated : c
        ),
        activeConversation:
          state.activeConversation?._id === updated._id
            ? updated
            : state.activeConversation,
      };
    }
    case "SET_STATS":
      return { ...state, stats: action.payload };
    case "SET_SETTINGS":
      return { ...state, settings: action.payload };
    case "SET_FILTER":
      return { ...state, filters: { ...state.filters, ...action.payload } };
    case "SET_LOADING":
      return { ...state, loading: true };
    case "SET_ERROR":
      return { ...state, error: action.payload, loading: false };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    default:
      return state;
  }
}

export function useSms() {
  const [state, dispatch] = useReducer(smsReducer, initialState);
  const pollingRef = useRef(null);

  const fetchConversations = useCallback(async (page = 1, filters = {}) => {
    dispatch({ type: "SET_LOADING" });
    try {
      const params = new URLSearchParams({ page, ...filters });
      const res = await api.get(`/api/sms/conversations?${params}`);
      dispatch({ type: "SET_CONVERSATIONS", payload: res.data });
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
    }
  }, []);

  const fetchConversation = useCallback(async (id) => {
    try {
      const res = await api.get(`/api/sms/conversations/${id}`);
      dispatch({ type: "SET_ACTIVE", payload: res.data });
    } catch (err) {
      toast.error("SMS Error", err.message);
    }
  }, []);

  const clearActiveConversation = useCallback(() => {
    dispatch({ type: "CLEAR_ACTIVE" });
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get("/api/sms/stats");
      dispatch({ type: "SET_STATS", payload: res.data });
    } catch (err) {
      toast.error("Stats Error", err.message);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await api.get("/api/sms/settings");
      dispatch({ type: "SET_SETTINGS", payload: res.data });
    } catch (err) {
      toast.error("Settings Error", err.message);
    }
  }, []);

  const updateSettings = useCallback(async (settings) => {
    try {
      const res = await api.put("/api/sms/settings", settings);
      dispatch({ type: "SET_SETTINGS", payload: res.data });
      toast.success("Settings", "Updated successfully");
    } catch (err) {
      toast.error("Settings Error", err.message);
    }
  }, []);

  const approveResponse = useCallback(async (id) => {
    try {
      const res = await api.post(`/api/sms/conversations/${id}/approve`);
      dispatch({ type: "UPDATE_CONVERSATION", payload: res.data });
      toast.success("Approved", "Response sent");
    } catch (err) {
      toast.error("Approve Error", err.message);
    }
  }, []);

  const cancelResponse = useCallback(async (id) => {
    try {
      const res = await api.post(`/api/sms/conversations/${id}/cancel`);
      dispatch({ type: "UPDATE_CONVERSATION", payload: res.data });
    } catch (err) {
      toast.error("Cancel Error", err.message);
    }
  }, []);

  const editAndSend = useCallback(async (id, text) => {
    try {
      const res = await api.post(`/api/sms/conversations/${id}/edit`, { text });
      dispatch({ type: "UPDATE_CONVERSATION", payload: res.data });
      toast.success("Sent", "Edited response sent");
    } catch (err) {
      toast.error("Send Error", err.message);
    }
  }, []);

  const manualSend = useCallback(async (id, text) => {
    try {
      const res = await api.post(`/api/sms/conversations/${id}/send`, { text });
      dispatch({ type: "UPDATE_CONVERSATION", payload: res.data });
      toast.success("Sent", "Message sent");
    } catch (err) {
      toast.error("Send Error", err.message);
    }
  }, []);

  const regenerateResponse = useCallback(async (id) => {
    try {
      const res = await api.post(`/api/sms/conversations/${id}/regenerate`);
      dispatch({ type: "UPDATE_CONVERSATION", payload: res.data });
    } catch (err) {
      toast.error("Regenerate Error", err.message);
    }
  }, []);

  const sleepBot = useCallback(async (id) => {
    try {
      const res = await api.post(`/api/sms/conversations/${id}/sleep`);
      dispatch({ type: "UPDATE_CONVERSATION", payload: res.data });
    } catch (err) {
      toast.error("Sleep Error", err.message);
    }
  }, []);

  const wakeBot = useCallback(async (id) => {
    try {
      const res = await api.post(`/api/sms/conversations/${id}/wake`);
      dispatch({ type: "UPDATE_CONVERSATION", payload: res.data });
    } catch (err) {
      toast.error("Wake Error", err.message);
    }
  }, []);

  const setFilter = useCallback((filterUpdate) => {
    dispatch({ type: "SET_FILTER", payload: filterUpdate });
  }, []);

  const startPolling = useCallback((fetchFn, interval = 10000) => {
    stopPolling();
    pollingRef.current = setInterval(fetchFn, interval);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Cleanup polling on unmount
  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);

  return {
    ...state,
    fetchConversations,
    fetchConversation,
    clearActiveConversation,
    fetchStats,
    fetchSettings,
    updateSettings,
    approveResponse,
    cancelResponse,
    editAndSend,
    manualSend,
    regenerateResponse,
    sleepBot,
    wakeBot,
    setFilter,
    startPolling,
    stopPolling,
  };
}
