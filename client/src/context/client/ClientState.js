import React, { useReducer } from "react";
import ClientContext from "./clientContext";
import clientReducer from "./clientReducer";
import { useApi } from "../../utils/api";

const ClientState = (props) => {
  const initialState = { enrichedClient: null, newClient: null };
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
      const res = await api.post("/api/clients/zeroInvoice", { caseID });
      console.log("✅ Zero invoice posted:", res.data);
    } catch (err) {
      console.error("❌ Error posting zero invoice:", err);
    }
  };

  /**
   * Enrich a batch of clients via backend service
   */
  const enrichClient = async (client) => {
    try {
      const res = await api.post("/api/clients/enrichClient", client, {
        headers: { "Content-Type": "application/json" },
      });
      dispatch({ type: "CLEAR_ENRICHMENT" });
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
      const res = await api.post("/api/clients", clientData);
      dispatch({ type: "ADD_SCHEDULED_CLIENT", payload: res.data });
    } catch (error) {
      console.error("❌ Error adding scheduled client:", error);
    }
  };

  /**
   * Update an existing scheduled client
   */
  const processReviewedClient = async (client, action, clientState) => {
    try {
      const res = await api.post(`/api/clients/review`, { client, action });
      !clientState &&
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
      await api.delete(`/api/clients/${id}`);
      dispatch({ type: "DELETE_SCHEDULED_CLIENT", payload: id });
    } catch (error) {
      console.error("❌ Error deleting scheduled client:", error);
    }
  };
  /**
   * Create a follow-up task for this client in Logics
   */
  const createTaskForClient = async ({
    caseID,
    subject,
    comments,
    dueDate,
  }) => {
    try {
      const res = await api.post("/api/clients/createTask", {
        caseID,
        subject,
        comments,
        dueDate,
      });
      console.log("✅ Task created:", res.data);
      // you might dispatch something here:
      // dispatch({ type: "CREATE_TASK", payload: res.data });
    } catch (err) {
      console.error("❌ Error creating task:", err);
    }
  };

  /**
   * Log an activity/note for this client
   */
  const createActivityForClient = async ({ caseID, subject, comment }) => {
    try {
      const res = await api.post("/api/clients/createActivity", {
        caseID,
        subject,
        comment,
      });
      console.log("✅ Activity recorded:", res.data);
      // dispatch({ type: "CREATE_ACTIVITY", payload: res.data });
    } catch (err) {
      console.error("❌ Error recording activity:", err);
    }
  };

  /**
   * Skip this client for the current period (remove from local list)
   */
  const skipClient = (clientID) => {
    dispatch({ type: "SKIP_CLIENT", payload: clientID });
  };

  /**
   * Re-insert a previously skipped/removed client back into the period
   */
  const reinsertClientToPeriod = async (clientID) => {
    try {
      const res = await api.post("/api/clients/reinsertToPeriod", {
        clientID,
      });
      console.log("✅ Client reinserted to period:", res.data);
      dispatch({ type: "REINSERT_CLIENT", payload: res.data });
    } catch (err) {
      console.error("❌ Error reinserting client:", err);
    }
  };
  const addClientToPeriod = async (client, periodID) => {
    try {
      // note: make sure your router is mounted under /api/clients
      const res = await api.put("/api/clients/reinsertToPeriod", {
        clientID: client._id,
        periodID,
      });
      console.log("✅ Client re-inserted into period:", res.data);
      return res.data;
    } catch (err) {
      console.error("❌ Error adding client to period:", err);
      // re-throw so callers can show an error toast, etc.
      throw err;
    }
  };
  return (
    <ClientContext.Provider
      value={{
        enrichedClient: state.enrichedClient,
        newClient: state.newClient,
        uploadFileToCase,
        postZeroInvoice,
        enrichClient,
        addScheduledClient,
        addClientToPeriod,
        processReviewedClient,
        deleteScheduledClient,
        createTaskForClient,
        createActivityForClient,
        skipClient,
        reinsertClientToPeriod,
      }}
    >
      {props.children}
    </ClientContext.Provider>
  );
};

export default ClientState;
