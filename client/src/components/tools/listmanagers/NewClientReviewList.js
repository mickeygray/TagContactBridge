import React, { useContext } from "react";
import ListContext from "../../../context/list/listContext";
import MessageContext from "../../../context/message/messageContext";

/**
 * Card for a single flagged client, showing basic info and actions.
 */
export const NewClientReviewCard = ({ client }) => {
  console.log(client);
  const { addNewClientFromReviewList, removeReviewClient } =
    useContext(ListContext);
  const { showMessage, showError } = useContext(MessageContext);

  const handleAdd = async () => {
    try {
      const { reviewDates, reviewMessages, ...newClient } = client;
      newClient.status = "active";
      await addNewClientFromReviewList(newClient);
      showMessage(
        "New Client Review",
        `Client ${client.caseNumber} added successfully.`,
        200
      );
      removeReviewClient(client);
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      showError(
        "New Client Review",
        `Failed to add client ${client.caseNumber}: ${msg}`,
        status
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
          <strong>Email:</strong> {client.email}
        </p>
        <p>
          <strong>Cell:</strong> {client.cell}
        </p>
        <p>
          <strong>Domain:</strong>
          {client.domain}
        </p>

        {client.reviewMessages &&
          client.reviewMessages.map((m, i) => (
            <p>
              <strong>Reason {i + 1}:</strong> {m}
            </p>
          ))}
        <div className="card-actions">
          <button onClick={handleAdd} className="btn btn-sm btn-success">
            Add Anyway
          </button>
          <button
            onClick={() => removeReviewClient(client)}
            className="btn btn-sm btn-danger ml-2"
          >
            Dismiss
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
        <NewClientReviewCard key={client._id} client={client} />
      ))}
    </div>
  );
};

export default NewClientReviewList;
