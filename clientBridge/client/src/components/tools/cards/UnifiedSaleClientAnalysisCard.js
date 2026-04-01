import React from "react";
import ClientAnalysisCard from "../../common/ClientAnalysisCard";
import { useClients } from "../../../hooks/useClients";
import { useList } from "../../../hooks/useList";
import { toast } from "../../../utils/toast";

export default function UnifiedSaleClientAnalysisCard({ client }) {
  const { processReviewedSaleDateClient } = useClients();
  const { skipClient } = useList();

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
      toast.success("Client", `${action} applied to ${client.caseNumber}`);
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
