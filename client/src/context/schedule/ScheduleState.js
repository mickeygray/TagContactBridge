import React, { useReducer } from "react";
import ScheduleContext from "./scheduleContext";
import scheduleReducer from "./scheduleReducer";
import { useApi } from "../../utils/api";

const ScheduleState = (props) => {
  const initialState = {
    emailQueue: [],
    toReview: [],
    textQueue: [],
    loading: false,
    pace: 0,
    error: null,
  };

  const [state, dispatch] = useReducer(scheduleReducer, initialState);
  const api = useApi();
  api.defaults.withCredentials = true;

  /**
   * Fetch today's review lists (emailQueue, textQueue, toReview) from backend
   */

  const buildDailySchedule = async () => {
    const res = await api.post("/api/schedule/build");
    dispatch({
      type: "SET_DAILY_REVIEW_LISTS",
      payload: res.data,
    });
  };
  // scheduleContext.js

  // 1. Settings only:
  const updateScheduleSettings = async (settings) => {
    const res = await api.put("/api/schedule/pace", settings);
    dispatch({ type: "UPDATE_SETTINGS", payload: res.data });
  };

  // 3. Refresh after sends or reviews:
  const refreshDailyQueues = async () => {
    const res = await api.get("/api/schedule/refresh");
    dispatch({ type: "REFRESH_QUEUES", payload: res.data });
  };

  // 4. Process review decisions in bulk:

  const skipDailyClientProcessing = (client) => {
    dispatch({ type: "SKIP CLIENT", payload: client });
  };

  return (
    <ScheduleContext.Provider
      value={{
        emailQueue: state.emailQueue,
        toReview: state.toReview,
        textQueue: state.textQueue,
        pace: state.pace,
        loading: state.loading,
        error: state.error,
        skipDailyClientProcessing,
        buildDailySchedule,
        refreshDailyQueues,
        updateScheduleSettings,
      }}
    >
      {props.children}
    </ScheduleContext.Provider>
  );
};

export default ScheduleState;
