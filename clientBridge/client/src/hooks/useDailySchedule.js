// hooks/useDailySchedule.js
// Provides daily schedule queue state and actions previously on ScheduleContext.
// TODO: Backend routes for daily schedule are not yet implemented.
//       The endpoints below are provisional and must be created on the server
//       before this hook becomes fully functional.

import { useReducer, useCallback } from "react";
import { api } from "../utils/api";
import { toast } from "../utils/toast";

const initialState = {
  emailQueue: [],
  textQueue: [],
  toReview: [],
  pace: 25,
  loading: false,
  error: null,
};

function dailyScheduleReducer(state, action) {
  switch (action.type) {
    case "SET_QUEUES":
      return {
        ...state,
        emailQueue: action.payload.emailQueue || [],
        textQueue: action.payload.textQueue || [],
        toReview: action.payload.toReview || [],
        pace: action.payload.pace ?? state.pace,
        loading: false,
      };
    case "SET_PACE":
      return { ...state, pace: action.payload };
    case "SET_LOADING":
      return { ...state, loading: true, error: null };
    case "SET_ERROR":
      return { ...state, error: action.payload, loading: false };
    case "CLEAR_LOADING":
      return { ...state, loading: false };
    default:
      return state;
  }
}

export function useDailySchedule() {
  const [state, dispatch] = useReducer(dailyScheduleReducer, initialState);

  const refreshDailyQueues = useCallback(async () => {
    dispatch({ type: "SET_LOADING" });
    try {
      const res = await api.get("/api/schedule/daily-queues");
      dispatch({ type: "SET_QUEUES", payload: res.data });
      return res.data;
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
      toast.error("Queue Error", err.message);
    }
  }, []);

  const buildDailySchedule = useCallback(async () => {
    dispatch({ type: "SET_LOADING" });
    try {
      const res = await api.post("/api/schedule/build-daily");
      dispatch({ type: "SET_QUEUES", payload: res.data });
      toast.success("Schedule", "Daily schedule built");
      return res.data;
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
      toast.error("Build Error", err.message);
      throw err;
    }
  }, []);

  const processReviewActions = useCallback(async (reviewItems) => {
    dispatch({ type: "SET_LOADING" });
    try {
      const res = await api.post("/api/schedule/process-reviews", { items: reviewItems });
      toast.success("Reviews", "Review actions applied");
      return res.data;
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
      toast.error("Review Error", err.message);
      throw err;
    }
  }, []);

  const skipDailyClientProcessing = useCallback((client) => {
    dispatch({
      type: "SET_QUEUES",
      payload: {
        emailQueue: state.emailQueue.filter(
          (c) => !(c.caseNumber === client.caseNumber && c.domain === client.domain)
        ),
        textQueue: state.textQueue.filter(
          (c) => !(c.caseNumber === client.caseNumber && c.domain === client.domain)
        ),
        toReview: state.toReview.filter(
          (c) => !(c.caseNumber === client.caseNumber && c.domain === client.domain)
        ),
        pace: state.pace,
      },
    });
  }, [state.emailQueue, state.textQueue, state.toReview, state.pace]);

  const updateScheduleSettings = useCallback(async (settings) => {
    try {
      const res = await api.put("/api/schedule/settings", settings);
      if (settings.pace != null) {
        dispatch({ type: "SET_PACE", payload: settings.pace });
      }
      toast.success("Settings", "Schedule settings updated");
      return res.data;
    } catch (err) {
      toast.error("Settings Error", err.message);
      throw err;
    }
  }, []);

  return {
    ...state,
    refreshDailyQueues,
    buildDailySchedule,
    processReviewActions,
    updateScheduleSettings,
    skipDailyClientProcessing,
  };
}
