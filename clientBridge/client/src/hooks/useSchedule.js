// hooks/useSchedule.js — replaces ScheduleState + ScheduleContext
import { useReducer, useCallback, useRef, useEffect } from "react";
import { api } from "../utils/api";
import { toast } from "../utils/toast";

const initialState = {
  mode: "wynn",
  isRunning: false,
  isPaused: false,
  leads: [],
  leadsCount: 0,
  stats: { queued: 0, processed: 0, failed: 0, total: 0 },
  tagFilters: { startDate: "", endDate: "", sourceName: "" },
  logs: [],
  loading: false,
  error: null,
};

function scheduleReducer(state, action) {
  switch (action.type) {
    case "SET_MODE":
      return { ...state, mode: action.payload, leads: [], leadsCount: 0, logs: [] };
    case "SET_LEADS":
      return { ...state, leads: action.payload, leadsCount: action.payload.length, loading: false };
    case "START_DIALER":
      return { ...state, isRunning: true, isPaused: false, stats: { queued: action.payload || 0, processed: 0, failed: 0, total: action.payload || 0 } };
    case "UPDATE_STATS":
      return { ...state, stats: action.payload, isRunning: action.payload.queued > 0 };
    case "PAUSE_DIALER":
      return { ...state, isPaused: true };
    case "RESUME_DIALER":
      return { ...state, isPaused: false };
    case "STOP_DIALER":
      return { ...state, isRunning: false, isPaused: false };
    case "RESET_DIALER":
      return { ...state, isRunning: false, isPaused: false, leads: [], leadsCount: 0, stats: initialState.stats, logs: [] };
    case "SET_TAG_FILTERS":
      return { ...state, tagFilters: { ...state.tagFilters, ...action.payload } };
    case "ADD_LOG":
      return { ...state, logs: [action.payload, ...state.logs].slice(0, 100) };
    case "CLEAR_LOGS":
      return { ...state, logs: [] };
    case "SET_LOADING":
      return { ...state, loading: true, error: null };
    case "SET_ERROR":
      return { ...state, error: action.payload, loading: false };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    default:
      return state;
  }
}

export function useSchedule() {
  const [state, dispatch] = useReducer(scheduleReducer, initialState);
  const pollRef = useRef(null);

  const setMode = useCallback((mode) => dispatch({ type: "SET_MODE", payload: mode }), []);

  const fetchWynnLeads = useCallback(async () => {
    dispatch({ type: "SET_LOADING" });
    try {
      const res = await api.get("/api/schedule/wynn-leads");
      dispatch({ type: "SET_LEADS", payload: res.data });
      return res.data;
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
    }
  }, []);

  const startWynnDialer = useCallback(async (leads) => {
    try {
      await api.post("/api/schedule/start-wynn", { leads });
      dispatch({ type: "START_DIALER", payload: leads.length });
      startPolling();
      toast.success("Dialer", "Wynn dialer started");
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
    }
  }, []);

  const fetchTagLeads = useCallback(async (filters) => {
    dispatch({ type: "SET_LOADING" });
    try {
      const res = await api.get("/api/schedule/tag-leads", { params: filters });
      dispatch({ type: "SET_LEADS", payload: res.data });
      return res.data;
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
    }
  }, []);

  const startTagDialer = useCallback(async (leads) => {
    try {
      await api.post("/api/schedule/start-tag", { leads });
      dispatch({ type: "START_DIALER", payload: leads.length });
      startPolling();
      toast.success("Dialer", "TAG dialer started");
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
    }
  }, []);

  const setTagFilters = useCallback((filters) => {
    dispatch({ type: "SET_TAG_FILTERS", payload: filters });
  }, []);

  const pauseDialer = useCallback(async () => {
    try {
      await api.post("/api/schedule/pause");
      dispatch({ type: "PAUSE_DIALER" });
    } catch (err) {
      toast.error("Dialer", err.message);
    }
  }, []);

  const resumeDialer = useCallback(async () => {
    try {
      await api.post("/api/schedule/resume");
      dispatch({ type: "RESUME_DIALER" });
    } catch (err) {
      toast.error("Dialer", err.message);
    }
  }, []);

  const stopDialer = useCallback(async () => {
    try {
      await api.post("/api/schedule/stop");
      dispatch({ type: "STOP_DIALER" });
      stopPolling();
    } catch (err) {
      toast.error("Dialer", err.message);
    }
  }, []);

  const resetDialer = useCallback(() => {
    stopPolling();
    dispatch({ type: "RESET_DIALER" });
  }, []);

  const addLog = useCallback((msg) => {
    dispatch({ type: "ADD_LOG", payload: { time: new Date().toLocaleTimeString(), msg } });
  }, []);

  const clearLogs = useCallback(() => dispatch({ type: "CLEAR_LOGS" }), []);
  const clearError = useCallback(() => dispatch({ type: "CLEAR_ERROR" }), []);

  function startPolling() {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get("/api/schedule/status");
        dispatch({ type: "UPDATE_STATS", payload: res.data });
        if (res.data.queued === 0) stopPolling();
      } catch { /* ignore polling errors */ }
    }, 5000);
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  // Cleanup polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  return {
    ...state,
    setMode,
    fetchWynnLeads,
    startWynnDialer,
    setTagFilters,
    fetchTagLeads,
    startTagDialer,
    pauseDialer,
    resumeDialer,
    stopDialer,
    resetDialer,
    addLog,
    clearLogs,
    clearError,
  };
}
