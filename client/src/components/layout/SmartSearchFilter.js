// SmartSearchFilter.jsx
import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";

const DATE_RANGES = [
  { key: "0-30", label: "≤ 30 days" },
  { key: "31-60", label: "31–60 days" },
  { key: "61-90", label: "61–90 days" },
  { key: "90+", label: "> 90 days" },
];

const FILTER_DEFS = [
  { key: "invoiceAge", label: "Last Invoice Age (days)" },
  { key: "invoiceAmount", label: "Last Invoice Amount ($)" },
  { key: "invoiceCount", label: "Invoice Count" },
  { key: "totalPayments", label: "Total Payments ($)" },
];

const COMPARATORS = [
  { value: "gte", label: "≥" },
  { value: "lte", label: "≤" },
  { value: "range", label: "Range" },
];

export default function SmartSearchFilter({ onChange }) {
  // State holds contactAge separately plus one object per other filter
  const [filters, setFilters] = useState({
    contactAge: "",
    invoiceAge: { enabled: false, comparator: "gte", from: "", to: "" },
    invoiceAmount: { enabled: false, comparator: "gte", from: "", to: "" },
    invoiceCount: { enabled: false, comparator: "gte", from: "", to: "" },
    totalPayments: { enabled: false, comparator: "gte", from: "", to: "" },
  });

  // Whenever filters change, build a payload and pass it up
  useEffect(() => {
    const payload = {};

    // 1️⃣ Contact age always included if set
    if (filters.contactAge) {
      payload.contactAge = filters.contactAge;
    }

    // 2️⃣ Loop through the others
    FILTER_DEFS.forEach(({ key }) => {
      const cfg = filters[key];
      if (!cfg.enabled) return;

      if (cfg.comparator === "gte") {
        payload[key] = { min: Number(cfg.from) };
      } else if (cfg.comparator === "lte") {
        payload[key] = { max: Number(cfg.from) };
      } else {
        payload[key] = {
          from: Number(cfg.from),
          to: Number(cfg.to),
        };
      }
    });

    onChange(payload);
  }, [filters, onChange]);

  // Handlers
  const toggleEnabled = (key) =>
    setFilters((f) => ({
      ...f,
      [key]: { ...f[key], enabled: !f[key].enabled },
    }));

  const changeComparator = (key, comp) =>
    setFilters((f) => ({
      ...f,
      [key]: { ...f[key], comparator: comp, from: "", to: "" },
    }));

  const changeValue = (key, field, value) => {
    if (!/^\d*$/.test(value)) return;
    setFilters((f) => ({
      ...f,
      [key]: { ...f[key], [field]: value },
    }));
  };

  const changeContactAge = (e) =>
    setFilters((f) => ({ ...f, contactAge: e.target.value }));

  // ----- Render -----
  return (
    <div className="smart-search-filter">
      {/* Contact Age: always visible */}
      <div className="filter-row">
        <label className="filter-label">Contact Age:</label>
        <select
          className="filter-select"
          value={filters.contactAge}
          onChange={changeContactAge}
        >
          <option value="">Any</option>
          {DATE_RANGES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {/* Other filters: checkbox + comparator + inputs */}
      {FILTER_DEFS.map(({ key, label }) => {
        const cfg = filters[key];
        return (
          <div key={key} className="filter-row">
            <input
              type="checkbox"
              checked={cfg.enabled}
              onChange={() => toggleEnabled(key)}
            />
            <label className="filter-label">{label}:</label>

            {cfg.enabled && (
              <>
                <select
                  className="filter-select"
                  value={cfg.comparator}
                  onChange={(e) => changeComparator(key, e.target.value)}
                >
                  {COMPARATORS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>

                {cfg.comparator === "range" ? (
                  <>
                    <input
                      type="text"
                      placeholder="Min"
                      className="filter-input"
                      value={cfg.from}
                      onChange={(e) => changeValue(key, "from", e.target.value)}
                    />
                    <span className="filter-dash">–</span>
                    <input
                      type="text"
                      placeholder="Max"
                      className="filter-input"
                      value={cfg.to}
                      onChange={(e) => changeValue(key, "to", e.target.value)}
                    />
                  </>
                ) : (
                  <input
                    type="text"
                    placeholder="Value"
                    className="filter-input"
                    value={cfg.from}
                    onChange={(e) => changeValue(key, "from", e.target.value)}
                  />
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

SmartSearchFilter.propTypes = {
  onChange: PropTypes.func.isRequired,
};
