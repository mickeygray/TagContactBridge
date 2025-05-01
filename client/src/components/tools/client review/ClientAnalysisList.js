// ClientAnalysisList.jsx
import React, { useState, useEffect } from "react";
import CombinedClientCard from "./CombinedClientCard";

const ITEMS_PER_PAGE = 9;

const statusClass = (status) => {
  switch (status) {
    case "active":
      return "tier-1";
    case "partial":
      return "tier-2";
    case "inReview":
      return "tier-3";
    default:
      return "tier-unknown";
  }
};

export default function ClientAnalysisList({ toReview, partial, verified }) {
  const [view, setView] = useState("review");
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);

  // Map our three buckets onto keys
  const lists = {
    review: toReview || [],
    partial: partial || [],
    verified: verified || [],
  };

  const sourceList = lists[view];

  // Reset page & collapse whenever we switch lists
  useEffect(() => {
    setCurrentPage(1);
    setExpandedId(null);
  }, [view]);

  const totalPages = Math.max(1, Math.ceil(sourceList.length / ITEMS_PER_PAGE));
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const visible = sourceList.slice(start, start + ITEMS_PER_PAGE);

  return (
    <div className="client-list-wrapper">
      {/* View selector */}
      <div className="list-view-controls">
        <button
          className={view === "review" ? "active" : ""}
          onClick={() => setView("review")}
        >
          Review Clients
        </button>
        <button
          className={view === "partial" ? "active" : ""}
          onClick={() => setView("partial")}
        >
          Partial Clients
        </button>
        <button
          className={view === "verified" ? "active" : ""}
          onClick={() => setView("verified")}
        >
          Verified Clients
        </button>
      </div>

      {/* Empty state */}
      {sourceList.length === 0 ? (
        <p className="info-text">No clients in this list.</p>
      ) : (
        <>
          {/* Pagination controls */}
          <div className="client-list-controls">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Prev
            </button>
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </button>
          </div>

          {/* Card grid */}
          <div className="client-list-container">
            {visible.map((client) => {
              const isOpen = expandedId === client._id;
              return (
                <div key={client._id} className="client-entry">
                  <div className={`client-bar ${statusClass(client.status)}`}>
                    <span>{client.name || client.caseNumber}</span>
                    <button
                      onClick={() => setExpandedId(isOpen ? null : client._id)}
                    >
                      {isOpen ? "➖" : "➕"}
                    </button>
                  </div>
                  {isOpen && (
                    <div className="analysis-card-wrapper">
                      <CombinedClientCard
                        client={client}
                        close={() => setExpandedId(null)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
