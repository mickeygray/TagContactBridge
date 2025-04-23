import React, { useState, useContext } from "react";
import Papa from "papaparse";
import ClientFilterCard from "./ClientFilterCard";
import ProspectFilterCard from "./ProspectFilterCard";
import ClientAnalysisList from "./ClientAnalysisList";
import ListContext from "../../context/list/listContext";
import ProspectUploader from "./ProspectUploader";
import * as XLSX from "xlsx";
const LogicsFileReader = () => {
  const [prospects, setProspects] = useState([]);
  const [clients, setClients] = useState([]);
  const [error, setError] = useState("");
  const { finalClientList, contactList, postContactList } =
    useContext(ListContext); // 🧠 Pulling from context

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (event) => {
      let rawText = event.target.result;
      console.log("🔍 RAW CSV CONTENT:", rawText);

      // Step 1: Remove UTF-16 null bytes and clean line endings/quotes
      const cleanedText = rawText
        .replace(/\u0000/g, "") // Remove all null bytes
        .replace(/\r/g, "") // Remove stray carriage returns
        .replace(/" +/g, '"') // Trim quotes with spaces
        .replace(/"/g, "") // Remove all quotes (optional depending on use case)
        .trim();

      // Step 2: Parse with PapaParse
      Papa.parse(cleanedText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          // Step 3: Normalize column keys (trim spacing in keys and values)
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

          splitByStatus(cleanedData); // this
          // Do something with cleanedData here...
        },
        error: (error) => {
          console.error("❌ PapaParse Error:", error);
        },
      });
    };

    reader.readAsText(file);
  };

  // 📌 Helper: Validate phone number
  const isValidPhone = (phone) => {
    if (!phone) return false;
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) return false;
    const areaCode = digits.slice(0, 3);
    if (/^(\d)\1{2}$/.test(areaCode)) return false; // e.g., 111, 222
    return true;
  };

  // 📌 Helper: Validate email address
  const isValidEmail = (email) => {
    if (!email) return false;
    const clean = email.trim().toLowerCase();
    if (!clean.includes("@")) return false;
    if (clean.includes("tax")) return false; // Avoid internal/test emails
    return true;
  };

  // ✅ Parse valid prospects from full sheet
  const parseProspects = (sheetData) => {
    return sheetData.filter((row) => {
      const status = row.Status?.toLowerCase() || "";

      const isProspect = status.includes("prospect");

      const hasValidPhone =
        isValidPhone(row.Cell) ||
        isValidPhone(row.Home) ||
        isValidPhone(row["Work Phone"]);

      const hasValidEmail = isValidEmail(row.Email);

      return isProspect && (hasValidPhone || hasValidEmail);
    });
  };

  const splitByStatus = (rows) => {
    const p = [];
    const c = [];

    rows.forEach((row) => {
      console.log(row);
      const status = row.Status || "";

      if (status.includes("Active Prospect")) {
        p.push(row);
      } else if (
        !/Non-Collectible|Bad\/Inactive|Suspended|Settled|TIER 5/i.test(status)
      ) {
        c.push(row);
      }
    });

    console.log(c);
    setProspects(parseProspects(p));
    setClients(c);
  };
  const exportToCSV = () => {
    const worksheet = XLSX.utils.json_to_sheet(contactList);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Formatted Data");

    // Format date as MM-DD-YYYY
    const today = new Date();
    const formattedDate = `${
      today.getMonth() + 1
    }-${today.getDate()}-${today.getFullYear()}`;
    const newFileName = `${formattedDate} Contact List.csv`;

    // Export as CSV
    XLSX.writeFile(workbook, newFileName, { bookType: "csv" });
  };

  return (
    <div className="card">
      <h3>📂 Logics File Splitter</h3>
      <input
        type="file"
        accept=".csv"
        onChange={handleFileUpload}
        className="mb-2"
      />

      <div>
        {clients && clients.length > 0 && (
          <ClientFilterCard clients={clients} />
        )}
      </div>
      {prospects && prospects.length > 0 && (
        <ProspectFilterCard prospects={prospects} />
      )}

      {finalClientList && finalClientList.length > 0 && (
        <div className="mt-4">
          <h4>🔍 Client Analysis</h4>
          <ClientAnalysisList />
        </div>
      )}

      <button onClick={() => exportToCSV()} className="btn btn-primary">
        Download Contact List
      </button>
      <button
        className="btn btn-primary"
        onClick={() => postContactList(contactList)}
      >
        Save Contact List
      </button>
      <ProspectUploader />
    </div>
  );
};

export default LogicsFileReader;
