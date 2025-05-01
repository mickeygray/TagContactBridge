import React, { useReducer } from "react";
import ClientContext from "./clientContext";
import clientReducer from "./clientReducer";
import { useApi } from "../../utils/api";

const ClientState = (props) => {
  const initialState = { enrichedClient: null };
  const [state, dispatch] = useReducer(clientReducer, initialState);

  // useApi provides a pre-configured axios instance with interceptors
  const api = useApi();
  api.defaults.withCredentials = true;

  /**
   * Upload a file to a Logics case
   * @param {{ file: File, caseID: string }} params
   */
  const uploadFileToCase = async ({ file, caseID }) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("caseID", caseID);

      await api.post("/api/clients/uploadDocument", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      console.log("File uploaded to Logics");
    } catch (err) {
      console.error("Upload failed:", err);
    }
  };

  /**
   * Create a zero-dollar invoice for a case
   */
  const postZeroInvoice = async (caseID) => {
    try {
      const res = await api.post("/api/list/zeroInvoice", { caseID });
      console.log("✅ Zero invoice posted:", res.data);
    } catch (err) {
      console.error("❌ Error posting zero invoice:", err);
    }
  };

  /**
   * Enrich a batch of clients via backend service
   */
  const runClientEnrichment = async (client) => {
    try {
      const res = await api.post("/api/clients/enrichClient", client, {
        headers: { "Content-Type": "application/json" },
      });
      dispatch({ type: "ENRICH_CLIENT", payload: res.data });
      console.log("✅ Enriched Clients Received:", res.data);
    } catch (error) {
      console.error(
        "❌ Error enriching clients:",
        error.response?.data || error.message
      );
      // you could dispatch an error message here if desired
    }
  };

  /**
   * Schedule a new client
   */
  const addScheduledClient = async (clientData) => {
    try {
      const res = await api.post("/api/schedule", clientData);
      dispatch({ type: "ADD_SCHEDULED_CLIENT", payload: res.data });
    } catch (error) {
      console.error("❌ Error adding scheduled client:", error);
    }
  };

  /**
   * Update an existing scheduled client
   */
  const updateScheduledClient = async (id, updates) => {
    try {
      const res = await api.put(`/api/schedule/${id}`, updates);
      dispatch({ type: "UPDATE_SCHEDULED_CLIENT", payload: res.data });
    } catch (error) {
      console.error("❌ Error updating scheduled client:", error);
    }
  };

  /**
   * Delete a scheduled client
   */
  const deleteScheduledClient = async (id) => {
    try {
      await api.delete(`/api/schedule/${id}`);
      dispatch({ type: "DELETE_SCHEDULED_CLIENT", payload: id });
    } catch (error) {
      console.error("❌ Error deleting scheduled client:", error);
    }
  };

  return (
    <ClientContext.Provider
      value={{
        enrichedClient: state.enrichedClient,
        uploadFileToCase,
        postZeroInvoice,
        runClientEnrichment,
        addScheduledClient,
        updateScheduledClient,
        deleteScheduledClient,
      }}
    >
      {props.children}
    </ClientContext.Provider>
  );
};

export default ClientState;
