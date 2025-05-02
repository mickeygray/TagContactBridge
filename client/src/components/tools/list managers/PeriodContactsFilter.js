import React, { useState, useContext } from "react";
import SmartSearchFilter from "../../layout/SmartSearchFilter";
import ListContext from "../../../context/list/listContext";
import ClientAnalysisList from "../client review/ClientAnalysisList";
const STAGE_OPTIONS = [
  { value: "update433a", label: "Update 433a" },
  { value: "penaltyAbatement", label: "Penalty Abatement" },
  { value: "taxOrganizer", label: "Tax Organizer" },
  { value: "taxDeadline", label: "Tax Deadline" },
  { value: "documentsSubmitted", label: "Documents Submitted" },
  { value: "filingDocuments", label: "Filing Documents" },
  { value: "irsContact", label: "IRS Contact" },
  { value: "irsGuidelines", label: "IRS Guidelines" },
];

export default function PeriodContactsFilter() {
  const { buildPeriod, toReview, partial, verified, periodInfo, clearPeriod } =
    useContext(ListContext);

  const [stage, setStage] = useState("");
  const [prospectReceived, setProspectReceived] = useState("");
  const [otherFilters, setOtherFilters] = useState({});

  const handleStageChange = (e) => {
    setStage(e.target.value);
    setProspectReceived("");
    setOtherFilters({});
  };

  const fetchPeriodContacts = () => {
    if (!stage) return;
    buildPeriod({
      stage,
      prospectReceived: prospectReceived === "yes",
      ...otherFilters,
    });
  };

  return (
    <div className="card">
      <h3>Create A New Campaign Period</h3>

      {/* Stage selector */}
      <div className="form-group">
        <label htmlFor="stage-select">Stage:</label>
        <select
          id="stage-select"
          className="form-control"
          value={stage}
          onChange={handleStageChange}
        >
          <option value="">– Select Stage –</option>
          {STAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Radios + Smart filters only after stage */}
      {stage && (
        <>
          <div className="inline-group">
            <span className="inline-label">Has Received This Content?</span>
            <label>
              <input
                type="radio"
                name="prospectReceived"
                value="yes"
                checked={prospectReceived === "yes"}
                onChange={(e) => setProspectReceived(e.target.value)}
              />{" "}
              Yes
            </label>
            <label>
              <input
                type="radio"
                name="prospectReceived"
                value="no"
                checked={prospectReceived === "no"}
                onChange={(e) => setProspectReceived(e.target.value)}
              />{" "}
              No
            </label>
          </div>

          <SmartSearchFilter onChange={setOtherFilters} />
        </>
      )}

      <button
        className="btn btn-primary mt-3"
        disabled={!stage}
        onClick={fetchPeriodContacts}
      >
        Apply Filters
      </button>
      <button
        className="btn btn-danger mt-3"
        disabled={!periodInfo}
        onClick={() => clearPeriod()}
      >
        Period Analysis Complete
      </button>
      <div>
        <br />
        <br />
        {periodInfo !== null && (
          <ClientAnalysisList
            periodInfo={periodInfo}
            verified={verified}
            partial={partial}
            toReview={toReview}
          />
        )}
      </div>
    </div>
  );
}
