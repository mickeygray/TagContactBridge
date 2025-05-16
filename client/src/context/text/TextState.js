import React, { useReducer, useContext } from "react";
import TextContext from "./textContext";
import textReducer from "./textReducer";
import { useApi } from "../../utils/api";
import MessageContext from "../../context/message/messageContext";
import ScheduleContext from "../../context/schedule/scheduleContext";
const TextState = (props) => {
  const initialState = {
    sending: false,
    successMessage: null,
    errorMessage: null,
  };

  const [state, dispatch] = useReducer(textReducer, initialState);
  const { showMessage, showError } = useContext(MessageContext);
  const { refreshDailyQueues } = useContext(ScheduleContext);
  const api = useApi();
  api.defaults.withCredentials = true;

  /**
   * Send one or more text messages via backend
   * @param {Object} messagesPayload
   */
  const sendTextMessage = async (messagesPayload) => {
    if (!messagesPayload) {
      dispatch({
        type: "TEXT_ERROR",
        payload: "Missing message or recipient list.",
      });
      return;
    }

    dispatch({ type: "TEXT_SENDING" });
    try {
      const response = await api.post("/api/texts/send", { messagesPayload });
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
  const sendTextBatch = async (messagesPayload) => {
    try {
      const res = await api.post("/api/texts/daily", messagesPayload);
      showMessage("Texts", `Sent ${res.data.results.length} texts.`, 200);
      refreshDailyQueues();
      return res.data.results;
    } catch (err) {
      showError(
        "Texts",
        `Failed to send daily texts: ${err.message}`,
        err.response?.status
      );
      throw err;
    }
  };
  return (
    <TextContext.Provider
      value={{
        sending: state.sending,
        successMessage: state.successMessage,
        errorMessage: state.errorMessage,
        sendTextMessage,
        sendTextBatch,
      }}
    >
      {props.children}
    </TextContext.Provider>
  );
};

export default TextState;
