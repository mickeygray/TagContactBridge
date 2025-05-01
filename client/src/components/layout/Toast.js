import React from "react";

/**
 * A Toast popup with colored header bar and close button.
 * @param {{ title: string, message: string, error?: boolean, onClose: () => void }} props
 */
const Toast = ({ title, message, error = false, onClose }) => {
  // Container covers content below navbar
  const containerStyle = {
    position: "fixed",
    top: "60px", // beneath navbar
    left: "50%",
    transform: "translateX(-50%)",
    minWidth: "300px",
    border: "1px solid #ccc",
    borderRadius: "4px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
    zIndex: 1000,
    overflow: "hidden",
  };

  // Header bar color: red for error, blue for success
  const headerStyle = {
    backgroundColor: error ? "#dc3545" : "#007bff",
    color: "#fff",
    padding: "8px 12px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  };

  // Message content with gray background
  const contentStyle = {
    backgroundColor: "#f0f0f0",
    padding: "12px",
    color: "#333",
  };

  const closeButtonStyle = {
    background: "transparent",
    border: "none",
    color: "#fff",
    fontSize: "16px",
    cursor: "pointer",
    lineHeight: 1,
  };

  return (
    <div style={containerStyle} role="alert">
      <div style={headerStyle}>
        <span>
          {title} {error ? "Error" : "Success"}
        </span>
        <button style={closeButtonStyle} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div style={contentStyle}>{message}</div>
    </div>
  );
};

export default Toast;
