import React, { useReducer, useContext } from "react";
import ClientContext from "./clientContext";
import clientReducer from "./clientReducer";
import { useApi } from "../../utils/api";
import MessageContext from "../../context/message/messageContext";
const ClientState = (props) => {
  const initialState = {
    enrichedClient: null,
    newClient: null,
  };
  const [state, dispatch] = useReducer(clientReducer, initialState);
  const { showMessage, showError } = useContext(MessageContext);
  const api = useApi();
  api.defaults.withCredentials = true;

  // ───────────── Document Upload ─────────────
  const uploadFileToCase = async ({ file, caseNumber }) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("caseNumber", caseNumber);
      await api.post("/api/clients/uploadDocument", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      console.log("File uploaded");
    } catch (err) {
      console.error("Upload failed:", err);
    }
  };

  // ───────────── Enrichment & Billing ─────────────
  const enrichClient = async (client) => {
    try {
      const res = await api.post("/api/clients/enrichClient", client);
      dispatch({ type: "ENRICH_CLIENT", payload: res.data });
      console.log("✅ Enriched:", res.data);
    } catch (err) {
      console.error("Enrich failed:", err);
    }
  };

  const clearEnrichedClient = async () => {
    try {
      dispatch({ type: "CLEAR_ENRICHMENT" });
    } catch (err) {
      console.error("Enrich failed:", err);
    }
  };
  const postZeroInvoice = async (caseID) => {
    try {
      const res = await api.post("/api/clients/zeroInvoice", { caseID });
      console.log("✅ Zero invoice:", res.data);
    } catch (err) {
      console.error("Zero-invoice failed:", err);
    }
  };

  const createTaskForClient = async (task) => {
    try {
      const res = await api.post("/api/clients/createTask", task);
      console.log("✅ Task created:", res.data);
    } catch (err) {
      console.error("Create task failed:", err);
    }
  };

  const createActivityForClient = async (activity) => {
    try {
      const res = await api.post("/api/clients/createActivity", activity);
      console.log("✅ Activity created:", res.data);
    } catch (err) {
      console.error("Create activity failed:", err);
    }
  };

  // ───────────── Scheduled-client CRUD ─────────────
  const addScheduledClient = async (clientData) => {
    try {
      const res = await api.post("/api/clients", clientData);
      dispatch({ type: "ADD_SCHEDULED_CLIENT", payload: res.data });
      showMessage("New Client Alert", `${res.data.message}`);
    } catch (err) {
      console.error("Add scheduled client failed:", err);
    }
  };

  const deleteScheduledClient = async (client) => {
    try {
      const { caseNumber, domain, _id } = client;
      // sends { caseNumber, domain } in body
      await api.delete("/api/clients/delete", {
        data: { caseNumber, domain, _id },
      });
      dispatch({ type: "DELETE_SCHEDULED_CLIENT", payload: caseNumber });
    } catch (err) {
      console.error("Delete scheduled client failed:", err);
    }
  };

  // ───────────── Review handlers ─────────────
  const processReviewedSaleDateClient = async (client, action) => {
    try {
      const res = await api.post("/api/clients/reviewSaleDate", {
        client,
        action,
      });
      dispatch({
        type: "UPDATE_SCHEDULED_CLIENT",
        payload: res.data.client || res.data,
      });
    } catch (err) {
      console.error("Sale-date review failed:", err);
    }
  };

  const processReviewedCreateDateClient = async (client, action) => {
    try {
      const res = await api.post("/api/clients/reviewCreateDate", {
        client,
        action,
      });
      dispatch({
        type: "UPDATE_SCHEDULED_CLIENT",
        payload: res.data.client || res.data,
      });
    } catch (err) {
      console.error("Create-date review failed:", err);
    }
  };

  // ───────────── Local-only helper ─────────────
  const skipClient = (clientID) => {
    dispatch({ type: "SKIP_CLIENT", payload: clientID });
  };

  return (
    <ClientContext.Provider
      value={{
        enrichedClient: state.enrichedClient,
        newClient: state.newClient,
        uploadFileToCase,
        enrichClient,
        postZeroInvoice,
        createTaskForClient,
        createActivityForClient,
        addScheduledClient,
        clearEnrichedClient,
        deleteScheduledClient,
        processReviewedSaleDateClient,
        processReviewedCreateDateClient,
        skipClient,
      }}
    >
      {props.children}
    </ClientContext.Provider>
  );
};

export default ClientState;
