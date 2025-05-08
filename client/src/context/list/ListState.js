import React, { useReducer, useContext } from "react";
import ListContext from "./listContext";
import listReducer from "./listReducer";
import { useApi } from "../../utils/api";
import MessageContext from "../../context/message/messageContext";
const ListState = (props) => {
  const initialState = {
    reviewClients: [],
    newClients: [],
    verified: [],
    zeroInvoiceList: [],
    toReview: [],
    partial: [],
    periodInfo: null,
  };

  const [state, dispatch] = useReducer(listReducer, initialState);
  const api = useApi();
  api.defaults.withCredentials = true;
  const { showMessage, showError } = useContext(MessageContext);
  /**
   * Post NCOA-formatted lists to backend
   */
  const postNCOAList = async (formattedData) => {
    try {
      const res = await api.post("/api/list/postNCOA", formattedData);
      dispatch({ type: "POST_LEADS", payload: res.data });

      const sentCount = formattedData.length;
      const postedCount = Array.isArray(res.data.results)
        ? res.data.results.length
        : sentCount;

      showMessage(
        "New Prospect Upload",
        `Posted ${postedCount} of ${sentCount} new prospects.`
      );
      console.log("Lists posted successfully:", res.data);
    } catch (error) {
      const msg = error.response?.data?.message || error.message;
      showError(
        "New Prospect Upload",
        `Failed to post ${formattedData.length} leads: ${msg}`,
        error.response?.status
      );
    }
  };
  /**
   * Build the period contact list based on filters
   */
  const buildPeriod = async (filters) => {
    try {
      const res = await api.post("/api/list/buildPeriod", filters);
      dispatch({ type: "SET_PERIOD_RESULTS", payload: res.data });
      const {
        periodInfo: { stage, periodSize, startDate },
      } = res.data;
      showMessage(
        "Period Created",
        `Stage “${stage}” — ${periodSize} clients scheduled starting ${new Date(
          startDate
        ).toLocaleString()}`,
        200
      );
    } catch (err) {
      console.error("❌ Failed to fetch period contacts", err);
    }
  };

  /**
   * Save create-date clients in bulk
   */
  const addCreateDateClients = async (clientsArray) => {
    try {
      const res = await api.post("/api/list/addCreateDateClients", {
        clients: clientsArray,
      });

      // Expecting { added: [...], flagged: [...] }
      const { added, reviewList } = res.data;

      // Update context state
      dispatch({ type: "CLEAR_REVIEW_CLIENTS" });
      dispatch({ type: "SET_REVIEW_CLIENTS", payload: reviewList });

      // Show summary toast
      showMessage(
        "Client Import",
        `Saved ${added.length} clients; ${reviewList.length} flagged for review.`,
        200
      );

      // Return raw response for callers
      return res.data;
    } catch (error) {
      const status = error.response?.status;
      const msg = error.response?.data?.message || error.message;
      showError("Client Import", `Error saving clients: ${msg}`, status);
      throw error;
    }
  };
  const removeReviewClient = (client) => {
    dispatch({ type: "REMOVE_REVIEW_CLIENT", payload: client.caseNumber });
  };
  /**
   * Fetch all clients flagged 'inReview', sorted by reviewDate
   */
  const fetchReviewClients = async () => {
    try {
      const res = await api.get("/api/list/reviewClients");
      dispatch({ type: "CLEAR_REVIEW_CLIENTS" });
      dispatch({ type: "SET_REVIEW_CLIENTS", payload: res.data });
    } catch (err) {
      console.error("❌ Failed to fetch review clients", err);
    }
  };

  const clearPeriod = () => {
    dispatch({ type: "CLEAR_PERIOD" });
  };

  const parseZeros = async (clients) => {
    try {
      const res = await api.post("/api/list/parseZeros", { clients });
      dispatch({
        type: "PARSE_ZEROS",
        payload: res.data.zeroInvoices,
      });
    } catch (err) {
      dispatch({
        type: "LIST_ERROR",
        payload: err.response?.data?.message || err.message,
      });
    }
  };
  // New: prospectDialerBuilder
  const buildDialerList = async (clients) => {
    // dispatch({ type: "SET_LOADING" });
    try {
      const res = await api.post("/api/list/validate", { clients });
      dispatch({
        type: "PROSPECT_DIALER",
        payload: res.data.dialerList,
      });
    } catch (err) {
      dispatch({
        type: "LIST_ERROR",
        payload: err.response?.data?.message || err.message,
      });
    }
  };

  const removeClientFromUploadList = (client) => {
    dispatch({ type: "SKIP CLIENT", payload: client.caseNumber });
  };
  return (
    <ListContext.Provider
      value={{
        verified: state.verified,
        partial: state.partial,
        toReview: state.toReview,
        periodInfo: state.periodInfo,
        reviewClients: state.reviewClients,
        newClients: state.newClients,
        zeroInvoiceList: state.zeroInvoiceList,
        prospectDialerList: state.prospectDialerList,
        postNCOAList,
        buildPeriod,
        parseZeros,
        buildDialerList,
        addCreateDateClients,
        clearPeriod,
        removeClientFromUploadList,
        fetchReviewClients,
      }}
    >
      {props.children}
    </ListContext.Provider>
  );
};

export default ListState;
