import React, { useState } from "react";
import ClientAnalysisCard from "../../common/ClientAnalysisCard";
import { useClients } from "../../../hooks/useClients";
import { useDailySchedule } from "../../../hooks/useDailySchedule";
import { toast } from "../../../utils/toast";

export default function DailySalesClientAnalysisCard({ client }) {
  const { processReviewedSaleDateClient } = useClients();
  const { skipDailyClientProcessing, refreshDailyQueues } = useDailySchedule();

  // Simple state to prevent double-clicking
  const [isProcessing, setIsProcessing] = useState(false);

  const actions = [
    { key: "scheduleDaily", label: "Send Next Content", variant: "success" },
    { key: "f433a", label: "Send POA Email", variant: "warning" },
    { key: "delay", label: "Delay 60 Days", variant: "danger" },
  ];

  const handleReview = async (c, action) => {
    if (isProcessing) return; // Prevent double-click

    setIsProcessing(true);

    try {
      await processReviewedSaleDateClient(c, action);
      skipDailyClientProcessing(c);
      toast.success("Client", `${action} applied to ${c.caseNumber}`);

      // Only refresh if you have this method, otherwise remove this line
      if (refreshDailyQueues) {
        await refreshDailyQueues();
      }
    } catch (err) {
      toast.error("Client", `Failed to ${action}: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSkip = () => {
    if (isProcessing) return;

    processReviewedSaleDateClient(client, "removeFromQueue");
    skipDailyClientProcessing(client);
    toast.success("Client", `Skipped ${client.caseNumber} for today`);
  };

  return (
    <ClientAnalysisCard
      client={client}
      actions={actions}
      onReview={handleReview}
      onSkip={handleSkip}
    />
  );
}
