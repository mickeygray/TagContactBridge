import React, { useContext, useState, useEffect } from "react";
import ListContext from "../../../context/list/listContext";
import ClientContext from "../../../context/client/clientContext";
import ClientAnalysisCard from "./ClientAnalysisCard";

const CARDS_PER_PAGE = 9;

const getTierColor = (status) => {
  if (/TIER 1/i.test(status)) return "tier-1";
  if (/TIER 2/i.test(status)) return "tier-2";
  if (/TIER 3/i.test(status)) return "tier-3";
  if (/TIER 4/i.test(status)) return "tier-4";
  return "tier-unknown";
};

const ClientAnalysisList = () => {
  const {
    reviewClients,
    textQueue,
    emailQueue,
    fetchReviewClients,
    fetchTextQueue,
    fetchEmailQueue,
  } = useContext(ListContext);
  const { runClientEnrichment } = useContext(ClientContext);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [view, setView] = useState("review");

  // Fetch initial data based on view
  useEffect(() => {
    if (view === "review") fetchReviewClients();
    else if (view === "text") fetchTextQueue();
    else if (view === "email") fetchEmailQueue();
  }, [view]);

  // Determine list based on selected view
  const sourceList =
    view === "review"
      ? reviewClients
      : view === "text"
      ? textQueue
      : emailQueue;

  if (!sourceList || sourceList.length === 0) {
    return <p className="info-text">No clients in this list.</p>;
  }

  // Sort by reviewDate if review view, otherwise keep order
  const sortedClients =
    view === "review"
      ? [...sourceList].sort((a, b) => {
          const da = a.reviewDate ? new Date(a.reviewDate) : new Date(0);
          const db = b.reviewDate ? new Date(b.reviewDate) : new Date(0);
          return da - db;
        })
      : sourceList;

  // Pagination
  const startIdx = (currentPage - 1) * CARDS_PER_PAGE;
  const visibleClients = sortedClients.slice(
    startIdx,
    startIdx + CARDS_PER_PAGE
  );
  const totalPages = Math.ceil(sortedClients.length / CARDS_PER_PAGE);

  const handleExpand = (index) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const handleEnrichment = (sourceList) => {
    runClientEnrichment(sourceList);
  };

  return (
    <div className="client-list-wrapper">
      <div className="list-view-controls">
        <button
          className={view === "review" ? "active" : ""}
          onClick={() => {
            setView("review");
            setCurrentPage(1);
          }}
        >
          Review Clients
        </button>
        <button
          className={view === "text" ? "active" : ""}
          onClick={() => {
            setView("text");
            setCurrentPage(1);
          }}
        >
          Text Queue
        </button>
        <button
          className={view === "email" ? "active" : ""}
          onClick={() => {
            setView("email");
            setCurrentPage(1);
          }}
        >
          Email Queue
        </button>
        <button className="btn btn-primary" onClick={handleEnrichment}>
          Run Client Analysis
        </button>
      </div>

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

      <div className="client-list-container">
        {visibleClients.map((client, idx) => {
          const globalIndex = startIdx + idx;
          const isExpanded = expandedIndex === globalIndex;
          const tierClass = getTierColor(client.status);

          return (
            <div key={client._id} className="client-entry">
              <div className={`client-bar ${tierClass}`}>
                <span>{client.name || client.caseNumber}</span>
                <button onClick={() => handleExpand(globalIndex)}>
                  {isExpanded ? "➖" : "➕"}
                </button>
              </div>
              {isExpanded && (
                <div className="modal-card">
                  <ClientAnalysisCard
                    client={client}
                    setExpandedIndex={setExpandedIndex}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ClientAnalysisList;
