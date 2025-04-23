import React from "react";
import ScheduleEntryItem from "./ScheduleEntryItem";

/**
 * Renders a review list of schedule entries (email or text cases).
 *
 * Props:
 * - list: Array of entry objects to display.
 */
const ScheduleReviewList = ({ list }) => {
  if (!list || list.length === 0) {
    return (
      <div className="panel">
        <p className="empty">No entries to review.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="schedule-entry-list">
        {list.map((entry) => (
          <ScheduleEntryItem
            key={entry._id || entry.caseNumber}
            entry={entry}
          />
        ))}
      </div>
    </div>
  );
};

export default ScheduleReviewList;
