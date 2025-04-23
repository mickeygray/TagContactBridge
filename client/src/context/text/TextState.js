import React, { useReducer } from "react";
import axios from "axios";
import TextContext from "./textContext";
import textReducer from "./textReducer";

const TextState = (props) => {
  const initialState = {};

  const [state, dispatch] = useReducer(textReducer, initialState);

  const sendTextMessage = async (messagesPayload) => {
    if (!messagesPayload) {
      dispatch({
        type: "TEXT_ERROR",
        payload: "Missing message or recipient list.",
      });
      return;
    }

    console.log(messagesPayload);

    try {
      const response = await axios.post("/api/messages/", { messagesPayload });

      dispatch({ type: "TEXT_SENT", payload: response.data.message });

      console.log("✅ Text messages sent successfully:", response.data);
    } catch (error) {
      console.error("❌ Failed to send text messages:", error);
      dispatch({
        type: "TEXT_ERROR",
        payload: "Failed to send text messages.",
      });
    }
  };

  return (
    <TextContext.Provider
      value={{
        sendTextMessage,
      }}
    >
      {props.children}
    </TextContext.Provider>
  );
};

export default TextState;
