import React, { useReducer } from "react";
import axios from "axios";
import ProspectContext from "./prospectContext";
import prospectReducer from "./prospectReducer";

const ProspectState = (props) => {
  const initialState = {
    prospects: [],
  };

  const [state, dispatch] = useReducer(prospectReducer, initialState);

  // Upload prospects function
  const uploadProspects = async (parsedData) => {
    try {
      console.log(parsedData);
      const response = await axios.post("/api/prospects/newProspects", {
        prospects: parsedData,
      });

      if (response.data.success) {
        dispatch({
          type: "UPLOAD_PROSPECTS",
          payload: response.data.newProspects,
        });
        return `Uploaded ${response.data.newProspects.length} new prospects.`;
      } else {
        throw new Error("Error uploading prospects.");
      }
    } catch (error) {
      console.error("Upload error:", error);
      throw new Error("Failed to upload prospects.");
    }
  };

  // Fetch all prospects
  const getProspects = async () => {
    try {
      const response = await axios.get("/api/prospects");
      dispatch({ type: "GET_PROSPECTS", payload: response.data.prospects });
    } catch (error) {
      console.error("Error fetching prospects:", error);
    }
  };

  // Update prospects based on call data
  const updateProspectsFromCalls = async (calls) => {
    try {
      const response = await axios.post("/api/prospects/updateFromCalls", {
        calls,
      });
      dispatch({
        type: "UPDATE_PROSPECTS_FROM_CALLS",
        payload: response.data.updatedProspects,
      });
      return response.data.message || "Prospects updated successfully.";
    } catch (error) {
      console.error("Error updating prospects:", error);
      throw new Error("Failed to update prospects.");
    }
  };
  const updateProspectsFromInvoices = async (invoices) => {
    try {
      const response = await axios.post("/api/prospects/updateFromInvoices", {
        invoices,
      });
      dispatch({
        type: "UPDATE_PROSPECTS_FROM_INVOICES",
        payload: response.data.remainingProspects,
      });
      return response.data.message || "Prospects updated successfully.";
    } catch (error) {
      console.error("Error updating prospects:", error);
      throw new Error("Failed to update prospects.");
    }
  };

  return (
    <ProspectContext.Provider
      value={{
        prospects: state.prospects,
        uploadProspects,
        updateProspectsFromCalls,
        updateProspectsFromInvoices,
        getProspects,
      }}
    >
      {props.children}
    </ProspectContext.Provider>
  );
};

export default ProspectState;
