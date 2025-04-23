import React, { useState } from "react";

const CopyableItem = ({ value }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000); // Reset after 1s
    } catch (err) {
      console.error("Clipboard copy failed:", err);
    }
  };

  return (
    <span
      onClick={handleCopy}
      style={{
        padding: "6px 10px",
        border: "1px solid #ccc",
        borderRadius: "4px",
        backgroundColor: copied ? "#d1f7d6" : "#f9f9f9",
        cursor: "pointer",
        marginRight: "10px",
        userSelect: "none",
        fontSize: "0.9rem",
      }}
      title={copied ? "Copied!" : ""}
    >
      {value}
    </span>
  );
};

export default CopyableItem;
