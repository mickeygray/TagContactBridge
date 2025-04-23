import React, { useState, useEffect, useContext } from "react";
import ScheduleContext from "../../context/schedule/scheduleContext";
import ClientAnalysisCard from "../client/ClientAnalysisCard"; // adjust path as needed
import axios from "axios";

const STATUS_OPTIONS = [
  "active",
  "partial",
  "adserv",
  "inactive",
  "inReview",
  "delinquent",
];

const ScheduleEntryItem = ({ entry }) => {
  const { updateScheduledClient, deleteScheduledClient } =
    useContext(ScheduleContext);

  const [isExpanded, setIsExpanded] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [formState, setFormState] = useState({
    status: entry.status || "active",
    reviewDate: entry.reviewDate ? entry.reviewDate.split("T")[0] : "",
  });

  const handleToggle = () => {
    setIsExpanded(!isExpanded);

    if (!isExpanded && !analysisData) {
      // fetch analysis on first expand
      fetchAnalysis();
    }
  };

  const fetchAnalysis = async () => {
    setLoadingAnalysis(true);
    try {
      const res = await axios.get(`/api/schedule/analysis/${entry.caseNumber}`);
      setAnalysisData(res.data);
    } catch (err) {
      console.error(
        `Error fetching analysis for case ${entry.caseNumber}:`,
        err
      );
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleUpdate = () => {
    const updatePayload = {
      status: formState.status,
      reviewDate: formState.reviewDate,
    };
    updateScheduledClient(entry._id, updatePayload);
    setIsExpanded(false);
  };

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to remove this client?")) {
      deleteScheduledClient(entry._id);
    }
  };

  return (
    <div className={`schedule-entry ${isExpanded ? "expanded" : "collapsed"}`}>
      <div className="entry-header" onClick={handleToggle}>
        <strong>{entry.name}</strong> — Case #{entry.caseNumber}
      </div>

      {isExpanded && (
        <div className="entry-details">
          {/* Analysis Section */}
          <h4>Client Analysis</h4>
          {loadingAnalysis ? (
            <p>Loading details…</p>
          ) : analysisData ? (
            <ClientAnalysisCard
              client={analysisData}
              setExpandedIndex={() => {}}
            />
          ) : (
            <p>No analysis available.</p>
          )}

          {/* Status & Review Date Form */}
          <div className="mt-3">
            <label>
              Status:{" "}
              <select
                name="status"
                value={formState.status}
                onChange={handleChange}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            <label className="ml-3">
              Review Date:{" "}
              <input
                type="date"
                name="reviewDate"
                value={formState.reviewDate}
                onChange={handleChange}
              />
            </label>
          </div>

          {/* Action Buttons */}
          <div className="mt-3 flex gap-2">
            <button className="btn-save" onClick={handleUpdate}>
              💾 Save
            </button>
            <button className="btn-delete" onClick={handleDelete}>
              ❌ Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleEntryItem;
