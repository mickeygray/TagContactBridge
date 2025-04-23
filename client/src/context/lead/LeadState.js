import React, { useReducer } from "react";
import axios from "axios";
import LeadContext from "./leadContext";
import leadReducer from "./leadReducer";

const LeadState = (props) => {
  const initialState = {
    activeLeads: [], // Leads that have never been frozen
    frozenLeads: [], // Leads that are currently frozen
    unfrozenLeads: [], // Leads that were frozen and are now active again
  };

  const [state, dispatch] = useReducer(leadReducer, initialState);

  // Upload leads function
  const uploadLeads = async (parsedData) => {
    try {
      console.log(parsedData);
      const response = await axios.post("/api/leads/newLeads", {
        leads: parsedData,
      });

      if (response.data.success) {
        dispatch({ type: "UPLOAD_LEADS", payload: response.data.newLeads });
        return `Uploaded ${response.data.newLeads.length} new leads.`;
      } else {
        throw new Error("Error uploading leads.");
      }
    } catch (error) {
      console.error("Upload error:", error);
      throw new Error("Failed to upload leads.");
    }
  };

  const updateLeadsFromCalls = async (calls) => {
    try {
      const response = await axios.post("/api/leads/updateFromCalls", {
        calls,
      });
      dispatch({
        type: "UPDATE_LEADS_FROM_CALLS",
        payload: response.data.updatedLeads,
      });
      return response.data.message || "Leads updated successfully.";
    } catch (error) {
      console.error("Error updating leads:", error);
      throw new Error("Failed to update leads.");
    }
  };

  const updateLeadsFromInvoices = async (invoices) => {
    try {
      const response = await axios.post("/api/leads/updateFromInvoices", {
        invoices,
      });
      dispatch({
        type: "UPDATE_LEADS_FROM_INVOICES",
        payload: response.data.updatedLeads,
      });
      return response.data.message || "Leads updated successfully.";
    } catch (error) {
      console.error("Error updating leads:", error);
      throw new Error("Failed to update leads.");
    }
  };
  const searchLeads = async (query) => {
    try {
      const response = await axios.get(`/api/leads/search?query=${query}`);
      console.log(response.data);
      dispatch({ type: "GET_LEADS", payload: response.data.leads });
    } catch (error) {
      console.error("Error searching leads:", error);
    }
  };

  const getLeadsByAddDate = async (startDate, endDate) => {
    try {
      const response = await axios.get(
        `/api/leads/byAddDate?startDate=${startDate}&endDate=${endDate}`
      );
      dispatch({ type: "GET_LEADS", payload: response.data.leads });
    } catch (error) {
      console.error("Error fetching leads by add date:", error);
    }
  };
  // Toggle Freeze Status
  const toggleFreeze = async (leadId, freezeStatus) => {
    try {
      const response = await axios.put(`/api/leads/toggleFreeze/${leadId}`, {
        isFrozen: freezeStatus,
      });

      if (response.data.success) {
        dispatch({
          type: "TOGGLE_FREEZE",
          payload: { leadId, isFrozen: freezeStatus },
        });
      }
    } catch (error) {
      console.error("Error toggling freeze:", error);
    }
  };

  // Toggle Unfreeze Status
  const toggleUnfreeze = async (leadId) => {
    try {
      const response = await axios.put(`/api/leads/toggleUnfreeze/${leadId}`);

      if (response.data.success) {
        dispatch({
          type: "TOGGLE_UNFREEZE",
          payload: leadId,
        });
      }
    } catch (error) {
      console.error("Error unfreezing lead:", error);
    }
  };

  // Delete Lead
  const deleteLead = async (leadId) => {
    try {
      const response = await axios.delete(`/api/leads/${leadId}`);

      if (response.data.success) {
        dispatch({ type: "DELETE_LEAD", payload: leadId });
      }
    } catch (error) {
      console.error("Error deleting lead:", error);
    }
  };
  const getActiveLeads = async () => {
    try {
      const response = await axios.get("/api/leads/activeLeads");
      dispatch({ type: "GET_LEADS", payload: response.data.leads });
    } catch (error) {
      console.error("Error fetching active leads:", error);
    }
  };

  const getFrozenLeads = async () => {
    try {
      const response = await axios.get("/api/leads/frozenLeads");
      dispatch({ type: "GET_LEADS", payload: response.data.leads });
    } catch (error) {
      console.error("Error fetching frozen leads:", error);
    }
  };

  const getUnfrozenLeads = async () => {
    try {
      const response = await axios.get("/api/leads/unfrozenLeads");
      dispatch({ type: "GET_LEADS", payload: response.data.leads });
    } catch (error) {
      console.error("Error fetching unfrozen leads:", error);
    }
  };

  return (
    <LeadContext.Provider
      value={{
        activeLeads: state.activeLeads,
        frozenLeads: state.frozenLeads,
        unfrozenLeads: state.unfrozenLeads,
        uploadLeads,
        updateLeadsFromCalls,
        updateLeadsFromInvoices,
        searchLeads,
        getLeadsByAddDate,
        getActiveLeads,
        getFrozenLeads,
        getUnfrozenLeads,
        toggleFreeze,
        toggleUnfreeze,
        deleteLead,
      }}
    >
      {props.children}
    </LeadContext.Provider>
  );
};

export default LeadState;
