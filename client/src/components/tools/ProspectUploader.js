import React, { useState, useContext, useEffect } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import ListContext from "../../context/list/listContext";

const ProspectUploader = () => {
  const [uploadedData, setUploadedData] = useState([]);
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState("");
  const [error, setError] = useState("");

  // Context functions for processing data
  const { postWynnList } = useContext(ListContext);

  // File upload handler
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) {
      setError("Please select a file.");
      return;
    }

    const fileExtension = file.name.split(".").pop().toLowerCase();
    setFileName(file.name);

    if (fileExtension === "csv") {
      setFileType("csv");
      parseCSV(file);
    } else {
      setError("Unsupported file type. Please upload a CSV or Excel file.");
    }
  };

  // CSV Parser using PapaParse
  const parseCSV = (file) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const csvText = event.target.result;
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          const rawData = result.data;
          const formattedData = rawData.map((entry) => {
            try {
              return {
                FirstName: entry.FirstName?.trim() || "",
                LastName: entry.LastName?.trim() || "",
                CellPhone: entry.CellPhone || "", // normalize phone
              };
            } catch (error) {
              console.error("Error formatting entry:", entry, error);
              return null;
            }
          });

          const cleanData = formattedData.filter(
            (entry) => entry && entry.FirstName && entry.CellPhone
          );
          setUploadedData(cleanData);
        },
        error: (error) => {
          setError(`Error parsing CSV file: ${error.message}`);
        },
      });
    };
    reader.readAsText(file);
  };

  return (
    <div>
      <h3>Upload CSV or Excel File</h3>
      <input
        type="file"
        multiple
        accept=".csv, .xlsx, .xls"
        onChange={handleFileUpload}
      />
      {fileName && <p>File: {fileName}</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {uploadedData.length > 0 && (
        <>
          <h4>Preview (First 5 Rows)</h4>
          <pre>{JSON.stringify(uploadedData.slice(0, 5), null, 2)}</pre>

          {fileType === "csv" && (
            <button
              onClick={() => {
                const contactData = uploadedData.map((entry) => {
                  return {
                    FirstName: entry.FirstName || "",
                    LastName: entry.LastName || "",
                    CellPhone: entry.CellPhone || "",
                  };
                });

                postWynnList(contactData);
              }}
            >
              Upload Leads & Download CSV
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default ProspectUploader;
