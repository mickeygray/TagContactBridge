import React, { useState, useContext } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import ListContext from "../../../context/list/listContext";

const LogicsFileReader = () => {
  const [clients, setClients] = useState([]);
  const [error, setError] = useState("");
  const { addCreateDateClients } = useContext(ListContext);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ({ target }) => {
      const cleanedText = target.result
        .replace(/\u0000/g, "")
        .replace(/\r/g, "")
        .replace(/" +/g, '"')
        .replace(/"/g, "")
        .trim();

      Papa.parse(cleanedText, {
        header: true,
        skipEmptyLines: true,
        complete: ({ data }) => {
          // normalize keys
          const normalized = data.map((row) => {
            const cleanRow = {};
            Object.keys(row).forEach((k) => {
              const nk = k.replace(/\s+/g, " ").trim();
              cleanRow[nk] =
                typeof row[k] === "string" ? row[k].trim() : row[k];
            });
            return cleanRow;
          });
          splitByStatus(normalized);
        },
        error: (err) => {
          console.error(err);
          setError("Failed to parse CSV");
        },
      });
    };
    reader.readAsText(file);
  };

  const splitByStatus = (rows) => {
    const filtered = rows.filter((r) => {
      const st = r.Status || "";
      return !/Non-Collectible|Bad\/Inactive|Suspended|Settled|TIER 5/i.test(
        st
      );
    });
    setClients(filtered);
  };

  const exportToCSV = () => {
    const ws = XLSX.utils.json_to_sheet(clients);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clients");
    const d = new Date();
    const filename = `${
      d.getMonth() + 1
    }-${d.getDate()}-${d.getFullYear()} Clients.csv`;
    XLSX.writeFile(wb, filename, { bookType: "csv" });
  };

  return (
    <div className="card">
      <h3>📂 Logics File Splitter</h3>
      {error && <p className="text-danger">{error}</p>}
      <input
        type="file"
        accept=".csv"
        onChange={handleFileUpload}
        className="mb-2"
      />

      <button onClick={exportToCSV} className="btn btn-primary">
        Download Client List CSV
      </button>
      <button
        onClick={() => addCreateDateClients(clients)}
        className="btn btn-primary ml-2"
      >
        Save Client List
      </button>
    </div>
  );
};

export default LogicsFileReader;
