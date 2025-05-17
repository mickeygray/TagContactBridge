// src/components/common/Pagination.jsx
import React from "react";
import PropTypes from "prop-types";

/**
 * Renders simple Prev / Next controls plus a page indicator.
 *
 * @param {number}   currentPage   1-based index of current page
 * @param {number}   totalPages    total number of pages (>0)
 * @param {Function} onPageChange  (newPage) => void
 */
export default function Pagination({ currentPage, totalPages, onPageChange }) {
  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  return (
    <div className="flex items-center space-x-2 mb-4">
      <button
        className="btn btn-sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={prevDisabled}
      >
        Prev
      </button>
      <span className="text-sm">
        Page {currentPage} of {totalPages}
      </span>
      <button
        className="btn btn-sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={nextDisabled}
      >
        Next
      </button>
    </div>
  );
}

Pagination.propTypes = {
  currentPage: PropTypes.number.isRequired,
  totalPages: PropTypes.number.isRequired,
  onPageChange: PropTypes.func.isRequired,
};
