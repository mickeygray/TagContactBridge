import React, { useContext } from "react";
import ClientAnalysisCard from "../../common/ClientAnalysisCard";
import ClientContext from "../../../context/client/clientContext";
import ListContext from "../../../context/list/listContext";
import MessageContext from "../../../context/message/messageContext";

export default function UnifiedSaleClientAnalysisCard({ client }) {
  const { processReviewedSaleDateClient } = useContext(ClientContext);
  const { skipClient } = useContext(ListContext);
  const { showMessage, showError } = useContext(MessageContext);

  const actions = [
    { key: "scheduleDaily", label: "Add to Daily", variant: "primary" },
    { key: "partial", label: "Mark Partial", variant: "warning" },
    { key: "inactive", label: "Mark Inactive", variant: "danger" },
    { key: "delete", label: "Delete Client", variant: "danger" },
  ];

  const handleReview = async (client, action) => {
    try {
      await processReviewedSaleDateClient(client, action);
      skipClient(client);
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
        skipClient(client);
        showMessage("Client", `Removed ${client.caseNumber}`, 200);
      }}
    />
  );
}
