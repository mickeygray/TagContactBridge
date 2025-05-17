import React, { useContext } from "react";
import PropTypes from "prop-types";
import ClientAnalysisCard from "../../common/ClientAnalysisCard";
import ClientContext from "../../../context/client/clientContext";
import ScheduleContext from "../../../context/schedule/scheduleContext";
import MessageContext from "../../../context/message/messageContext";

export default function DailyClientAnalysisCard({ client }) {
  const { processReviewedSaleDateClient } = useContext(ClientContext);
  const { skipDailyClientProcessing, refreshDailyQueues } =
    useContext(ScheduleContext);
  const { showMessage, showError } = useContext(MessageContext);

  const actions = [
    { key: "partial", label: "Mark Partial", variant: "warning" },
    { key: "inactive", label: "Mark Inactive", variant: "danger" },
    { key: "delete", label: "Delete", variant: "danger" },
  ];

  const handleReview = async (c, action) => {
    try {
      await processReviewedSaleDateClient(c, action);
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

DailyClientAnalysisCard.propTypes = {
  client: PropTypes.shape({
    caseNumber: PropTypes.string.isRequired,
    // plus whatever else your generic card expects...
  }).isRequired,
};
