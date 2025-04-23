import React, { useState, useContext, useEffect } from "react";
import ListContext from "../../context/list/listContext";

const ProspectExportTool = ({ filteredProspects }) => {
  const { setExportList } = useContext(ListContext);
  const [channel, setChannel] = useState("");
  const [includeName, setIncludeName] = useState(true);
  const [includeEmail, setIncludeEmail] = useState(true);
  const [includeCell, setIncludeCell] = useState(true);
  const [finalList, setFinalList] = useState([]);

  useEffect(() => {
    if (!filteredProspects || filteredProspects.length === 0) return;
    const output = filteredProspects.map((p) => {
      const entry = {};
      if (includeName) entry.name = p.Name || "";
      if (includeEmail) entry.email = p.Email || "";
      if (includeCell) entry.cell = p.Cell || p.Home || p["Work Phone"] || "";
      return entry;
    });
    setFinalList(output);
  }, [filteredProspects, includeName, includeEmail, includeCell]);

  const handlePush = () => {
    if (!channel || finalList.length === 0) return;
    setExportList({ channel, list: finalList });
    alert(`📤 ${finalList.length} prospects exported to ${channel}`);
  };

  return (
    <div className="card mt-2">
      <h3>📋 Export Filtered Prospects</h3>

      <label className="block mb-1">Select Channel:</label>
      <select
        value={channel}
        onChange={(e) => setChannel(e.target.value)}
        className="mb-2"
      >
        <option value="">-- Choose --</option>
        <option value="email">Email</option>
        <option value="text">Text</option>
        <option value="dial">Dial</option>
      </select>

      <div className="mb-2">
        <label className="block">Include Fields:</label>
        <label>
          <input
            type="checkbox"
            checked={includeName}
            onChange={() => setIncludeName(!includeName)}
          />
          Name
        </label>
        <label className="ml-2">
          <input
            type="checkbox"
            checked={includeEmail}
            onChange={() => setIncludeEmail(!includeEmail)}
          />
          Email
        </label>
        <label className="ml-2">
          <input
            type="checkbox"
            checked={includeCell}
            onChange={() => setIncludeCell(!includeCell)}
          />
          Phone
        </label>
      </div>

      <button className="btn" onClick={handlePush}>
        Export List
      </button>
    </div>
  );
};

export default ProspectExportTool;
