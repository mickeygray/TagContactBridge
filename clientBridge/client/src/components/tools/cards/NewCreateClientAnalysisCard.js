// src/components/clientreview/NewCreateClientAnalysisCard.jsx
import React, { useContext } from "react";
import ClientAnalysisCard from "../../common/ClientAnalysisCard";
import ListContext from "../../../context/list/listContext";
import MessageContext from "../../../context/message/messageContext";

export default function NewCreateClientAnalysisCard({ client }) {
  const { addCreateDateClients } = useContext(ListContext);
  const { skipClient } = useContext(ListContext);
  const { showMessage, showError } = useContext(MessageContext);

  const actions = [{ key: "add", label: "Add to Period", variant: "primary" }];

  const handleReview = async (client, action) => {
    try {
      if (action === "add") {
        await addCreateDateClients([client]);
        showMessage("Client", `Added ${client.caseNumber}`, 200);
      }
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
