import React, { useContext } from "react";
import ClientContext from "../../../context/client/clientContext";
import ListContext from "../../../context/list/listContext";
import MessageContext from "../../../context/message/messageContext";

export const NewClientReviewCard = ({ client }) => {
  const { processReviewedClient } = useContext(ClientContext);
  const { skipClient } = useContext(ListContext);
  const { showMessage, showError } = useContext(MessageContext);

  const handleReview = async (client, action) => {
    try {
      await processReviewedClient(client, action, "clientState");
      showMessage("Client", `${action} applied to ${client.caseNumber}`, 200);
      // remove from this review list
      skipClient(client.caseNumber);
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      showError("Client", `Failed to ${action}: ${msg}`, status);
    }
  };

  const handleSkip = () => {
    // same as “dismiss” — just remove from review list
    skipClient(client.caseNumber);
    showMessage("Client", `Dismissed ${client.caseNumber}`, 200);
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
            onClick={() => handleReview(client, "add")}
            className="btn btn-sm btn-success"
          >
            Add Anyway
          </button>
          <button
            onClick={handleSkip}
            className="btn btn-sm btn-secondary ml-2"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * List of flagged clients to review, rendered below the file reader.
 */
const NewClientReviewList = () => {
  const { reviewClients } = useContext(ListContext);

  if (!reviewClients || reviewClients.length === 0) {
    return null;
  }
  console.log(reviewClients);
  return (
    <div className="mt-4">
      <h4>⚠️ Clients Needing Review</h4>
      {reviewClients.map((client) => (
        <NewClientReviewCard key={client.caseNumber} client={client} />
      ))}
    </div>
  );
};

export default NewClientReviewList;
