import React, { useReducer } from "react";
import ListContext from "./listContext";
import listReducer from "./listReducer";
import axios from "axios";
const ListState = (props) => {
  const initialState = {
    finalClientList: null,
    finalProspectList: null,
    contactList: [],
    clients: [],
  };

  const [state, dispatch] = useReducer(listReducer, initialState);
  const setFinalProspectList = (list) => {
    dispatch({ type: "SET_FINAL_PROSPECT_LIST", payload: list });
  };
  const postZeroInvoice = async (caseID) => {
    try {
      const res = await axios.post("/api/list/zeroInvoice", { caseID });
      console.log("✅ Zero invoice posted:", res.data);
    } catch (err) {
      console.error("❌ Error posting zero invoice:", err);
    }
  };

  // 2️⃣ Store client to contact list
  const addToContactList = (client) => {
    dispatch({ type: "ADD_CONTACT_CLIENT", payload: client });
  };

  // 3️⃣ Remove from final list
  const removeFromFinalClientList = (client) => {
    dispatch({ type: "REMOVE_FROM_FINAL_CLIENT_LIST", payload: client });
  };
  const postList = async (formattedData) => {
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

  const postWynnList = async (formattedData) => {
    try {
      const config = {
        headers: {
          "Content-Type": "application/json",
        },
      };

      const res = await axios.post(`/api/list/postWynn`, formattedData, config);

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
  const runClientEnrichment = async (clientList) => {
    try {
      const res = await axios.post(
        "/api/list/enrichClients",
        { clientList },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      dispatch({
        type: "SET_CLIENT_LIST",
        payload: res.data.enrichedClients, // should be an array of enriched clients
      });

      console.log("✅ Enriched Clients Received:", res.data);
    } catch (error) {
      console.error(
        "❌ Error enriching clients:",
        error.response?.data || error.message
      );
      alert(
        "There was an error enriching the clients. Please try again later."
      );
    }
  };

  const postContactList = async (contactList) => {
    console.log(contactList);
    const res = await axios.post(
      "/api/list/addClients",
      { contactList },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    dispatch({
      type: "SAVE_CONTACT_LIST",
      payload: res.data, // should be an array of enriched clients
    });
  };

  const getClientCreatedTodayList = async () => {
    const res = await axios.get("/api/list/clients-today", {
      headers: {
        "Content-Type": "application/json",
      },
    });
    dispatch({
      type: "GET_CLIENT_LIST",
      payload: res.data, // should be an array of enriched clients
    });
  };
  return (
    <ListContext.Provider
      value={{
        finalClientList: state.finalClientList,
        finalProspectList: state.finalProspectList,
        contactList: state.contactList,
        clients: state.clients,
        setFinalProspectList,
        runClientEnrichment,
        getClientCreatedTodayList,
        postZeroInvoice,
        removeFromFinalClientList,
        addToContactList,
        postWynnList,
        postContactList,
        postList,
      }}
    >
      {props.children}
    </ListContext.Provider>
  );
};

export default ListState;
