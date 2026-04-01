// hooks/useClients.js — replaces ClientState + ClientContext
import { useReducer, useCallback } from "react";
import { api } from "../utils/api";
import { toast } from "../utils/toast";

const initialState = {
  enrichedClient: null,
  newClient: null,
  loading: false,
  error: null,
};

function clientReducer(state, action) {
  switch (action.type) {
    case "ENRICH_CLIENT":
      return { ...state, enrichedClient: action.payload, loading: false };
    case "CLEAR_ENRICHMENT":
      return { ...state, enrichedClient: null };
    case "RESET_NEW_CLIENT":
      return { ...state, newClient: null };
    case "ADD_CLIENT":
      return { ...state, newClient: action.payload, loading: false };
    case "SET_LOADING":
      return { ...state, loading: true, error: null };
    case "SET_ERROR":
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
}

export function useClients() {
  const [state, dispatch] = useReducer(clientReducer, initialState);

  const enrichClient = useCallback(async (caseNumber, domain) => {
    dispatch({ type: "SET_LOADING" });
    try {
      const res = await api.post("/api/clients/enrichClient", { caseNumber, domain });
      dispatch({ type: "ENRICH_CLIENT", payload: res.data });
      return res.data;
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
      toast.error("Enrichment Error", err.response?.data?.error || err.message);
    }
  }, []);

  const clearEnrichedClient = useCallback(() => {
    dispatch({ type: "CLEAR_ENRICHMENT" });
  }, []);

  const resetNewClient = useCallback(() => {
    dispatch({ type: "RESET_NEW_CLIENT" });
  }, []);

  const uploadFileToCase = useCallback(async (formData) => {
    try {
      const res = await api.post("/api/clients/uploadDocument", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Upload", "File uploaded successfully");
      return res.data;
    } catch (err) {
      toast.error("Upload Error", err.message);
      throw err;
    }
  }, []);

  const postZeroInvoice = useCallback(async (payload) => {
    try {
      const res = await api.post("/api/clients/zeroInvoice", payload);
      toast.success("Invoice", "Zero invoice created");
      return res.data;
    } catch (err) {
      toast.error("Invoice Error", err.message);
      throw err;
    }
  }, []);

  const createTaskForClient = useCallback(async (payload) => {
    try {
      const res = await api.post("/api/clients/createTask", payload);
      toast.success("Task", "Task created");
      return res.data;
    } catch (err) {
      toast.error("Task Error", err.message);
      throw err;
    }
  }, []);

  const createActivityForClient = useCallback(async (payload) => {
    try {
      const res = await api.post("/api/clients/createActivity", payload);
      toast.success("Activity", "Activity created");
      return res.data;
    } catch (err) {
      toast.error("Activity Error", err.message);
      throw err;
    }
  }, []);

  const addScheduledClient = useCallback(async (payload) => {
    dispatch({ type: "SET_LOADING" });
    try {
      const res = await api.post("/api/clients", payload);
      dispatch({ type: "ADD_CLIENT", payload: res.data });
      toast.success("Client", "Client added to schedule");
      return res.data;
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
      toast.error("Client Error", err.message);
      throw err;
    }
  }, []);

  const deleteScheduledClient = useCallback(async (payload) => {
    try {
      const res = await api.post("/api/clients/delete", payload);
      toast.success("Deleted", "Client removed from schedule");
      return res.data;
    } catch (err) {
      toast.error("Delete Error", err.message);
      throw err;
    }
  }, []);

  const processReviewedSaleDateClient = useCallback(async (payload) => {
    try {
      const res = await api.post("/api/clients/reviewSaleDate", payload);
      return res.data;
    } catch (err) {
      toast.error("Review Error", err.message);
      throw err;
    }
  }, []);

  const processReviewedCreateDateClient = useCallback(async (payload) => {
    try {
      const res = await api.post("/api/clients/reviewCreateDate", payload);
      return res.data;
    } catch (err) {
      toast.error("Review Error", err.message);
      throw err;
    }
  }, []);

  return {
    ...state,
    enrichClient,
    clearEnrichedClient,
    resetNewClient,
    uploadFileToCase,
    postZeroInvoice,
    createTaskForClient,
    createActivityForClient,
    addScheduledClient,
    deleteScheduledClient,
    processReviewedSaleDateClient,
    processReviewedCreateDateClient,
  };
}
