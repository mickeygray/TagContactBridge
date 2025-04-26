// context/schedule/ScheduleState.js
import React, { useReducer } from "react";
import axios from "axios";
import ScheduleContext from "./scheduleContext";
import scheduleReducer from "./scheduleReducer";

const ScheduleState = (props) => {
  const initialState = {
    emailQueue: [],
    toReview: [],
    textQueue: [],
    loading: false,
    error: null,
  };

  const [state, dispatch] = useReducer(scheduleReducer, initialState);

  // Add new scheduled client

  // Fetch daily review clients (via cron-triggered backend route)
  const fetchDailyReviews = async () => {
    try {
      const res = await axios.get("/api/schedule/review-today");
      dispatch({
        type: "SET_DAILY_REVIEW_LISTS",
        payload: res.data.reviewList,
      });
    } catch (error) {
      console.error("❌ Error fetching daily reviews:", error);
    }
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
      }}
    >
      {props.children}
    </ScheduleContext.Provider>
  );
};

export default ScheduleState;
