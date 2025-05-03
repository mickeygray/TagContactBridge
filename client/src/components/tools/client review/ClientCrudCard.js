// CrudClientCard.jsx
import React, { useContext } from "react";
import ListContext from "../../../context/list/listContext";
import MessageContext from "../../../context/message/messageContext";

export default function CrudClientCard({ client, onAnalyze, periodInfo }) {
  const { addClientToPeriod, deleteClient, skipClient, updateClientStatus } =
    useContext(ListContext);
  const { showMessage, showError } = useContext(MessageContext);

  const handleAnalyze = () => {
    onAnalyze(client);
  };

  const handleAddToPeriod = async () => {
    try {
      await addClientToPeriod(client, periodInfo.id);
      skipClient(client);
      showMessage(
        "Period",
        `Added ${client.caseNumber} to the current period.`,
        200
      );
    } catch (err) {
      showError(
        "Period",
        `Failed to add ${client.caseNumber}: ${err.message}`,
        err.response?.status
      );
    }
  };

  const handleDelete = async () => {
    try {
      await deleteClient(client._id);
      skipClient(client);
      showMessage("Client", `Deleted client ${client.caseNumber}.`, 200);
    } catch (err) {
      showError(
        "Client",
        `Failed to delete ${client.caseNumber}: ${err.message}`,
        err.response?.status
      );
    }
  };

  const handleSkip = () => {
    skipClient(client._id);
    showMessage("Client", `Skipped client ${client.caseNumber}.`, 200);
  };

  const handleUpdateStatus = async (newStatus) => {
    try {
      await updateClientStatus(client._id, newStatus);
      skipClient(client);
      showMessage("Status", `Set ${client.caseNumber} to "${newStatus}".`, 200);
    } catch (err) {
      showError(
        "Status",
        `Failed to update status: ${err.message}`,
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

        {client.reviewMessages &&
          client.reviewMessages.map((m, i) => (
            <p>
              <strong>Reason {i + 1}:</strong> {m}
            </p>
          ))}

        <div className="card-actions">
          <button onClick={handleAnalyze} className="btn btn-sm btn-info">
            Analyze
          </button>
          <button
            onClick={handleAddToPeriod}
            className="btn btn-sm btn-primary ml-2"
          >
            Add to Period
          </button>
          <button
            onClick={() => handleUpdateStatus("partial")}
            className="btn btn-sm btn-warning ml-2"
          >
            Mark Partial
          </button>
          <button
            onClick={() => handleUpdateStatus("inactive")}
            className="btn btn-sm btn-danger ml-2"
          >
            Mark Inactive
          </button>
          <button
            onClick={handleSkip}
            className="btn btn-sm btn-secondary ml-2"
          >
            Skip
          </button>
          <button onClick={handleDelete} className="btn btn-sm btn-danger ml-2">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
