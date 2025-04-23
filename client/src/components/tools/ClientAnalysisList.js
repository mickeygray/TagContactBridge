import React, { useContext, useState } from "react";
import ListContext from "../../context/list/listContext";
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
    finalClientList,
    addToContactList,
    removeFromFinalClientList,
    postContactList,
    contactList,
  } = useContext(ListContext);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedIndex, setExpandedIndex] = useState(null);

  if (!finalClientList || finalClientList.length === 0) {
    return <p className="info-text">No clients to review.</p>;
  }

  const startIdx = (currentPage - 1) * CARDS_PER_PAGE;
  const endIdx = startIdx + CARDS_PER_PAGE;
  const visibleClients = finalClientList.slice(startIdx, endIdx);
  const totalPages = Math.ceil(finalClientList.length / CARDS_PER_PAGE);

  const handleExpand = (index) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <div className="client-list-wrapper">
      <div className="client-list-controls">
        <button
          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
        >
          Prev
        </button>
        <span>
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
        >
          Next
        </button>
      </div>

      <div className="client-list-container">
        {visibleClients.map((client, index) => {
          const globalIndex = startIdx + index;
          const isExpanded = expandedIndex === globalIndex;
          const status = client.Status || "";
          const cardClass = `client-bar ${getTierColor(status)}`;

          return (
            <div key={globalIndex} className="client-entry">
              <div className={cardClass}>
                <span>{client.Name || client["Case #"]}</span>
                <span className="action-icons">
                  <button
                    onClick={() => {
                      addToContactList(client);
                      removeFromFinalClientList(client);
                    }}
                  >
                    ✔️
                  </button>
                  <button onClick={() => removeFromFinalClientList(client)}>
                    ❌
                  </button>
                  <button onClick={() => handleExpand(globalIndex)}>
                    {isExpanded ? "➖" : "➕"}
                  </button>
                </span>
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
