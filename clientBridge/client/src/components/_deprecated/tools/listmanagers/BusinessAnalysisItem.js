import React, { useState } from "react";
import CopyableItem from "../../layout/CopyableItem";
// Utility to copy to clipboard

const BusinessAnalysisItem = ({ entry, onCleaned }) => {
  // Track selected (keep) state for each array field
  const [selected, setSelected] = useState({
    businessConnections: (entry.businessConnections || []).map(() => false),
    possibleEmployers: (entry.possibleEmployers || []).map(() => false),
    professionalLicenses: (entry.professionalLicenses || []).map(() => false),
    phones: (entry.phones || []).map(() => false),
    emails: (entry.emails || []).map(() => false),
  });

  console.log(entry);

  const handleToggle = (field, idx) => {
    setSelected((prev) => ({
      ...prev,
      [field]: prev[field].map((checked, i) =>
        i === idx ? !checked : checked
      ),
    }));
  };

  // Cleaned up entry, filtered to just checked items
  const getCleanedEntry = () => ({
    ...entry,
    businessConnections: (entry.businessConnections || []).filter(
      (_, i) => selected.businessConnections[i]
    ),
    possibleEmployers: (entry.possibleEmployers || []).filter(
      (_, i) => selected.possibleEmployers[i]
    ),
    professionalLicenses: (entry.professionalLicenses || []).filter(
      (_, i) => selected.professionalLicenses[i]
    ),
    phones: (entry.phones || []).filter((_, i) => selected.phones[i]),
    emails: (entry.emails || []).filter((_, i) => selected.emails[i]),
  });

  return (
    <div className="business-analysis-card">
      <div className="business-analysis-header">
        <span style={{ fontWeight: 600, color: "#888" }}>Name:</span>
        <div>{entry["First Name"] + " " + entry["Last Name"]}</div>

        <span style={{ fontWeight: 600, color: "#888" }}>LexID:</span>
        <CopyableItem value={entry.lexID || ""} />
        <span style={{ fontWeight: 600, color: "#888" }}>Case#:</span>
        <CopyableItem value={entry.caseNumber || ""} />
        <span className="business-analysis-name">{entry.name}</span>
      </div>
      <div className="business-analysis-grid">
        {/* Business Connections */}
        <div className="business-analysis-section">
          <div className="business-analysis-section-title">
            Business Connections
          </div>
          <div className="checkbox-list">
            {(entry.businessConnections || []).length === 0 && (
              <div style={{ color: "#bbb" }}>None</div>
            )}
            {(entry.businessConnections || []).map((biz, i) => (
              <label className="checkbox-label" key={i}>
                <input
                  type="checkbox"
                  checked={selected.businessConnections[i]}
                  onChange={() => handleToggle("businessConnections", i)}
                />{" "}
                <span>
                  {biz.name || ""}
                  {biz.role && (
                    <span style={{ color: "#2b7a78" }}> ({biz.role})</span>
                  )}
                  {/* show other fields as needed */}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Possible Employers */}
        <div className="business-analysis-section">
          <div className="business-analysis-section-title">
            Possible Employers
          </div>
          <div className="checkbox-list">
            {(entry.possibleEmployers || []).length === 0 && (
              <div style={{ color: "#bbb" }}>None</div>
            )}
            {(entry.possibleEmployers || []).map((emp, i) => (
              <label className="checkbox-label" key={i}>
                <input
                  type="checkbox"
                  checked={selected.possibleEmployers[i]}
                  onChange={() => handleToggle("possibleEmployers", i)}
                />{" "}
                <span>{emp.name || ""}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Professional Licenses */}
        <div className="business-analysis-section">
          <div className="business-analysis-section-title">
            Professional Licenses
          </div>
          <div className="checkbox-list">
            {(entry.professionalLicenses || []).length === 0 && (
              <div style={{ color: "#bbb" }}>None</div>
            )}
            {(entry.professionalLicenses || []).map((lic, i) => (
              <label className="checkbox-label" key={i}>
                <input
                  type="checkbox"
                  checked={selected.professionalLicenses[i]}
                  onChange={() => handleToggle("professionalLicenses", i)}
                />{" "}
                <span>
                  {lic.type || ""}
                  {lic.number && (
                    <span style={{ color: "#003366" }}> ({lic.number})</span>
                  )}
                  {/* show other fields as needed */}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Phones */}
        <div className="business-analysis-section">
          <div className="business-analysis-section-title">Phones</div>
          <div className="checkbox-list">
            {(entry.phones || []).length === 0 && (
              <div style={{ color: "#bbb" }}>None</div>
            )}
            {(entry.phones || []).map((phone, i) => (
              <label className="checkbox-label" key={i}>
                <input
                  type="checkbox"
                  checked={selected.phones[i]}
                  onChange={() => handleToggle("phones", i)}
                />{" "}
                {phone}
              </label>
            ))}
          </div>
        </div>

        {/* Emails */}
        <div className="business-analysis-section">
          <div className="business-analysis-section-title">Emails</div>
          <div className="checkbox-list">
            {(entry.emails || []).length === 0 && (
              <div style={{ color: "#bbb" }}>None</div>
            )}
            {(entry.emails || []).map((email, i) => (
              <label className="checkbox-label" key={i}>
                <input
                  type="checkbox"
                  checked={selected.emails[i]}
                  onChange={() => handleToggle("emails", i)}
                />{" "}
                {email}
              </label>
            ))}
          </div>
        </div>
      </div>
      <button
        className="business-clean-btn"
        onClick={() => onCleaned(getCleanedEntry())}
      >
        Create Cleaned Business Entry
      </button>
    </div>
  );
};

export default BusinessAnalysisItem;
