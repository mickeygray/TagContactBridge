// src/components/clientreview/NewCreateClientAnalysisCard.jsx
import React from "react";
import ClientAnalysisCard from "../../common/ClientAnalysisCard";
import { useList } from "../../../hooks/useList";
import { toast } from "../../../utils/toast";

export default function NewCreateClientAnalysisCard({ client }) {
  const { addCreateDateClients, skipClient } = useList();

  const actions = [{ key: "add", label: "Add to Period", variant: "primary" }];

  const handleReview = async (client, action) => {
    try {
      if (action === "add") {
        await addCreateDateClients([client]);
        toast.success("Client", `Added ${client.caseNumber}`);
      }
    } catch (err) {
      toast.error("Client", `Failed to ${action}: ${err.message}`);
    }
  };

  return (
    <ClientAnalysisCard
      client={client}
      actions={actions}
      onReview={handleReview}
      onSkip={() => {
        skipClient(client);
        toast.success("Client", `Removed ${client.caseNumber}`);
      }}
    />
  );
}
