import React, { useReducer, useContext, useRef, useCallback } from "react";
import SmsContext from "./smsContext";
import smsReducer from "./smsReducer";
import { useApi } from "../../utils/api";
import MessageContext from "../message/messageContext";

const SmsState = (props) => {
  const initialState = {
    conversations: [],
    totalConversations: 0,
    currentPage: 1,
    totalPages: 1,
    activeConversation: null,
    stats: null,
    settings: null,
    filters: {
      status: "all",
      company: "all",
      contactType: "all",
      search: "",
    },
    loading: false,
    error: null,
  };

  const [state, dispatch] = useReducer(smsReducer, initialState);
  const { showMessage, showError } = useContext(MessageContext);
  const api = useApi();
  api.defaults.withCredentials = true;

  // Poll timer ref
  const pollRef = useRef(null);

  // ── Fetch conversations with filters ─────────────────────────

  const fetchConversations = useCallback(
    async (page = 1) => {
      try {
        const params = new URLSearchParams();
        if (state.filters.status !== "all")
          params.set("status", state.filters.status);
        if (state.filters.company !== "all")
          params.set("company", state.filters.company);
        if (state.filters.contactType !== "all")
          params.set("contactType", state.filters.contactType);
        if (state.filters.search) params.set("search", state.filters.search);
        params.set("page", page);
        params.set("limit", 20);

        const res = await api.get(`/api/sms/conversations?${params}`);
        dispatch({ type: "SET_CONVERSATIONS", payload: res.data });
      } catch (err) {
        dispatch({ type: "SMS_ERROR", payload: err.message });
      }
    },
    [state.filters, api],
  );

  // ── Fetch single conversation (full thread) ──────────────────

  const fetchConversation = async (id) => {
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      const res = await api.get(`/api/sms/conversations/${id}`);
      dispatch({
        type: "SET_ACTIVE_CONVERSATION",
        payload: res.data.conversation,
      });
    } catch (err) {
      dispatch({ type: "SMS_ERROR", payload: err.message });
    }
  };

  const clearActiveConversation = () => {
    dispatch({ type: "CLEAR_ACTIVE_CONVERSATION" });
  };

  // ── Stats ────────────────────────────────────────────────────

  const fetchStats = async () => {
    try {
      const res = await api.get("/api/sms/stats");
      dispatch({ type: "SET_STATS", payload: res.data });
    } catch (err) {
      console.error("Stats fetch failed:", err.message);
    }
  };

  // ── Settings ─────────────────────────────────────────────────

  const fetchSettings = async () => {
    try {
      const res = await api.get("/api/sms/settings");
      dispatch({ type: "SET_SETTINGS", payload: res.data });
    } catch (err) {
      console.error("Settings fetch failed:", err.message);
    }
  };

  const updateSettings = async (newSettings) => {
    try {
      const res = await api.put("/api/sms/settings", newSettings);
      dispatch({ type: "SET_SETTINGS", payload: res.data });
      showMessage("SMS Settings", "Settings updated");
    } catch (err) {
      showError("SMS Settings", `Failed: ${err.message}`);
    }
  };

  // ── Actions ──────────────────────────────────────────────────

  const approveResponse = async (id) => {
    try {
      const res = await api.post(`/api/sms/conversations/${id}/approve`);
      if (res.data.ok) {
        showMessage("SMS", "Response sent");
        fetchConversations(state.currentPage);
        fetchStats();
      } else {
        showError("SMS", res.data.error || "Approve failed");
      }
    } catch (err) {
      showError("SMS", `Approve failed: ${err.message}`);
    }
  };

  const cancelResponse = async (id) => {
    try {
      const res = await api.post(`/api/sms/conversations/${id}/cancel`);
      if (res.data.ok) {
        dispatch({ type: "REMOVE_PENDING", payload: id });
        showMessage("SMS", "Response cancelled");
        fetchStats();
      }
    } catch (err) {
      showError("SMS", `Cancel failed: ${err.message}`);
    }
  };

  const editAndSend = async (id, content) => {
    try {
      const res = await api.post(`/api/sms/conversations/${id}/edit`, {
        content,
      });
      if (res.data.ok) {
        showMessage("SMS", "Edited response sent");
        fetchConversations(state.currentPage);
        fetchStats();
      } else {
        showError("SMS", res.data.error || "Edit failed");
      }
    } catch (err) {
      showError("SMS", `Edit failed: ${err.message}`);
    }
  };

  const manualSend = async (id, content) => {
    try {
      const res = await api.post(`/api/sms/conversations/${id}/send`, {
        content,
      });
      if (res.data.ok) {
        showMessage("SMS", "Message sent");
        if (state.activeConversation?._id === id) {
          fetchConversation(id);
        }
        fetchConversations(state.currentPage);
        fetchStats();
      }
    } catch (err) {
      showError("SMS", `Send failed: ${err.message}`);
    }
  };

  const regenerateResponse = async (id) => {
    try {
      const res = await api.post(`/api/sms/conversations/${id}/regenerate`);
      if (res.data.ok) {
        showMessage("SMS", "New response generated");
        if (state.activeConversation?._id === id) {
          fetchConversation(id);
        }
        fetchConversations(state.currentPage);
      } else {
        showError("SMS", res.data.error || "Regenerate failed");
      }
    } catch (err) {
      showError("SMS", `Regenerate failed: ${err.message}`);
    }
  };

  const sleepBot = async (id) => {
    try {
      await api.post(`/api/sms/conversations/${id}/sleep`);
      showMessage("SMS", "Bot paused — manual takeover");
      fetchConversations(state.currentPage);
    } catch (err) {
      showError("SMS", `Sleep failed: ${err.message}`);
    }
  };

  const wakeBot = async (id) => {
    try {
      await api.post(`/api/sms/conversations/${id}/wake`);
      showMessage("SMS", "Bot reactivated");
      fetchConversations(state.currentPage);
    } catch (err) {
      showError("SMS", `Wake failed: ${err.message}`);
    }
  };

  // ── Filters ──────────────────────────────────────────────────

  const setFilter = (filterUpdate) => {
    dispatch({ type: "SET_FILTER", payload: filterUpdate });
  };

  // ── Polling (refresh conversations every 30s) ────────────────

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(() => {
      fetchConversations(state.currentPage);
      fetchStats();
    }, 30000);
  }, [fetchConversations, state.currentPage]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  return (
    <SmsContext.Provider
      value={{
        // State
        conversations: state.conversations,
        totalConversations: state.totalConversations,
        currentPage: state.currentPage,
        totalPages: state.totalPages,
        activeConversation: state.activeConversation,
        stats: state.stats,
        settings: state.settings,
        filters: state.filters,
        loading: state.loading,
        error: state.error,
        // Fetchers
        fetchConversations,
        fetchConversation,
        clearActiveConversation,
        fetchStats,
        fetchSettings,
        // Actions
        approveResponse,
        cancelResponse,
        editAndSend,
        manualSend,
        regenerateResponse,
        sleepBot,
        wakeBot,
        // Settings
        updateSettings,
        // Filters
        setFilter,
        // Polling
        startPolling,
        stopPolling,
      }}
    >
      {props.children}
    </SmsContext.Provider>
  );
};

export default SmsState;
