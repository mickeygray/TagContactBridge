// src/components/clientreview/PeriodClientAnalysisCard.jsx
import React, { useContext } from "react";
import ClientAnalysisCard from "../../common/ClientAnalysisCard";
import ClientContext from "../../../context/client/clientContext";
import ListContext from "../../../context/list/listContext";
import MessageContext from "../../../context/message/messageContext";

export default function PeriodClientAnalysisCard({ client }) {
  const { processReviewedCreateDateClient } = useContext(ClientContext);
  const { skipClient } = useContext(ListContext);
  const { showMessage, showError } = useContext(MessageContext);

  const actions = [
    { key: "add", label: "Add to Period", variant: "primary" },
    { key: "partial", label: "Mark Partial", variant: "warning" },
    { key: "inactive", label: "Mark Inactive", variant: "danger" },
    { key: "delete", label: "Delete", variant: "danger" },
  ];

  const handleReview = async (client, action) => {
    try {
      await processReviewedCreateDateClient(client, action);
      showMessage("Client", `${action} applied to ${client.caseNumber}`, 200);
    } catch (err) {
      showError(
        "Client",
        `Failed to ${action}: ${err.message}`,
        err.response?.status
      );
    }
  };

  return (
    <ClientAnalysisCard
      client={client}
      actions={actions}
      onReview={handleReview}
      onSkip={() => {
        skipClient(client.caseNumber);
        showMessage("Client", `Removed ${client.caseNumber}`, 200);
      }}
    />
  );
}
