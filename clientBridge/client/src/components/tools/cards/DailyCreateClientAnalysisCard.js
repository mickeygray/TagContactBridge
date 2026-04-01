import React from "react";
import ClientAnalysisCard from "../../common/ClientAnalysisCard";
import { useClients } from "../../../hooks/useClients";
import { useDailySchedule } from "../../../hooks/useDailySchedule";
import { toast } from "../../../utils/toast";

export default function DailyCreateClientAnalysisCard({ client }) {
  const { processReviewedCreateDateClient } = useClients();
  const { skipDailyClientProcessing, refreshDailyQueues } = useDailySchedule();

  const actions = [
    { key: "scheduleDaily", label: "Send Next Content", variant: "success" },
    { key: "partial", label: "Mark Partial", variant: "warning" },
    { key: "inactive", label: "Mark Inactive", variant: "danger" },
  ];

  const handleReview = async (c, action) => {
    try {
      await processReviewedCreateDateClient(c, action);
      toast.success("Client", `${action} applied to ${c.caseNumber}`);
      await refreshDailyQueues();
    } catch (err) {
      toast.error("Client", `Failed to ${action}: ${err.message}`);
    }
  };

  const handleSkip = () => {
    processReviewedCreateDateClient(client, "removeFromQueue");
    skipDailyClientProcessing(client);

    toast.success("Client", `Skipped ${client.caseNumber} for today`);
    refreshDailyQueues();
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
