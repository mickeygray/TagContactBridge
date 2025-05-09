import React, { useState, useCallback } from "react";
import Papa from "papaparse";
import FileAppendItem from "./FileAppendItem"; // You'll create this component next

const LexisAppendList = () => {
  const [lexisList, setLexisList] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50); // or 25, customizable later
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = lexisList.slice(indexOfFirstItem, indexOfLastItem);
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (event) => {
      const cleanedText = event.target.result
        .replace(/\u0000/g, "")
        .replace(/\r/g, "")
        .replace(/" +/g, '"')
        .replace(/"/g, "")
        .trim();

      Papa.parse(cleanedText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const normalizeKeys = (entry) => {
            const cleaned = {};
            for (const key in entry) {
              if (key) {
                const newKey = key.replace(/\s+/g, " ").trim();
                cleaned[newKey] =
                  typeof entry[key] === "string"
                    ? entry[key].trim()
                    : entry[key];
              }
            }
            return cleaned;
          };

          const cleanedData = results.data.map(normalizeKeys);

          const filtered = cleanedData.filter(
            (entry) =>
              entry["First Name"] && entry["Last Name"] && entry["Case #"]
          );

          setLexisList(filtered);
        },
        error: (error) => {
          console.error("❌ PapaParse Error:", error);
        },
      });
    };

    reader.readAsText(file);
  };

  const handleFileRemove = useCallback((caseID) => {
    setLexisList((prevList) =>
      prevList.map((item) =>
        item["Case #"] === caseID ? { ...item, file: null } : item
      )
    );
  }, []);

  return (
    <div className="card">
      <div className="pagination-controls">
        <button
          onClick={() => setCurrentPage(currentPage - 1)}
          disabled={currentPage === 1}
        >
          ◀ Prev
        </button>
        <span>Page {currentPage}</span>
        <button
          onClick={() => setCurrentPage(currentPage + 1)}
          disabled={indexOfLastItem >= lexisList.length}
        >
          Next ▶
        </button>
      </div>
      <h3>📂 Lexis Address Match Tool</h3>
      <input type="file" accept=".csv" onChange={handleFileUpload} />

      {lexisList.length > 0 && (
        <div className="append-list">
          {currentItems.map((entry, index) => (
            <FileAppendItem
              key={index}
              record={entry}
              onFileRemove={handleFileRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default LexisAppendList;
