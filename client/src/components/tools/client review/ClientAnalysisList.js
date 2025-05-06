import React, { useState, useEffect } from "react";
import SingleClientCard from "./SingleClientCard";

const ITEMS_PER_PAGE = 9;

export default function ClientAnalysisList({
  title,
  toReview = [],
  textQueue = [],
  emailQueue = [],
  partial = [],
  verified = [],
  isDaily = false,
  activeQueue,
}) {
  const [view, setView] = useState(isDaily ? activeQueue : "review");
  const [currentPage, setCurrentPage] = useState(1);

  const lists = {
    review: toReview,
    partial,
    verified,
    text: textQueue,
    email: emailQueue,
  };
  useEffect(() => {
    if (isDaily) {
      setView(activeQueue);
    }
  }, [isDaily, activeQueue]);
  const sourceList = lists[view] || [];
  console.log(sourceList);
  // reset page when view changes
  useEffect(() => setCurrentPage(1), [view, isDaily]);

  const totalPages = Math.max(1, Math.ceil(sourceList.length / ITEMS_PER_PAGE));
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const visible = sourceList.slice(start, start + ITEMS_PER_PAGE);

  return (
    <div className="client-list-wrapper">
      {/* Title */}
      <h4 className="text-lg font-bold mb-2">{title}</h4>

      {/* Tabs (only in review mode) */}
      {!isDaily && (
        <div className="list-view-controls mb-4">
          <button
            className={`btn ${
              view === "review" ? "btn-danger" : "btn-outline"
            }`}
            onClick={() => setView("review")}
          >
            Review
          </button>
          <button
            className={`btn ml-2 ${
              view === "partial" ? "btn-warning" : "btn-outline"
            }`}
            onClick={() => setView("partial")}
          >
            Partial
          </button>
          <button
            className={`btn ml-2 ${
              view === "verified" ? "btn-primary" : "btn-outline"
            }`}
            onClick={() => setView("verified")}
          >
            Verified
          </button>
        </div>
      )}

      {/* Empty state */}
      {visible.length === 0 ? (
        <p className="info-text">No clients in this list.</p>
      ) : (
        <>
          {/* Pagination */}
          <div className="client-list-controls mb-4 flex items-center">
            <button
              className="btn btn-sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Prev
            </button>
            <span className="mx-2">
              Page {currentPage} of {totalPages}
            </span>
            <button
              className="btn btn-sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </button>
          </div>

          {/* Cards */}
          <div className="client-list-container grid grid-cols-1 md:grid-cols-3 gap-4">
            {visible.map((client) => (
              <SingleClientCard
                key={client._id || client.caseNumber}
                client={client}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
