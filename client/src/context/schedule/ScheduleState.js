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
  const addScheduledClient = async (clientData) => {
    try {
      const res = await axios.post("/api/schedule", clientData);
      dispatch({ type: "ADD_SCHEDULED_CLIENT", payload: res.data });
    } catch (error) {
      console.error("❌ Error adding client:", error);
    }
  };

  // Update scheduled client
  const updateScheduledClient = async (id, updates) => {
    try {
      const res = await axios.put(`/api/schedule/${id}`, updates);
      dispatch({ type: "UPDATE_SCHEDULED_CLIENT", payload: res.data });
    } catch (error) {
      console.error("❌ Error updating client:", error);
    }
  };

  // Delete scheduled client
  const deleteScheduledClient = async (id) => {
    try {
      await axios.delete(`/api/schedule/${id}`);
      dispatch({ type: "DELETE_SCHEDULED_CLIENT", payload: id });
    } catch (error) {
      console.error("❌ Error deleting client:", error);
    }
  };

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
        addScheduledClient,
        updateScheduledClient,
        deleteScheduledClient,
        fetchDailyReviews,
      }}
    >
      {props.children}
    </ScheduleContext.Provider>
  );
};

export default ScheduleState;
