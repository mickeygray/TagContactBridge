import React, { useReducer } from "react";
import axios from "axios";
import EmailContext from "./emailContext";
import emailReducer from "./emailReducer";

const EmailState = ({ children }) => {
  const initialState = {
    emailQueue: [], // List of emails to send
    sending: false,
    successMessage: null,
    errorMessage: null,
  };

  const [state, dispatch] = useReducer(emailReducer, initialState);

  // Prepare email data (for DropOrganizer)

  // Send emails
  const sendTaxAdEmails = async (emailPayload) => {
    dispatch({ type: "SENDING_EMAILS" });

    console.log(emailPayload);

    try {
      const response = await axios.post(
        "/api/emails/taxadvocate",
        emailPayload
      );
      dispatch({ type: "EMAILS_SENT", payload: response.data.message });
    } catch (error) {
      console.error("Error sending emails:", error);
      dispatch({ type: "EMAILS_ERROR", payload: "Failed to send emails." });
    }
  };

  const sendWynnEmails = async (emailPayload) => {
    dispatch({ type: "SENDING_EMAILS" });
    try {
      const response = await axios.post("/api/emails/wynn", emailPayload);
      dispatch({ type: "EMAILS_SENT", payload: response.data.message });
    } catch (error) {
      console.error("Error sending emails:", error);
      dispatch({ type: "EMAILS_ERROR", payload: "Failed to send emails." });
    }
  };

  const sendAmityEmails = async (emailPayload) => {
    dispatch({ type: "SENDING_EMAILS" });
    try {
      const response = await axios.post("/api/emails/amity", emailPayload);
      dispatch({ type: "EMAILS_SENT", payload: response.data.message });
    } catch (error) {
      console.error("Error sending emails:", error);
      dispatch({ type: "EMAILS_ERROR", payload: "Failed to send emails." });
    }
  };

  return (
    <EmailContext.Provider
      value={{
        emailQueue: state.emailQueue,
        sending: state.sending,
        successMessage: state.successMessage,
        errorMessage: state.errorMessage,
        sendWynnEmails,
        sendTaxAdEmails,
        sendAmityEmails,
      }}
    >
      {children}
    </EmailContext.Provider>
  );
};

export default EmailState;
