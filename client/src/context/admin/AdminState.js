// client/src/context/admin/AdminState.js
import React, { useReducer } from "react";
import AdminContext from "./adminContext";
import adminReducer from "./adminReducer";

const initialState = {
  consentRecords: [],
  consentRecord: null,
  consentStats: null,
  loading: false,
  error: null,
};

const AdminState = ({ children }) => {
  const [state, dispatch] = useReducer(adminReducer, initialState);

  // ── Search consent records ──────────────────────────────────
  const searchConsentRecords = async (params = {}) => {
    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v) query.append(k, v);
      });

      const res = await fetch(
        `/api/admin/consent-records?${query.toString()}`,
        {
          credentials: "include",
        },
      );
      const data = await res.json();

      if (!data.ok) throw new Error(data.error || "Failed to fetch records");

      dispatch({ type: "SET_CONSENT_RECORDS", payload: data.records });
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  // ── Get single consent record ───────────────────────────────
  const getConsentRecord = async (id) => {
    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const res = await fetch(`/api/admin/consent-records/${id}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Not found");
      dispatch({ type: "SET_CONSENT_RECORD", payload: data.record });
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  // ── Get consent stats ───────────────────────────────────────
  const getConsentStats = async () => {
    try {
      const res = await fetch("/api/admin/consent-stats", {
        credentials: "include",
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      dispatch({ type: "SET_CONSENT_STATS", payload: data.stats });
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
    }
  };

  // ── Clear selected record ───────────────────────────────────
  const clearConsentRecord = () => {
    dispatch({ type: "SET_CONSENT_RECORD", payload: null });
  };

  return (
    <AdminContext.Provider
      value={{
        consentRecords: state.consentRecords,
        consentRecord: state.consentRecord,
        consentStats: state.consentStats,
        loading: state.loading,
        error: state.error,
        searchConsentRecords,
        getConsentRecord,
        getConsentStats,
        clearConsentRecord,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};

export default AdminState;
