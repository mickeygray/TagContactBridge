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

  return (
    <ScheduleContext.Provider
      value={{
        emailQueue: state.emailQueue,
        toReview: state.toReview,
        textQueue: state.textQueue,
        loading: state.loading,
        error: state.error,
        buildDailySchedule,
      }}
    >
      {props.children}
    </ScheduleContext.Provider>
  );
};

export default ScheduleState;
