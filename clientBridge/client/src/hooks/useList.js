// hooks/useList.js — replaces ListState + ListContext
import { useReducer, useCallback } from "react";
import { api } from "../utils/api";
import { toast } from "../utils/toast";

const initialState = {
  reviewClients: [],
  newClients: [],
  verified: [],
  partial: [],
  filteredClients: [],
  zeroInvoiceList: [],
  searchedClients: [],
  validatedLienList: [],
  prospectDialerList: [],
  lexDataArray: [],
  toReview: [],
  contactAppendRows: [],
  periodInfo: null,
  recordCount: null,
  loading: false,
  error: null,
};

function listReducer(state, action) {
  switch (action.type) {
    case "POST_LEADS":
      return { ...state, newClients: action.payload, loading: false };
    case "SET_REVIEW_CLIENTS":
      return { ...state, reviewClients: action.payload, loading: false };
    case "CLEAR_REVIEW_CLIENTS":
      return { ...state, reviewClients: [] };
    case "SAVE_CONTACT_LIST":
      return { ...state, verified: action.payload.verified || [], partial: action.payload.partial || [], loading: false };
    case "ADD_TO_LEXARRAY":
      return { ...state, lexDataArray: [...state.lexDataArray, ...action.payload] };
    case "CLEAR_LEXARRAY":
      return { ...state, lexDataArray: [] };
    case "SET_SEARCHED_CLIENTS":
      return { ...state, searchedClients: action.payload, loading: false };
    case "SET_VALIDATED_LIEN_LIST":
      return { ...state, validatedLienList: action.payload, loading: false };
    case "SET_RECORD_COUNT":
      return { ...state, recordCount: action.payload };
    case "PARSE_ZEROS":
      return { ...state, zeroInvoiceList: action.payload, loading: false };
    case "PROSPECT_DIALER":
      return { ...state, prospectDialerList: action.payload, loading: false };
    case "SET_PERIOD_RESULTS":
      return { ...state, periodInfo: action.payload, loading: false };
    case "CLEAR_PERIOD":
      return { ...state, periodInfo: null };
    case "APPEND_CONTACT_SUCCESS":
      return { ...state, contactAppendRows: action.payload, loading: false };
    case "SET_FILTERED":
      return { ...state, filteredClients: action.payload, loading: false };
    case "SET_LOADING":
      return { ...state, loading: true, error: null };
    case "SET_ERROR":
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
}

export function useList() {
  const [state, dispatch] = useReducer(listReducer, initialState);

  const postNCOAList = useCallback(async (payload) => {
    dispatch({ type: "SET_LOADING" });
    try {
      const res = await api.post("/api/list/postNCOA", payload);
      dispatch({ type: "POST_LEADS", payload: res.data });
      toast.success("NCOA", `${res.data.length} contacts processed`);
      return res.data;
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
      toast.error("NCOA Error", err.message);
    }
  }, []);

  const appendContactInfo = useCallback(async (payload) => {
    dispatch({ type: "SET_LOADING" });
    try {
      const res = await api.post("/api/list/appendContactInfo", payload);
      dispatch({ type: "APPEND_CONTACT_SUCCESS", payload: res.data });
      return res.data;
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
      toast.error("Append Error", err.message);
    }
  }, []);

  const buildLienList = useCallback(async (payload) => {
    dispatch({ type: "SET_LOADING" });
    try {
      const res = await api.post("/api/list/buildLienList", payload);
      dispatch({ type: "SET_VALIDATED_LIEN_LIST", payload: res.data });
      return res.data;
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
      toast.error("Lien List Error", err.message);
    }
  }, []);

  const downloadAndEmailDaily = useCallback(async () => {
    dispatch({ type: "SET_LOADING" });
    try {
      const res = await api.post("/api/list/download-and-email-daily");
      dispatch({ type: "SET_RECORD_COUNT", payload: res.data });
      toast.success("Daily Report", "Downloaded and emailed");
      return res.data;
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
      toast.error("Daily Report Error", err.message);
    }
  }, []);

  const buildPeriod = useCallback(async (payload) => {
    dispatch({ type: "SET_LOADING" });
    try {
      const res = await api.post("/api/list/buildPeriod", payload);
      dispatch({ type: "SET_PERIOD_RESULTS", payload: res.data });
      return res.data;
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
      toast.error("Period Error", err.message);
    }
  }, []);

  const addCreateDateClients = useCallback(async (payload) => {
    dispatch({ type: "SET_LOADING" });
    try {
      const res = await api.post("/api/list/addCreateDateClients", payload);
      dispatch({ type: "SAVE_CONTACT_LIST", payload: res.data });
      return res.data;
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
      toast.error("Create Date Error", err.message);
    }
  }, []);

  const fetchReviewClients = useCallback(async () => {
    dispatch({ type: "SET_LOADING" });
    try {
      const res = await api.get("/api/list/reviewClients");
      dispatch({ type: "SET_REVIEW_CLIENTS", payload: res.data });
      return res.data;
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
    }
  }, []);

  const parseZeros = useCallback(async (payload) => {
    dispatch({ type: "SET_LOADING" });
    try {
      const res = await api.post("/api/list/parseZeros", payload);
      dispatch({ type: "PARSE_ZEROS", payload: res.data });
      return res.data;
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
    }
  }, []);

  const buildDialerList = useCallback(async (payload) => {
    dispatch({ type: "SET_LOADING" });
    try {
      const res = await api.post("/api/list/validate", payload);
      dispatch({ type: "PROSPECT_DIALER", payload: res.data });
      return res.data;
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
    }
  }, []);

  const filterList = useCallback(async (payload) => {
    dispatch({ type: "SET_LOADING" });
    try {
      const res = await api.post("/api/list/filterList", payload);
      dispatch({ type: "SET_FILTERED", payload: res.data });
      return res.data;
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
    }
  }, []);

  const searchUnifiedClients = useCallback(async (payload) => {
    dispatch({ type: "SET_LOADING" });
    try {
      const res = await api.post("/api/list/search", payload);
      dispatch({ type: "SET_SEARCHED_CLIENTS", payload: res.data });
      return res.data;
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err.message });
    }
  }, []);

  const clearPeriod = useCallback(() => dispatch({ type: "CLEAR_PERIOD" }), []);
  const clearLexDataArray = useCallback(() => dispatch({ type: "CLEAR_LEXARRAY" }), []);
  const addToLexArray = useCallback((data) => dispatch({ type: "ADD_TO_LEXARRAY", payload: data }), []);

  return {
    ...state,
    postNCOAList,
    appendContactInfo,
    buildLienList,
    downloadAndEmailDaily,
    buildPeriod,
    addCreateDateClients,
    fetchReviewClients,
    parseZeros,
    buildDialerList,
    filterList,
    searchUnifiedClients,
    clearPeriod,
    clearLexDataArray,
    addToLexArray,
  };
}
