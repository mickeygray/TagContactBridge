import React, { useState } from "react";
import * as XLSX from "xlsx";

// Format Phone Number to Database Format: (XXX)XXX-XXXX
const formatPhoneNumber = (number) => {
  const digits = number.replace(/\D/g, ""); // Remove non-numeric characters
  return digits.length === 10
    ? `(${digits.slice(0, 3)})${digits.slice(3, 6)}-${digits.slice(6, 10)}`
    : number; // Return original if not 10 digits
};

const CallUpload = () => {
  const [file, setFile] = useState(null);
  const [phoneNumbers, setPhoneNumbers] = useState([]);

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
  };

  const handleUpload = () => {
    if (!file) {
      alert("Please select a file first.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: "array" });

      // Locate the "Calls" sheet
      const sheetName = workbook.SheetNames.find((name) =>
        name.toLowerCase().includes("calls")
      );
      if (!sheetName) {
        alert("No 'Calls' sheet found in the uploaded file.");
        return;
      }

      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      // Extract headers and find the "Phone Number" column index
      const headers = jsonData[0].map((header) => header.toLowerCase());
      const phoneColIndex = headers.findIndex((header) =>
        header.includes("phone number")
      );

      if (phoneColIndex === -1) {
        alert("No 'Phone Number' column found in the 'Calls' sheet.");
        return;
      }

      // Extract and format phone numbers from the column
      const extractedNumbers = jsonData
        .slice(1) // Skip the header row
        .map((row) => row[phoneColIndex]) // Get the phone number column
        .filter((num) => num) // Remove empty rows
        .map(formatPhoneNumber); // Format to (XXX)XXX-XXXX

      setPhoneNumbers(extractedNumbers);
      console.log("Extracted and Formatted Phone Numbers:", extractedNumbers);
    };

    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="card">
      <h3>Upload Call Data</h3>
      <input type="file" accept=".xlsx" onChange={handleFileChange} />
      <button className="button mt-2" onClick={handleUpload}>
        Upload
      </button>

      {phoneNumbers.length > 0 && (
        <div>
          <h4>Extracted Phone Numbers:</h4>
          <ul>
            {phoneNumbers.map((num, index) => (
              <li key={index}>{num}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default CallUpload;
