import React, { useState, useCallback } from "react";
import Papa from "papaparse";
import FileAppendItem from "./FileAppendItem";
import useLexisData from "../../../hooks/useLexisData";
import { CSVLink } from "react-csv";

const LexisAppendList = () => {
  // State to hold all parsed leads (ALL go here)
  const [lienList, setLienList] = useState([]);
  // State to hold only parsed leads that are business owners
  const [businessList, setBusinessList] = useState([]);
  // Used for download and pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = lienList.slice(indexOfFirstItem, indexOfLastItem);

  // Import the correct builder functions
  const {
    parseLexisRecord,
    buildBusinessContactList,
    buildDialerList,
    buildSummaryText,
  } = useLexisData();

  // Called after file drop & parse in FileAppendItem
  const handleLeadExtracted = (caseNumber, parsedLead) => {
    // Always update lienList
    setLienList((prev) => [
      ...prev.filter((l) => l.caseNumber !== caseNumber),
      { ...parsedLead, caseNumber },
    ]);
    // Only update businessList if business owner
    if (parsedLead.isBusinessOwner) {
      setBusinessList((prev) => [
        ...prev.filter((l) => l.caseNumber !== caseNumber),
        { ...parsedLead, caseNumber },
      ]);
    }
  };

  // Parse CSV and add to state (will trigger FileAppendItem drop zone for each)
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();

    reader.onload = (event) => {
      const cleanedText = event.target.result
        .replace(/\u0000/g, "")
        .replace(/\r/g, "");
      Papa.parse(cleanedText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          // Normalize fields/keys
          const cleanedData = results.data.map((entry) => {
            const cleaned = {};
            for (const key in entry) {
              if (key) {
                let newKey = key.replace(/\s+/g, " ").trim();
                if (newKey === "Case #") newKey = "caseNumber";
                cleaned[newKey] =
                  typeof entry[key] === "string"
                    ? entry[key].trim()
                    : entry[key];
              }
            }
            return cleaned;
          });
          setLienList(cleanedData); // this is your CSV table, will render FileAppendItems
        },
      });
    };
    reader.readAsText(file);
  };

  // Remove file/lead by caseNumber from both lists
  const handleFileRemove = useCallback((caseNumber) => {
    setLienList((prev) =>
      prev.filter((item) => item.caseNumber !== caseNumber)
    );
    setBusinessList((prev) =>
      prev.filter((item) => item.caseNumber !== caseNumber)
    );
  }, []);

  // For downloads
  const dialerCSV = buildDialerList(lienList);
  const businessCSV = buildBusinessContactList(businessList);

  // Summaries for all parsed leads (could also just use lienList or businessList)
  const handleExportSummaries = () => {
    if (!lienList.length) return;
    const allSummaries = lienList
      .map(buildSummaryText)
      .join("\n\n" + "=".repeat(50) + "\n\n");
    const blob = new Blob([allSummaries], {
      type: "text/plain;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `client_summaries_${
      new Date().toISOString().split("T")[0]
    }.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

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
              indexOfLastItem >= lienList.length ? prev : prev + 1
            )
          }
          disabled={indexOfLastItem >= lienList.length}
        >
          Next ▶
        </button>
      </div>

      <h3>📂 Lexis Address Match Tool</h3>
      <input type="file" accept=".csv" onChange={handleFileUpload} />

      {/* FileAppendItem: after CSV upload, lets user drop the TXT and parseLexisRecord it */}
      {lienList.length > 0 && (
        <div className="append-list">
          {currentItems.map((entry, index) => (
            <FileAppendItem
              key={entry.caseNumber || index}
              record={entry}
              isParsed={!!entry.isParsed}
              onFileRemove={handleFileRemove}
              onLeadExtracted={handleLeadExtracted}
            />
          ))}
        </div>
      )}

      {/* Download buttons */}
      <div style={{ marginTop: 32 }}>
        <CSVLink data={dialerCSV} filename="dialer_list.csv">
          <button className="btn btn-primary">⬇ Download Dialer CSV</button>
        </CSVLink>
        <CSVLink data={businessCSV} filename="business_contacts.csv">
          <button className="btn btn-secondary" style={{ marginLeft: 12 }}>
            ⬇ Download Business Contacts CSV
          </button>
        </CSVLink>
        <button
          className="btn btn-warning"
          style={{ marginLeft: 12 }}
          onClick={handleExportSummaries}
        >
          📄 Download All Summaries (.txt)
        </button>
      </div>
    </div>
  );
};

export default LexisAppendList;
