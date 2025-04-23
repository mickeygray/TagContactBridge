import React, { useState } from "react";

const CollapsibleNote = ({ act }) => {
  const [isOpen, setIsOpen] = useState(false);

  const stripHTML = (html) =>
    html ? html.replace(/<[^>]*>?/gm, "").replace(/\n/g, " ") : "";

  return (
    <div className="note-entry">
      <p
        className="note-subject"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{ cursor: "pointer", fontWeight: "bold", color: "#2c3e50" }}
      >
        {isOpen ? "▼" : "▶"} {act.Subject}
      </p>

      {isOpen && (
        <div className="note-content">
          <p className="note-date">
            {new Date(act.CreatedDate).toLocaleString()}
          </p>
          <p className="note-body">{stripHTML(act.Comment)}</p>
          <hr />
        </div>
      )}
    </div>
  );
};

export default CollapsibleNote;
