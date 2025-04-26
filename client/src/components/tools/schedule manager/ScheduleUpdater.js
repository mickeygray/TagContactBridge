import React, { useState } from "react";

/**
 * ScheduleUpdater
 *
 * Props:
 * - dailySchedule: { date, pace, textQueue, emailQueue, ... }
 * - periodContacts: Array of contact objects
 * - updateDailySchedule: function(updatedFields)
 * - rebuildPeriodContacts: function() // to trigger back-end rebuild
 */
const ScheduleUpdater = ({
  dailySchedule = {},
  periodContacts = [],
  updateDailySchedule,
  rebuildPeriodContacts,
}) => {
  const [pace, setPace] = useState(dailySchedule.pace || 15);
  const [isUpdating, setIsUpdating] = useState(false);

  const handlePaceChange = (e) => {
    setPace(parseInt(e.target.value, 10));
  };

  const handleSavePace = async () => {
    setIsUpdating(true);
    try {
      await updateDailySchedule({ pace });
      // Optionally show success message
    } catch (err) {
      console.error("Error updating pace:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRebuild = async () => {
    // Trigger back-end process to refresh PeriodContacts
    if (typeof rebuildPeriodContacts === "function") {
      try {
        await rebuildPeriodContacts();
      } catch (err) {
        console.error("Error rebuilding period contacts:", err);
      }
    }
  };

  return (
    <div className="schedule-updater">
      {/* DailySchedule Controls */}
      <div className="card mb-4">
        <h3>Daily Schedule Settings</h3>
        <label>
          Pace (texts per batch):{" "}
          <input
            type="number"
            min="1"
            value={pace}
            onChange={handlePaceChange}
          />
        </label>
        <button
          className="btn btn-primary ml-2"
          onClick={handleSavePace}
          disabled={isUpdating}
        >
          {isUpdating ? "Saving..." : "Save Pace"}
        </button>
      </div>

      {/* PeriodContacts Controls */}
      <div className="card">
        <h3>Period Contacts Management</h3>
        <p>Total contacts in current period: {periodContacts.length}</p>
        <button className="btn btn-secondary" onClick={handleRebuild}>
          Rebuild Period Contacts
        </button>
      </div>
    </div>
  );
};

export default ScheduleUpdater;
