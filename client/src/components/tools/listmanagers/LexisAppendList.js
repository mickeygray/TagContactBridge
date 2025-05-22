import React, { useState, useCallback, useContext } from "react";
import Papa from "papaparse";
import FileAppendItem from "./FileAppendItem";
import ListContext from "../../../context/list/listContext";
import useLexisData from "../../../hooks/useLexisData";
import { CSVLink } from "react-csv";

const LexisAppendList = () => {
  const [lexisList, setLexisList] = useState([]);
  const [parsedLiens, setParsedLiens] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [csvData, setCsvData] = useState([]);
  const [parsedMap, setParsedMap] = useState({});
  const itemsPerPage = 50;
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = lexisList.slice(indexOfFirstItem, indexOfLastItem);

  const { buildLienList, validatedLiens } = useContext(ListContext);
  const { buildCSVData } = useLexisData();

  const handleLeadExtracted = (caseID, parsedLead) => {
    const newLead = {
      ...parsedLead,
      "Case #": caseID,
    };

    setParsedLiens((prev) => [
      ...prev.filter((lead) => lead["Case #"] !== caseID),
      newLead,
    ]);

    setParsedMap((prev) => ({
      ...prev,
      [caseID]: true,
    }));

    setTimeout(() => {
      setParsedMap((prev) => ({
        ...prev,
        [caseID]: false,
      }));
    }, 3000);
  };

  const handleRunDNC = async () => {
    if (parsedLiens.length === 0) return;
    await buildLienList(parsedLiens);
  };

  const handlePrepareCSV = () => {
    const data = buildCSVData(validatedLiens);
    setCsvData(data);
  };

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
      prevList.filter((item) => item["Case #"] !== caseID)
    );
  }, []);
  return (
    <div className="card">
      <div className="pagination-controls">
        <button
          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
          disabled={currentPage === 1}
        >
          ◀ Prev
        </button>
        <span>Page {currentPage}</span>
        <button
          onClick={() =>
            setCurrentPage((prev) =>
              indexOfLastItem >= lexisList.length ? prev : prev + 1
            )
          }
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
              isParsed={parsedMap[entry["Case #"]]}
              onFileRemove={handleFileRemove}
              onLeadExtracted={handleLeadExtracted}
            />
          ))}
        </div>
      )}

      {validatedLiens.length === 0 && parsedLiens.length > 0 && (
        <button onClick={handleRunDNC} style={{ marginTop: "20px" }}>
          🧹 Run DNC Scrub
        </button>
      )}

      {validatedLiens.length > 0 && (
        <>
          <button
            className=" btn btn-success"
            onClick={handlePrepareCSV}
            style={{ marginTop: "20px" }}
          >
            📤 Prepare CSV
          </button>
          {"      "}
          {csvData.length > 0 && (
            <CSVLink data={csvData} filename="validated_liens.csv">
              <button className=" btn btn-primary">⬇ Download CSV</button>
            </CSVLink>
          )}
        </>
      )}
    </div>
  );
};

export default LexisAppendList;
