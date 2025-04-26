import React, { useReducer } from "react";
import ListContext from "./listContext";
import listReducer from "./listReducer";
import axios from "axios";

const ListState = (props) => {
  const initialState = { filteredClients: [], reviewClients: [] };

  const [state, dispatch] = useReducer(listReducer, initialState);

  // 3️⃣ Remove from final list

  const postNCOAList = async (formattedData) => {
    try {
      const config = {
        headers: {
          "Content-Type": "application/json",
        },
      };

      const res = await axios.post(`/api/list/postNCOA`, formattedData, config);

      dispatch({ type: "POST_LEADS", payload: res.data });

      console.log("Lists posted successfully:", res.data);
      alert("All lists have been posted successfully!");
    } catch (error) {
      console.error(
        "Error posting lists:",
        error.response?.data || error.message
      );
    }
  };

  const buildPeriod = async (filters) => {
    try {
      const res = await axios.post("/api/buildPeriod", filters);
      dispatch({ type: "SET_FILTERED_CLIENTS", payload: res.data });
    } catch (err) {
      console.error("❌ Failed to fetch period contacts", err);
    }
  };

  const addCreateDateClients = async (clientsArray) => {
    try {
      const config = { headers: { "Content-Type": "application/json" } };
      const res = await axios.post(
        "/api/list/addCreateDateClients",
        { clients: clientsArray },
        config
      );
      dispatch({ type: "SET_CLIENT_LIST", payload: res.data });
      console.log("✅ Create-date clients saved:", res.data);
    } catch (error) {
      console.error(
        "❌ Error saving create-date clients:",
        error.response?.data || error.message
      );
    }
  };

  const fetchReviewClients = async () => {
    try {
      const res = await axios.get("/api/list/reviewClients");
      // expects the server to return clients sorted by reviewDate
      dispatch({ type: "SET_REVIEW_CLIENTS", payload: res.data });
    } catch (err) {
      console.error("❌ Failed to fetch review clients", err);
    }
  };
  return (
    <ListContext.Provider
      value={{
        filteredClients: state.filteredClients,
        buildPeriod,
        postNCOAList,
        fetchReviewClients,
        addCreateDateClients,
      }}
    >
      {props.children}
    </ListContext.Provider>
  );
};

export default ListState;
