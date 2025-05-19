import React, { useContext } from "react";
import ClientAnalysisCard from "../../common/ClientAnalysisCard";
import ClientContext from "../../../context/client/clientContext";
import ScheduleContext from "../../../context/schedule/scheduleContext";
import MessageContext from "../../../context/message/messageContext";

export default function DailyCreateClientAnalysisCard({ client }) {
  const { processReviewedCreateDateClient } = useContext(ClientContext);
  const { skipDailyClientProcessing, refreshDailyQueues } =
    useContext(ScheduleContext);
  const { showMessage, showError } = useContext(MessageContext);

  const actions = [
    { key: "scheduleDaily", label: "Send Next Content", variant: "success" },
    { key: "partial", label: "Mark Partial", variant: "warning" },
    { key: "inactive", label: "Mark Inactive", variant: "danger" },
  ];

  const handleReview = async (c, action) => {
    try {
      await processReviewedCreateDateClient(c, action);
      showMessage("Client", `${action} applied to ${c.caseNumber}`, 200);
      await refreshDailyQueues();
    } catch (err) {
      showError(
        "Client",
        `Failed to ${action}: ${err.message}`,
        err.response?.status
      );
    }
  };

  const handleSkip = () => {
    processReviewedCreateDateClient(client, "removeFromQueue");
    skipDailyClientProcessing(client);

    showMessage("Client", `Skipped ${client.caseNumber} for today`, 200);
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
