// hooks/useAdmin.js — replaces AdminState + AdminContext
import { useReducer, useCallback } from "react";
import { api } from "../utils/api";
import { toast } from "../utils/toast";

const initialState = {
  consentRecords: [],
  consentRecord: null,
  consentStats: null,
  loading: false,
  error: null,
};

function adminReducer(state, action) {
  switch (action.type) {
    case "SET_CONSENT_RECORDS":
      return { ...state, consentRecords: action.payload, loading: false };
    case "SET_CONSENT_RECORD":
      return { ...state, consentRecord: action.payload, loading: false };
    case "SET_CONSENT_STATS":
      return { ...state, consentStats: action.payload, loading: false };
    case "CLEAR_CONSENT_RECORD":
      return { ...state, consentRecord: null };
    case "SET_LOADING":
      return { ...state, loading: true };
    case "SET_ERROR":
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
}

export function useAdmin() {
  const [state, dispatch] = useReducer(adminReducer, initialState);

  const searchConsentRecords = useCallback(async (params) => {
    dispatch({ type: "SET_LOADING" });
    try {
      const res = await api.get("/api/admin/consent-records", { params });
      dispatch({ type: "SET_CONSENT_RECORDS", payload: res.data });
      return res.data;
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
      toast.error("Consent Search", err.message);
    }
  }, []);

  const getConsentRecord = useCallback(async (id) => {
    dispatch({ type: "SET_LOADING" });
    try {
      const res = await api.get(`/api/admin/consent-records/${id}`);
      dispatch({ type: "SET_CONSENT_RECORD", payload: res.data });
      return res.data;
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
    }
  }, []);

  const getConsentStats = useCallback(async () => {
    try {
      const res = await api.get("/api/admin/consent-stats");
      dispatch({ type: "SET_CONSENT_STATS", payload: res.data });
      return res.data;
    } catch (err) {
      toast.error("Stats Error", err.message);
    }
  }, []);

  const clearConsentRecord = useCallback(() => {
    dispatch({ type: "CLEAR_CONSENT_RECORD" });
  }, []);

  return {
    ...state,
    searchConsentRecords,
    getConsentRecord,
    getConsentStats,
    clearConsentRecord,
  };
}
