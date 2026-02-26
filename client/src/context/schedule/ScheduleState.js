// client/src/context/ScheduleState/ScheduleState.js
// ─────────────────────────────────────────────────────────────
// Repurposed for CallFire Auto-Dialer
// ─────────────────────────────────────────────────────────────

import React, { useReducer, useRef, useCallback } from "react";
import ScheduleContext from "./scheduleContext";
import scheduleReducer from "./scheduleReducer";
import { useApi } from "../../utils/api";

const ScheduleState = (props) => {
  const initialState = {
    // Dialer state
    mode: "wynn", // "wynn" | "tag"
    isRunning: false,
    isPaused: false,

    // Leads
    leads: [],
    leadsCount: 0,

    // Stats
    stats: {
      queued: 0,
      processed: 0,
      failed: 0,
      total: 0,
    },

    // TAG filters
    tagFilters: {
      startDate: "",
      endDate: "",
      sourceName: "all",
    },

    // Activity log
    logs: [],

    // UI state
    loading: false,
    error: null,
  };

  const [state, dispatch] = useReducer(scheduleReducer, initialState);
  const api = useApi();
  const pollIntervalRef = useRef(null);

  // ═══════════════════════════════════════════════════════════════════════════
  // LOGGING
  // ═══════════════════════════════════════════════════════════════════════════

  const addLog = useCallback((message, type = "info") => {
    dispatch({ type: "ADD_LOG", payload: { message, type } });
  }, []);

  const clearLogs = useCallback(() => {
    dispatch({ type: "CLEAR_LOGS" });
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // MODE SWITCHING
  // ═══════════════════════════════════════════════════════════════════════════

  const setMode = useCallback((mode) => {
    dispatch({ type: "SET_DIALER_MODE", payload: mode });
    dispatch({ type: "RESET_DIALER" });
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // WYNN DIGITAL LEADS
  // ═══════════════════════════════════════════════════════════════════════════

  const fetchWynnLeads = useCallback(async () => {
    dispatch({ type: "SET_LOADING" });
    dispatch({ type: "CLEAR_ERROR" });
    addLog("Fetching Wynn digital leads...", "info");

    try {
      const res = await api.get("/api/schedule/wynn-leads");
      dispatch({ type: "SET_LEADS", payload: { leads: res.data.leads } });
      addLog(
        `Found ${res.data.leads?.length || 0} leads ready to dial`,
        "success",
      );
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      dispatch({ type: "SET_ERROR", payload: msg });
      addLog(`Error fetching leads: ${msg}`, "error");
    }
  }, [api, addLog]);

  const startWynnDialer = useCallback(async () => {
    if (state.leads.length === 0) {
      dispatch({ type: "SET_ERROR", payload: "No leads to dial" });
      return;
    }

    addLog(`Starting Wynn dialer with ${state.leads.length} leads...`, "info");

    try {
      const res = await api.post("/api/schedule/start-wynn", {
        leads: state.leads,
      });

      dispatch({
        type: "START_DIALER",
        payload: {
          queued: res.data.queued,
          failed: res.data.failed,
          total: state.leads.length,
        },
      });

      addLog(`Dialer started! ${res.data.queued} contacts queued`, "success");
      startPolling();
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      dispatch({ type: "SET_ERROR", payload: msg });
      addLog(`Failed to start dialer: ${msg}`, "error");
    }
  }, [api, state.leads, addLog]);

  // ═══════════════════════════════════════════════════════════════════════════
  // TAG PROSPECTS
  // ═══════════════════════════════════════════════════════════════════════════

  const setTagFilters = useCallback((filters) => {
    dispatch({ type: "SET_TAG_FILTERS", payload: filters });
  }, []);

  const fetchTagLeads = useCallback(async () => {
    if (!state.tagFilters.startDate || !state.tagFilters.endDate) {
      dispatch({ type: "SET_ERROR", payload: "Please select a date range" });
      return;
    }

    dispatch({ type: "SET_LOADING" });
    dispatch({ type: "CLEAR_ERROR" });
    addLog(
      `Fetching TAG prospects (${state.tagFilters.startDate} to ${state.tagFilters.endDate})...`,
      "info",
    );

    try {
      const res = await api.get("/api/schedule/tag-leads", {
        params: state.tagFilters,
      });
      dispatch({ type: "SET_LEADS", payload: { leads: res.data.leads } });
      addLog(`Found ${res.data.leads?.length || 0} prospects`, "success");
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      dispatch({ type: "SET_ERROR", payload: msg });
      addLog(`Error fetching prospects: ${msg}`, "error");
    }
  }, [api, state.tagFilters, addLog]);

  const startTagDialer = useCallback(async () => {
    if (state.leads.length === 0) {
      dispatch({ type: "SET_ERROR", payload: "No leads to dial" });
      return;
    }

    addLog(
      `Starting TAG dialer with ${state.leads.length} prospects...`,
      "info",
    );

    try {
      const res = await api.post("/api/schedule/start-tag", {
        leads: state.leads,
        filters: state.tagFilters,
      });

      dispatch({
        type: "START_DIALER",
        payload: {
          queued: res.data.queued,
          failed: res.data.failed,
          total: state.leads.length,
        },
      });

      addLog(`Dialer started! ${res.data.queued} contacts queued`, "success");
      startPolling();
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      dispatch({ type: "SET_ERROR", payload: msg });
      addLog(`Failed to start dialer: ${msg}`, "error");
    }
  }, [api, state.leads, state.tagFilters, addLog]);

  // ═══════════════════════════════════════════════════════════════════════════
  // POLLING & CONTROLS
  // ═══════════════════════════════════════════════════════════════════════════

  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await api.get("/api/schedule/status");

        if (res.data.stats) {
          dispatch({ type: "UPDATE_STATS", payload: res.data.stats });
        }

        // Auto-stop when complete
        if (
          res.data.stats?.processed >= res.data.stats?.total &&
          res.data.stats?.total > 0
        ) {
          addLog("All calls completed!", "success");
          stopDialer();
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 5000); // Poll every 5 seconds
  }, [api, addLog]);

  const stopDialer = useCallback(async () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    try {
      await api.post("/api/schedule/stop");
      addLog("Dialer stopped", "info");
    } catch (err) {
      console.error("Stop error:", err);
    }

    dispatch({ type: "STOP_DIALER" });
  }, [api, addLog]);

  const pauseDialer = useCallback(async () => {
    try {
      await api.post("/api/schedule/pause");
      dispatch({ type: "PAUSE_DIALER" });
      addLog("Dialer paused", "info");
    } catch (err) {
      addLog(`Pause failed: ${err.message}`, "error");
    }
  }, [api, addLog]);

  const resumeDialer = useCallback(async () => {
    try {
      await api.post("/api/schedule/resume");
      dispatch({ type: "RESUME_DIALER" });
      addLog("Dialer resumed", "info");
    } catch (err) {
      addLog(`Resume failed: ${err.message}`, "error");
    }
  }, [api, addLog]);

  const resetDialer = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    dispatch({ type: "RESET_DIALER" });
    dispatch({ type: "CLEAR_ERROR" });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: "CLEAR_ERROR" });
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // PROVIDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <ScheduleContext.Provider
      value={{
        // State
        mode: state.mode,
        isRunning: state.isRunning,
        isPaused: state.isPaused,
        leads: state.leads,
        leadsCount: state.leadsCount,
        stats: state.stats,
        tagFilters: state.tagFilters,
        logs: state.logs,
        loading: state.loading,
        error: state.error,

        // Actions
        setMode,

        // Wynn
        fetchWynnLeads,
        startWynnDialer,

        // TAG
        setTagFilters,
        fetchTagLeads,
        startTagDialer,

        // Controls
        pauseDialer,
        resumeDialer,
        stopDialer,
        resetDialer,

        // Logs
        addLog,
        clearLogs,
        clearError,
      }}
    >
      {props.children}
    </ScheduleContext.Provider>
  );
};

export default ScheduleState;
