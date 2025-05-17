// src/components/tools/cards/NewSaleClientAnalysisCard.jsx
import React, { useContext } from "react";
import PropTypes from "prop-types";
import ClientAnalysisCard from "../../common/ClientAnalysisCard";
import ClientContext from "../../../context/client/clientContext";
import MessageContext from "../../../context/message/messageContext";

export default function NewSaleClientAnalysisCard({ client, onHide }) {
  const { processReviewedSaleDateClient } = useContext(ClientContext);
  const { showMessage, showError } = useContext(MessageContext);

  // these are the buttons we want to show when a new client is flagged
  const actions = [
    { key: "prac", label: "Re-send Prac Email", variant: "primary" },
    { key: "433a", label: "Send 433(a) Email", variant: "primary" },
    { key: "delay", label: "Delay 60 days", variant: "warning" },
    { key: "partial", label: "Mark Partial", variant: "warning" },
    { key: "inactive", label: "Mark Inactive", variant: "danger" },
    { key: "delete", label: "Delete", variant: "danger" },
  ];

  const handleReview = async (c, action) => {
    try {
      await processReviewedSaleDateClient(c, action);
      showMessage("Client", `${action} applied to ${c.caseNumber}`, 200);
      // after a delete or delay you probably want to hide the review card
      if (["delete", "delay"].includes(action)) {
        onHide();
      }
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      showError("Client", `Failed to ${action}: ${msg}`, status);
    }
  };

  return (
    <div className="mb-6">
      {/* a little “hide” button in the top‐right */}
      <div className="flex justify-end mb-2">
        <button onClick={onHide} className="btn btn-sm btn-outline">
          Hide
        </button>
      </div>

      <ClientAnalysisCard
        client={client}
        actions={actions}
        onReview={handleReview}
        // no “skip” here—Hide is enough
      />
    </div>
  );
}

NewSaleClientAnalysisCard.propTypes = {
  client: PropTypes.object.isRequired,
  onHide: PropTypes.func.isRequired,
};
