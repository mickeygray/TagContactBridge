import React, { useState, useContext, useEffect } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import ListContext from "../../../context/list/listContext";

const NCOAUploader = () => {
  const [uploadedData, setUploadedData] = useState([]);
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState("");
  const [error, setError] = useState("");

  // Context functions for processing data
  const { postList } = useContext(ListContext);

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
                FirstName: entry["First Name"] || "",
                LastName: entry["Last Name"] || "",
                Address: entry["Delivery Address"] || "",
                City: entry["City"] || "",
                State: entry["State"] || "",
                ZIP: entry["ZIP+4"]?.split("-")[0] || "", // Extract base ZIP
                Notes: `Mail Date: ${
                  entry["Mail Date"] || "N/A"
                }\nLien Amount: ${entry["Amount"] || "N/A"}\nPlaintiff: ${
                  entry["Plantiff"] || "N/A"
                }\nFiling Date: ${entry["Filing Date"] || "N/A"}`,
                SourceName: "Risk Direct Mail",
              };
            } catch (error) {
              console.error("Error formatting entry:", entry, error);
              return null; // Skip malformed entries
            }
          });

          // Filter out any null entries
          const cleanData = formattedData.filter((entry) => entry !== null);

          setUploadedData(cleanData);
        },
        error: (error) => {
          setError(`Error parsing CSV file: ${error.message}`);
        },
      });
    };
    reader.readAsText(file);
  };

  const exportToCSV = (contactData) => {
    const worksheet = XLSX.utils.json_to_sheet(contactData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Formatted Data");

    // Format date as MM-DD-YYYY
    const today = new Date();
    const formattedDate = `${
      today.getMonth() + 1
    }-${today.getDate()}-${today.getFullYear()}`;
    const newFileName = `${formattedDate} Experian.csv`;

    // Export as CSV
    XLSX.writeFile(workbook, newFileName, { bookType: "csv" });
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
                    Address: entry.Address || "",
                    City: entry.City || "",
                    State: entry.State || "",
                    ZIP: entry.ZIP || "",
                  };
                });

                postList(uploadedData);
                exportToCSV(contactData);
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

export default NCOAUploader;
