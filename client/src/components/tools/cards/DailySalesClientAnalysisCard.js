import React, { useContext, useState } from "react";
import ClientAnalysisCard from "../../common/ClientAnalysisCard";
import ClientContext from "../../../context/client/clientContext";
import ScheduleContext from "../../../context/schedule/scheduleContext";
import MessageContext from "../../../context/message/messageContext";

export default function DailySalesClientAnalysisCard({ client }) {
  const { processReviewedSaleDateClient } = useContext(ClientContext);
  const { skipDailyClientProcessing, refreshDailyQueues } =
    useContext(ScheduleContext);
  const { showMessage, showError } = useContext(MessageContext);

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
      showMessage("Client", `${action} applied to ${c.caseNumber}`, 200);

      // Only refresh if you have this method, otherwise remove this line
      if (refreshDailyQueues) {
        await refreshDailyQueues();
      }
    } catch (err) {
      showError(
        "Client",
        `Failed to ${action}: ${err.message}`,
        err.response?.status
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSkip = () => {
    if (isProcessing) return;

    processReviewedSaleDateClient(client, "removeFromQueue");
    skipDailyClientProcessing(client);
    showMessage("Client", `Skipped ${client.caseNumber} for today`, 200);
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
