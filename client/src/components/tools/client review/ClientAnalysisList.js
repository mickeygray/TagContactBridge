// ClientAnalysisList.jsx
import React, { useState, useEffect } from "react";
import SingleClientCard from "./SingleClientCard";

const ITEMS_PER_PAGE = 9;

export default function ClientAnalysisList({
  toReview = [],
  partial = [],
  verified = [],
  periodInfo,
}) {
  const [view, setView] = useState("review");
  const [currentPage, setCurrentPage] = useState(1);

  const lists = { review: toReview, partial, verified };
  const sourceList = lists[view];

  // whenever we switch tabs, reset pagination
  useEffect(() => {
    setCurrentPage(1);
  }, [view]);

  const totalPages = Math.max(1, Math.ceil(sourceList.length / ITEMS_PER_PAGE));
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const visible = sourceList.slice(start, start + ITEMS_PER_PAGE);

  return (
    <div className="client-list-wrapper">
      {/* View selector */}
      <div className="list-view-controls">
        <button className="btn btn-danger" onClick={() => setView("review")}>
          Review Clients
        </button>
        <button className="btn btn-warning" onClick={() => setView("partial")}>
          Partial Clients
        </button>
        <button className="btn btn-primary" onClick={() => setView("verified")}>
          Verified Clients
        </button>
      </div>

      {/* Empty state */}
      {visible.length === 0 ? (
        <p className="info-text">No clients in this list.</p>
      ) : (
        <>
          {/* Pagination */}
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

          {/* Cards */}
          <div className="client-list-container">
            {visible.map((client) => (
              <SingleClientCard
                key={client._id}
                client={client}
                periodInfo={periodInfo}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
