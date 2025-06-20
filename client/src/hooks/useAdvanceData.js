import { useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";

/**
 * useAdvanceData
 * Handles uploading, parsing, mapping, and exporting CSV/Excel files.
 */
const normalizePhone = (raw = "") => (raw || "").replace(/[^\d]/g, "");

export default function useAdvanceData(defaultDomain = "TAG") {
  const [clients, setClients] = useState([]);
  const [error, setError] = useState("");
  const [fileNames, setFileNames] = useState([]);
  const [domain, setDomain] = useState(defaultDomain);

  // Map row to client
  const mapRowToClient = (row) => ({
    name: row["Name"] || "",
    email: row["Email"] || "",
    cell: normalizePhone(row["Cell"] || ""),
    caseNumber: row["Case #"] || "",
    initialPayment: parseFloat(row["Initial Payment"] || 0),
    totalPayment: parseFloat(row["Total Payments"] || 0),
    secondPaymentDate: row["Second Payment Date"]
      ? new Date(row["Second Payment Date"])
      : null,
    domain,
    createDate: new Date().toISOString().split("T")[0],
  });

  // CSV upload handler
  const handleCsvUpload = (file) => {
    setError("");
    setFileNames([file.name]);
    const reader = new FileReader();
    reader.onload = ({ target }) => {
      const raw = target.result
        .replace(/\u0000/g, "")
        .replace(/\r/g, "")
        .replace(/" +/g, '"')
        .replace(/"/g, "")
        .trim();

      Papa.parse(raw, {
        header: true,
        skipEmptyLines: true,
        complete: ({ data }) => {
          // Filter unwanted
          const filtered = data.filter((r) => {
            const st = r.Status || "";
            return !/Non-Collectible|Bad\/Inactive|Suspended|Settled|TIER 5/i.test(
              st
            );
          });
          setClients(filtered.map(mapRowToClient));
        },
        error: (err) => setError("Failed to parse CSV file: " + err.message),
      });
    };
    reader.readAsText(file);
  };
  const parseRawLeadData = (rawData) => {
    const uniqueAddresses = new Set(); // Set to track unique addresses

    return rawData
      .filter((entry) => {
        // Ensure the "Debtor" field contains a LexID
        const nameRegex = /^(.*?),\s*(.*?)\nLexID\(sm\):\n(\d+)/;
        return nameRegex.test(entry["Debtor"]);
      })
      .map((entry) => {
        try {
          const nameRegex = /^(.*?),\s*(.*?)\nLexID\(sm\):\n(\d+)/;
          const filingRegex =
            /Filing Date:(\d{1,2}\/\d{1,2}\/\d{4}).*?Amount:\$(\d{1,3}(?:,\d{3})*|\d+)/s;
          const certificateNumberRegex = /Certificate Number:(\w+)/;
          const filingNumberRegex = /Filing Number:([\w\d]+)/;
          const filingOfficeRegex = /Filing Office:(.*)$/m;

          // Capitalize First Letter of Each Word
          const toSentenceCase = (str) => {
            return str
              ? str
                  .toLowerCase()
                  .split(" ")
                  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(" ")
              : "";
          };

          // Extract Name and LexID
          const nameMatch = entry["Debtor"].match(nameRegex);
          const fullName = nameMatch
            ? toSentenceCase(`${nameMatch[2]} ${nameMatch[1]}`)
            : null;
          const lexID = nameMatch ? nameMatch[3] : null;

          // Extract Filing Details
          const filingMatch = entry["Filing"]?.match(filingRegex);
          const filingDate = filingMatch ? filingMatch[1] : null;
          const amount = filingMatch
            ? parseInt(filingMatch[2].replace(/,/g, ""), 10)
            : null;

          // Extract Filing Number
          const filingNumberMatch = entry["Filing"]?.match(filingNumberRegex);
          const filingNumber = filingNumberMatch ? filingNumberMatch[1] : "N/A";

          // Extract Certificate Number (Federal Liens Only)
          const certificateNumberMatch = entry["Filing"]?.match(
            certificateNumberRegex
          );
          const certificateNumber = certificateNumberMatch
            ? certificateNumberMatch[1]
            : null;

          // Extract Filing Office (Federal Liens Only)
          const filingOfficeMatch = entry["Filing"]?.match(filingOfficeRegex);
          const filingOffice = filingOfficeMatch
            ? filingOfficeMatch[1].trim()
            : null;

          // Extract Address Details
          const addressLines = entry["Address"]?.split("\n") || [];
          const address = addressLines[0]
            ? toSentenceCase(addressLines[0])
            : "";
          const cityStateZip = addressLines[1] || "";
          const county = addressLines[2]
            ? toSentenceCase(addressLines[2].replace("COUNTY", "").trim())
            : "";

          const cityStateZipParts = cityStateZip.match(
            /(.+),\s([A-Z]{2})\s(\d{5})/
          );
          const city = cityStateZipParts
            ? toSentenceCase(cityStateZipParts[1])
            : null;
          const state = cityStateZipParts ? cityStateZipParts[2] : null;
          const zip = cityStateZipParts ? cityStateZipParts[3] : null;

          // Determine Lien Type
          const isStateTaxLien = entry["Filing"]?.match(
            /STATE TAX LIEN|STATE TAX WARRANT/
          );

          const isFederalTaxLien =
            entry["Filing"]?.includes("FEDERAL TAX LIEN");
          const lienType = isStateTaxLien
            ? "State Tax Lien"
            : isFederalTaxLien
            ? "Federal Tax Lien"
            : "Unknown";

          // Determine Authority Field
          const authority = isStateTaxLien
            ? "State Taxing Authority"
            : isFederalTaxLien
            ? "Federal Taxing Authority"
            : "Unknown";

          // Extract Plaintiff
          const plaintiff = entry["Creditor"]
            ? toSentenceCase(entry["Creditor"])
            : null;

          // Calculate Settlement and Savings
          const settlementAmount = amount * 0.05;
          const savings = amount - settlementAmount;

          // Generate Notice and Response Dates
          const today = new Date();
          const tomorrow = new Date(today);
          tomorrow.setDate(today.getDate() + 1);
          const noticeDate = `${(tomorrow.getMonth() + 1)
            .toString()
            .padStart(2, "0")}/${tomorrow
            .getDate()
            .toString()
            .padStart(2, "0")}/${tomorrow.getFullYear()}`;
          const nextWeek = new Date(tomorrow);
          nextWeek.setDate(tomorrow.getDate() + 7);
          const responseDate = `${(nextWeek.getMonth() + 1)
            .toString()
            .padStart(2, "0")}/${nextWeek
            .getDate()
            .toString()
            .padStart(2, "0")}/${nextWeek.getFullYear()}`;

          const formatCurrency = (value) => {
            if (value == null || isNaN(value)) return "$0.00";
            return new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
            }).format(value);
          };

          const formattedAmount = formatCurrency(amount);
          const formattedSettlementAmount = formatCurrency(settlementAmount);
          const formattedSavings = formatCurrency(savings);

          return {
            fullName,
            lexID,
            address,
            city,
            state,
            zip,
            county,
            filingDate,
            amount: formattedAmount,
            lienType,
            plaintiff,
            filingNumber, // Now correctly extracted for both State and Federal tax liens
            authority,
            certificateNumber: isFederalTaxLien ? certificateNumber : null,
            filingOffice: isFederalTaxLien ? filingOffice : null,
            settlementAmount: formattedSettlementAmount,
            savings: formattedSavings,
            noticeDate,
            responseDate,
          };
        } catch (error) {
          console.error("Error parsing entry:", entry, error);
          return null;
        }
      })
      .filter((entry) => entry !== null && entry.lienType !== "Unknown")
      .filter((entry) => {
        // Filter out duplicates by address
        if (uniqueAddresses.has(entry.address)) {
          return false; // Skip duplicate address
        } else {
          uniqueAddresses.add(entry.address);
          return true; // Keep unique address
        }
      });
  };

  // Multiple CSVs for dialer
  const handleMultiCsvUpload = (fileList) => {
    setError("");
    setFileNames(Array.from(fileList).map((f) => f.name));
    let allRows = [];
    const processFile = (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ({ target }) => {
          const cleaned = target.result
            .replace(/\u0000/g, "")
            .replace(/\r/g, "")
            .replace(/" +/g, '"')
            .replace(/"/g, "")
            .trim();
          const { data } = Papa.parse(cleaned, {
            header: true,
            skipEmptyLines: true,
          });
          resolve(data);
        };
        reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
        reader.readAsText(file);
      });

    Promise.all(Array.from(fileList).map(processFile))
      .then((arrays) => {
        arrays.forEach((arr) => allRows.push(...arr));
        const dialerList = allRows
          .map((r) => ({
            name: (r.Name || "").trim(),
            cell: normalizePhone(r.Cell || r.Phone),
            caseNumber: r["Case #"] || r.caseNumber || "",
          }))
          .filter((c) => c.cell.length === 10);
        setClients(dialerList);
      })
      .catch((err) => setError("Failed to parse dialer files: " + err.message));
  };

  // Export to CSV
  const exportToCSV = (data = clients, filename = "Clients.csv") => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, filename, { bookType: "csv" });
  };

  // Reset all
  const reset = () => {
    setClients([]);
    setError("");
    setFileNames([]);
  };

  return {
    clients,
    setClients,
    error,
    setError,
    fileNames,
    setFileNames,
    domain,
    setDomain,
    handleCsvUpload,
    parseRawLeadData,
    handleMultiCsvUpload,
    exportToCSV,
    reset,
  };
}
