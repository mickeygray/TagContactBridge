// CombinedClientCard.jsx
import React, { useState, useContext } from "react";
import ClientContext from "../../../context/client/clientContext";
import MessageContext from "../../../context/message/messageContext";
import ClientAnalysisCard from "./ClientAnalysisCard";

export default function CombinedClientCard({ client }) {
  const { runClientEnrichment, enrichedClient } = useContext(ClientContext);
  const { showMessage, showError } = useContext(MessageContext);

  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState(null);

  // “Add Anyway” callback

  // “Analyze” callback: fetch the full Logics data for this one client
  const handleAnalyze = async () => {
    runClientEnrichment(client);
    setDetails();
  };

  // If expanded & we have details, render the full analysis card:
  if (enrichedClient != null) {
    return (
      <ClientAnalysisCard
        client={enrichedClient}
        setExpandedIndex={() => setExpanded(false)}
      />
    );
  }

  // Otherwise render the simple “review” version with an Analyze button:
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

        {client.reviewMessage && (
          <p>
            <strong>Reason:</strong> {client.reviewMessage}
          </p>
        )}

        <div className="card-actions">
          <button
            onClick={handleAnalyze}
            className="btn btn-sm btn-info"
            disabled={loading}
          >
            {loading ? "Loading…" : "Analyze"}
          </button>
          <button className="btn btn-sm btn-success ml-2">Add Anyway</button>
          <button className="btn btn-sm btn-danger ml-2">Dismiss</button>
        </div>
      </div>
    </div>
  );
}
