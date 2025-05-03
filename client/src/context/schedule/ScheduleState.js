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
  const fetchDailyReviews = async () => {
    dispatch({ type: "SCHEDULE_LOADING" });
    try {
      const res = await api.get("/api/schedule/review-today");
      dispatch({
        type: "SET_DAILY_REVIEW_LISTS",
        payload: res.data.reviewList,
      });
    } catch (error) {
      console.error("❌ Error fetching daily reviews:", error);
      dispatch({ type: "SCHEDULE_ERROR", payload: error.message });
    }
  };

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
        fetchDailyReviews,
        buildDailySchedule,
      }}
    >
      {props.children}
    </ScheduleContext.Provider>
  );
};

export default ScheduleState;
