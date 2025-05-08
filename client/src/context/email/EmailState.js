import React, { useReducer, useContext } from "react";
import EmailContext from "./emailContext";
import emailReducer from "./emailReducer";
import { useApi } from "../../utils/api";
import MessageContext from "../../context/message/messageContext";
const EmailState = ({ children }) => {
  const initialState = {
    emailQueue: [], // List of emails to send
    sending: false,
    successMessage: null,
    errorMessage: null,
    stats: null, // Autodrop statistics
    // templates: [],      // Uncomment when template CRUD is enabled
  };

  const [state, dispatch] = useReducer(emailReducer, initialState);
  const api = useApi();
  api.defaults.withCredentials = true;
  const { showMessage, showError } = useContext(MessageContext);
  /**
   * Send email drop for a given domain
   * @param {string} domain (e.g. 'taxadvocate', 'wynn', 'amity')
   * @param {Object} payload
   */
  const sendEmails = async (domain, emailPayload) => {
    dispatch({ type: "SENDING_EMAILS" });
    try {
      const response = await api.post(`/api/emails/${domain}`, emailPayload);
      dispatch({ type: "EMAILS_SENT", payload: response.data.message });
    } catch (error) {
      console.error("Error sending emails:", error);
      dispatch({ type: "EMAILS_ERROR", payload: "Failed to send emails." });
    }
  };

  // Legacy helpers (optional)
  // const sendTaxAdEmails = (payload) => sendEmails('taxadvocate', payload);
  // const sendWynnEmails  = (payload) => sendEmails('wynn', payload);
  // const sendAmityEmails = (payload) => sendEmails('amity', payload);

  /**
   * Fetch autodrop email queue statistics
   */
  const fetchEmailStats = async () => {
    dispatch({ type: "EMAIL_STATS_LOADING" });
    try {
      const res = await api.get("/api/emails/stats");
      dispatch({ type: "SET_EMAIL_STATS", payload: res.data });
    } catch (error) {
      console.error("Error fetching email stats:", error);
      dispatch({ type: "EMAIL_STATS_ERROR", payload: "Failed to load stats." });
    }
  };

  /**
   * TEMPLATE CRUD (commented out until enabled)
   */
  // const createTemplate = async (templateData) => {
  //   dispatch({ type: 'TEMPLATE_LOADING' });
  //   const res = await api.post('/api/emails/templates', templateData);
  //   dispatch({ type: 'ADD_TEMPLATE', payload: res.data });
  // };
  // const getTemplates = async () => {
  //   dispatch({ type: 'TEMPLATE_LOADING' });
  //   const res = await api.get('/api/emails/templates');
  //   dispatch({ type: 'SET_TEMPLATES', payload: res.data });
  // };
  // const updateTemplate = async (id, data) => {
  //   const res = await api.put(`/api/emails/templates/${id}`, data);
  //   dispatch({ type: 'UPDATE_TEMPLATE', payload: res.data });
  // };
  // const deleteTemplate = async (id) => {
  //   await api.delete(`/api/emails/templates/${id}`);
  //   dispatch({ type: 'DELETE_TEMPLATE', payload: id });
  // };
  // const previewTemplate = async (id, context) => {
  //   const res = await api.post(`/api/emails/templates/${id}/preview`, context);
  //   return res.data; // HTML or text preview
  // };
  const sendEmailBatch = async (emailQueue) => {
    try {
      const res = await api.post("/api/emails/daily", emailQueue);
      showMessage("Emails", `Sent ${res.data.results.length} emails.`, 200);
      // refresh so UI reflects that those have been removed

      return res.data.results;
    } catch (err) {
      showError(
        "Emails",
        `Failed to send daily emails: ${err.message}`,
        err.response?.status
      );
      throw err;
    }
  };
  return (
    <EmailContext.Provider
      value={{
        emailQueue: state.emailQueue,
        sending: state.sending,
        successMessage: state.successMessage,
        errorMessage: state.errorMessage,
        stats: state.stats,
        sendEmails,
        sendEmailBatch,
        fetchEmailStats,
        // Template CRUD:
        // createTemplate,
        // getTemplates,
        // updateTemplate,
        // deleteTemplate,
        // previewTemplate,
      }}
    >
      {children}
    </EmailContext.Provider>
  );
};

export default EmailState;
