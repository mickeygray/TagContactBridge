// src/components/clientreview/PeriodClientAnalysisCard.jsx
import React from "react";
import ClientAnalysisCard from "../../common/ClientAnalysisCard";
import { useClients } from "../../../hooks/useClients";
import { useList } from "../../../hooks/useList";
import { toast } from "../../../utils/toast";

export default function PeriodClientAnalysisCard({ client }) {
  const { processReviewedCreateDateClient } = useClients();
  const { skipClient } = useList();

  const actions = [
    { key: "schedulePeriod", label: "Add to Period", variant: "primary" },
    { key: "partial", label: "Mark Partial", variant: "warning" },
    { key: "inactive", label: "Mark Inactive", variant: "danger" },
  ];

  const handleReview = async (client, action) => {
    try {
      await processReviewedCreateDateClient(client, action);
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
