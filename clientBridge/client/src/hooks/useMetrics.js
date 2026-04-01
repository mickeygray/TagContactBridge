// hooks/useMetrics.js — date-range metrics from all data sources
import { useReducer, useCallback } from "react";
import { api } from "../utils/api";
import { toast } from "../utils/toast";

const initialState = {
  snapshot: null,
  loading: false,
  error: null,
  dateRange: {
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
    company: "",
  },
};

function metricsReducer(state, action) {
  switch (action.type) {
    case "SET_DATE_RANGE":
      return { ...state, dateRange: { ...state.dateRange, ...action.payload } };
    case "LOADING":
      return { ...state, loading: true, error: null };
    case "SET_SNAPSHOT":
      return { ...state, snapshot: action.payload, loading: false };
    case "ERROR":
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
}

export function useMetrics() {
  const [state, dispatch] = useReducer(metricsReducer, initialState);

  const setDateRange = useCallback((update) => {
    dispatch({ type: "SET_DATE_RANGE", payload: update });
  }, []);

  const fetchSnapshot = useCallback(async (params) => {
    dispatch({ type: "LOADING" });
    try {
      const query = new URLSearchParams();
      if (params?.startDate) query.set("startDate", params.startDate);
      if (params?.endDate) query.set("endDate", params.endDate);
      if (params?.company) query.set("company", params.company);

      const res = await api.get(`/api/metrics/snapshot?${query}`);
      dispatch({ type: "SET_SNAPSHOT", payload: res.data });
      return res.data;
    } catch (err) {
      dispatch({ type: "ERROR", payload: err.message });
      toast.error("Metrics", err.response?.data?.error || err.message);
    }
  }, []);

  const importMailCSV = useCallback(async (file) => {
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post("/api/metrics/mail/import", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Mail Import", `${res.data.rowsProcessed} rows processed`);
      return res.data;
    } catch (err) {
      toast.error("Import Error", err.response?.data?.error || err.message);
    }
  }, []);

  return { ...state, setDateRange, fetchSnapshot, importMailCSV };
}
