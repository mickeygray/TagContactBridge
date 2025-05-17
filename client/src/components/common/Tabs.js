// src/components/common/Tabs.jsx
import React from "react";
import PropTypes from "prop-types";

/**
 * Renders a horizontal list of tab buttons.
 *
 * @param {Object[]} options        Array of { key, label } for each tab
 * @param {string}   activeKey      the currently selected tab key
 * @param {Function} onChange       (key) => void called when a tab is clicked
 */
export default function Tabs({ options, activeKey, onChange }) {
  return (
    <div className="flex space-x-2 mb-4">
      {options.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`btn btn-sm ${
            key === activeKey ? "btn-primary" : "btn-outline"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

Tabs.propTypes = {
  options: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    })
  ).isRequired,
  activeKey: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};
