// CrudClientCard.jsx
import React, { useContext } from "react";
import ClientContext from "../../../context/client/clientContext";
import ScheduleContext from "../../../context/schedule/scheduleContext";
import ListContext from "../../../context/list/listContext";
import MessageContext from "../../../context/message/messageContext";

export default function CrudClientCard({ client, onAnalyze, isDaily }) {
  const { processReviewedClient } = useContext(ClientContext);
  const { skipDailyClientProcessing, refreshDailyQueues } =
    useContext(ScheduleContext);
  const { removeClientFromUploadList } = useContext(ListContext);
  const { showMessage, showError } = useContext(MessageContext);

  const handleSkip = () => {
    if (isDaily) {
      skipDailyClientProcessing(client);
      showMessage("Client", `Skipped for today: ${client.caseNumber}`, 200);
      // after skip, refresh the daily list
      refreshDailyQueues();
    } else {
      removeClientFromUploadList(client);
      showMessage("Client", `Won’t add: ${client.caseNumber}`, 200);
    }
  };

  const handleReview = async (action, label) => {
    try {
      await processReviewedClient(client, action);
      showMessage("Client", `${label} applied to ${client.caseNumber}`, 200);
      // immediately refresh daily schedule if in daily mode
      if (isDaily) {
        await refreshDailyQueues();
      }
    } catch (err) {
      showError(
        "Client",
        `Failed to ${label}: ${err.message}`,
        err.response?.status
      );
    }
  };

  return (
    <div className="card review-card mb-2">
      <div className="card-body">
        <h5 className="card-title">{client.name || client.caseNumber}</h5>
        <p>
          <strong>Case #:</strong> {client.caseNumber}
        </p>
        <p>
          <strong>Email:</strong> {client.email || "N/A"}
        </p>
        <p>
          <strong>Cell:</strong> {client.cell || "N/A"}
        </p>
        <p>
          <strong>Domain:</strong> {client.domain}
        </p>

        {client.reviewMessages?.map((m, i) => (
          <p key={i}>
            <strong>Reason {i + 1}:</strong> {m}
          </p>
        ))}

        <div className="card-actions">
          <button
            onClick={() => onAnalyze(client)}
            className="btn btn-sm btn-info"
          >
            Analyze
          </button>

          <button
            onClick={() => handleReview("addToPeriod", "Add to Period")}
            className="btn btn-sm btn-primary ml-2"
          >
            Add to Period
          </button>
          <button
            onClick={() => handleReview("partial", "Mark Partial")}
            className="btn btn-sm btn-warning ml-2"
          >
            Mark Partial
          </button>
          <button
            onClick={() => handleReview("inactive", "Mark Inactive")}
            className="btn btn-sm btn-danger ml-2"
          >
            Mark Inactive
          </button>
          <button
            onClick={() => handleReview("delete", "Delete")}
            className="btn btn-sm btn-danger ml-2"
          >
            Delete
          </button>

          <button
            onClick={handleSkip}
            className="btn btn-sm btn-secondary ml-2"
          >
            {isDaily ? "Skip Today" : "Do Not Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
