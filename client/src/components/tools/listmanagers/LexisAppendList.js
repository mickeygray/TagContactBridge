import React, { useState, useCallback, useContext } from "react";
import Papa from "papaparse";
import FileAppendItem from "./FileAppendItem";
import BusinessAnalysisItem from "./BusinessAnalysisItem";
import useLexisData from "../../../hooks/useLexisData";
import ListContext from "../../../context/list/listContext";
import { CSVLink } from "react-csv";

const LexisAppendList = () => {
  // State to hold all parsed leads (ALL go here)
  const [lienList, setLienList] = useState([]);
  // State to hold only parsed leads that are business owners
  const [businessList, setBusinessList] = useState([]);
  const [activeList, setActiveList] = useState("liens"); // "leads" or "business"

  // Used for download and pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const paginatedList = activeList === "business" ? businessList : lienList;
  const currentItems = paginatedList.slice(indexOfFirstItem, indexOfLastItem);

  const { validatedLienList, lexDataArray, clearLexDataArray, buildLienList } =
    useContext(ListContext);
  // Import the correct builder functions
  const {
    buildBusinessContactList,
    buildBusinessCsv,
    buildDialerCsv,
    buildEmailCsv,
  } = useLexisData();

  function getTodayYYYYMMDD() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0"); // Months are 0-based
    const dd = String(d.getDate()).padStart(2, "0");
    return `${dd}-${mm}-${yyyy}`;
  }
  const datePrefix = getTodayYYYYMMDD();
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
  const handleBusinessCleaned = (cleaned) => {
    setBusinessList((prev) =>
      prev.map((item) =>
        item.caseNumber === cleaned.caseNumber ? cleaned : item
      )
    );
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

  const handleBusinessValidationListBuild = () => {
    const businessContactList = buildBusinessContactList(validatedLienList);
    setBusinessList(businessContactList);
    setActiveList("business");
  };

  const clearBusinessInfo = () => {
    setBusinessList([]);
    clearLexDataArray();
    setActiveList("liens");
  };
  // Summaries for all parsed leads (could also just use lienList or businessList)

  return (
    <div>
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
      {lienList.length > 0 && activeList === "liens" && (
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

      {businessList.length > 0 && activeList === "business" && (
        <div>
          {currentItems.map((entry, i) => (
            <BusinessAnalysisItem
              key={entry.caseNumber || i}
              entry={entry}
              onCleaned={handleBusinessCleaned}
            />
          ))}
        </div>
      )}

      {/* Download buttons */}

      <button
        className="btn btn-secondary"
        onClick={() => buildLienList(lexDataArray)}
        style={{ marginLeft: 12 }}
      >
        Scrub Liens
      </button>
      <div style={{ marginTop: 32 }}>
        <CSVLink
          data={buildDialerCsv(validatedLienList)}
          filename={`${datePrefix}_dialer-list.csv`}
          onClick={() => buildDialerCsv(validatedLienList)}
          className="btn btn-secondary"
          style={{ marginLeft: 12 }}
        >
          Download Dialer CSV
        </CSVLink>

        <CSVLink
          data={buildEmailCsv(validatedLienList)}
          filename={`${datePrefix}_email-list.csv`}
          onClick={() => buildDialerCsv(validatedLienList)}
          className="btn btn-primary"
          style={{ marginLeft: 12 }}
        >
          Download Email CSV
        </CSVLink>

        {activeList === "liens" ? (
          <button
            onClick={handleBusinessValidationListBuild}
            className="btn btn-danger"
            style={{ marginLeft: 12 }}
          >
            Run Business Validation Tool
          </button>
        ) : (
          <CSVLink
            data={buildBusinessCsv(businessList)}
            filename={`${datePrefix}_business-list.csv`}
          >
            <button className="btn btn-primary" style={{ marginLeft: 12 }}>
              {" "}
              Download Business Report
            </button>
          </CSVLink>
        )}

        <button
          onClick={() => clearBusinessInfo()}
          className="btn btn-primary"
          style={{ marginLeft: 12 }}
        >
          {" "}
          Clear Scrape Data
        </button>
      </div>
    </div>
  );
};

export default LexisAppendList;
