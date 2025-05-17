// src/components/tools/listManagers/PeriodContactsFilter.jsx

import React, { useState, useContext } from "react";
import ListContext from "../../../context/list/listContext";
import PeriodClientAnalysisList from "../lists/PeriodClientAnalysisList";

const STAGE_OPTIONS = [
  { value: "update433a", label: "Update 433(a)" },
  { value: "penaltyAbatement", label: "Penalty Abatement" },
  { value: "taxOrganizer", label: "Tax Organizer" },
  { value: "taxDeadline", label: "Tax Deadline" },
  { value: "documentsSubmitted", label: "Documents Submitted" },
  { value: "filingDocuments", label: "Filing Documents" },
  { value: "irsContact", label: "IRS Contact" },
  { value: "irsGuidelines", label: "IRS Guidelines" },
];

export default function PeriodContactsFilter() {
  const { buildPeriod, periodInfo, clearPeriod } = useContext(ListContext);
  const [stage, setStage] = useState("");

  const fetchPeriodContacts = () => {
    if (!stage) return;
    buildPeriod({ stage });
  };

  return (
    <div className="card p-4">
      <h3 className="text-xl font-semibold mb-4">
        📊 Create A New Campaign Period
      </h3>

      {/* Stage selector */}
      <div className="mb-4">
        <label className="block font-medium mb-1">Stage:</label>
        <select
          className="input w-full"
          value={stage}
          onChange={(e) => setStage(e.target.value)}
        >
          <option value="">– Select Stage –</option>
          {STAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Static rule summary */}
      {stage && (
        <div className="bg-gray-50 p-3 rounded mb-4 text-sm text-gray-800">
          <p className="font-medium mb-1">Current inclusion rules:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>No zero-invoice clients</li>
            <li>Last invoice between –2 000 and 50 000 (inclusive)</li>
            <li>No new invoices in the past 60 days</li>
            <li>Has not completed this stage’s content</li>
          </ul>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={fetchPeriodContacts}
          disabled={!stage}
          className="btn btn-primary"
        >
          Apply Filters
        </button>
        <button
          onClick={clearPeriod}
          disabled={!periodInfo}
          className="btn btn-danger"
        >
          Period Analysis Complete
        </button>
      </div>

      {/* Results */}
      {periodInfo && <PeriodClientAnalysisList />}
    </div>
  );
}
