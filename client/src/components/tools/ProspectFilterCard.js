import React, { useState, useContext, useEffect } from "react";
import ListContext from "../../context/list/listContext";
import ProspectExportTool from "./ProspectExportTool"; // ⬅️ Import the nested tool

const ProspectFilterCard = ({ prospects }) => {
  const { setFilteredProspects } = useContext(ListContext);
  const [hasCell, setHasCell] = useState(true);
  const [hasEmail, setHasEmail] = useState(true);
  const [createdAfter, setCreatedAfter] = useState("");
  const [modifiedAfter, setModifiedAfter] = useState("");
  const [filtered, setFiltered] = useState([]);

  const isValidEmail = (email) => {
    if (!email) return false;
    const clean = email.trim().toLowerCase();
    return clean.includes("@") && !clean.includes("tax");
  };

  const isValidPhone = (phone) => {
    if (!phone) return false;
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) return false;
    const areaCode = digits.slice(0, 3);
    return !/^([0-9])\1{2}$/.test(areaCode); // no 111, 222, etc.
  };

  const filterProspects = () => {
    const filteredList = prospects.filter((p) => {
      const hasValidCell = isValidPhone(p.Cell);
      const hasValidEmail = isValidEmail(p.Email);

      const createdDate = new Date(p.Date);
      const modifiedDate = new Date(p["Last Modified Date"]);

      const createdCheck = createdAfter
        ? new Date(createdAfter) <= createdDate
        : true;
      const modifiedCheck = modifiedAfter
        ? new Date(modifiedAfter) <= modifiedDate
        : true;

      return (
        (!hasCell || hasValidCell) &&
        (!hasEmail || hasValidEmail) &&
        createdCheck &&
        modifiedCheck
      );
    });

    setFiltered(filteredList);
    setFilteredProspects(filteredList);
  };

  useEffect(() => {
    if (prospects.length > 0) {
      filterProspects();
    }
    // eslint-disable-next-line
  }, [hasCell, hasEmail, createdAfter, modifiedAfter, prospects]);

  return (
    <div className="card mb-2">
      <h4 className="mb-1">🧹 Prospect Filters</h4>
      <div className="grid grid-cols-2 gap-2">
        <label>
          <input
            type="checkbox"
            checked={hasCell}
            onChange={() => setHasCell(!hasCell)}
          />
          Must Have Valid Cell
        </label>
        <label>
          <input
            type="checkbox"
            checked={hasEmail}
            onChange={() => setHasEmail(!hasEmail)}
          />
          Must Have Valid Email (No "tax")
        </label>
        <label>
          Created After:
          <input
            type="date"
            value={createdAfter}
            onChange={(e) => setCreatedAfter(e.target.value)}
          />
        </label>
        <label>
          Modified After:
          <input
            type="date"
            value={modifiedAfter}
            onChange={(e) => setModifiedAfter(e.target.value)}
          />
        </label>
      </div>

      {filtered.length > 0 && (
        <ProspectExportTool filteredProspects={filtered} />
      )}
    </div>
  );
};

export default ProspectFilterCard;
