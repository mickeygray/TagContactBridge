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
    // 1) Parse every entry (including “Lien Release”) into a common shape
    const parsed = rawData
      .map((entry) => {
        try {
          // Regexes / helpers
          const nameRegex = /^(.*?),\s*(.*?)\nLexID\(sm\):\n(\d+)/;
          const filingRegex =
            /Filing Date:(\d{1,2}\/\d{1,2}\/\d{4}).*?Amount:\$(\d{1,3}(?:,\d{3})*|\d+)/s;
          const filingNumberRegex = /Filing Number:([\w\d]+)/;
          const certificateNumberRegex = /Certificate Number:(\w+)/;
          const filingOfficeRegex = /Filing Office:(.*)$/m;
          const toSentenceCase = (str) =>
            str
              ? str
                  .toLowerCase()
                  .split(" ")
                  .map((w) => w[0].toUpperCase() + w.slice(1))
                  .join(" ")
              : "";

          // Extract Name & LexID
          const nameMatch = entry["Debtor"].match(nameRegex);
          const fullName = nameMatch
            ? toSentenceCase(`${nameMatch[2]} ${nameMatch[1]}`)
            : null;
          const lexID = nameMatch ? nameMatch[3] : null;

          // Extract Filing Date & Amount
          const filingMatch = entry["Filing"]?.match(filingRegex);
          const filingDate = filingMatch ? filingMatch[1] : null;
          const rawAmount = filingMatch
            ? parseInt(filingMatch[2].replace(/,/g, ""), 10)
            : null;

          // Extract Filing Number
          const filingNumberMatch = entry["Filing"]?.match(filingNumberRegex);
          const filingNumber = filingNumberMatch ? filingNumberMatch[1] : "N/A";

          // Extract Certificate & Office (Federal liens only)
          const certificateNumberMatch = entry["Filing"]?.match(
            certificateNumberRegex
          );
          const certificateNumber = certificateNumberMatch
            ? certificateNumberMatch[1]
            : null;
          const filingOfficeMatch = entry["Filing"]?.match(filingOfficeRegex);
          const filingOffice = filingOfficeMatch
            ? filingOfficeMatch[1].trim()
            : null;

          // Extract Address, City, State, Zip, County
          const addressLines = entry["Address"]?.split("\n") || [];
          const address = addressLines[0]
            ? toSentenceCase(addressLines[0])
            : "";
          const cityStateZip = addressLines[1] || "";
          const cityStateZipParts = cityStateZip.match(
            /(.+),\s([A-Z]{2})\s(\d{5})/
          );
          const city = cityStateZipParts
            ? toSentenceCase(cityStateZipParts[1])
            : null;
          const state = cityStateZipParts ? cityStateZipParts[2] : null;
          const zip = cityStateZipParts ? cityStateZipParts[3] : null;
          const county = addressLines[2]
            ? toSentenceCase(addressLines[2].replace("COUNTY", "").trim())
            : "";

          // Determine Lien Type (including Releases)
          const isRelease = /LIEN RELEASE|RELEASE OF LIEN/i.test(
            entry["Filing"] || ""
          );
          const isStateTaxLien = /STATE TAX LIEN|STATE TAX WARRANT/.test(
            entry["Filing"] || ""
          );
          const isFederalTaxLien = (entry["Filing"] || "").includes(
            "FEDERAL TAX LIEN"
          );
          const lienType = isRelease
            ? "Lien Release"
            : isStateTaxLien
            ? "State Tax Lien"
            : isFederalTaxLien
            ? "Federal Tax Lien"
            : "Unknown";

          // Authority & Plaintiff
          const authority = isStateTaxLien
            ? "State Taxing Authority"
            : isFederalTaxLien
            ? "Federal Taxing Authority"
            : isRelease
            ? "Release Authority"
            : "Unknown";
          const plaintiff = entry["Creditor"]
            ? toSentenceCase(entry["Creditor"])
            : null;

          // Settlement & Savings (only for personal)
          const settlementRaw = rawAmount * 0.05;
          const savingsRaw = rawAmount - settlementRaw;
          const fmt = (v) =>
            new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
            }).format(v || 0);

          // Notice & Response Dates
          const today = new Date();
          const tomorrow = new Date(today);
          tomorrow.setDate(today.getDate() + 1);
          const nextWeek = new Date(tomorrow);
          nextWeek.setDate(tomorrow.getDate() + 7);
          const fmtDate = (d) =>
            `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d
              .getDate()
              .toString()
              .padStart(2, "0")}/${d.getFullYear()}`;

          return {
            fullName,
            lexID,
            address,
            city,
            state,
            zip,
            county,
            filingDate,
            rawAmount,
            amount: fmt(rawAmount),
            filingNumber,
            certificateNumber: isFederalTaxLien ? certificateNumber : null,
            filingOffice: isFederalTaxLien ? filingOffice : null,
            lienType,
            authority,
            plaintiff,
            settlementAmount: lexID && !isRelease ? fmt(settlementRaw) : null,
            savings: lexID && !isRelease ? fmt(savingsRaw) : null,
            noticeDate: fmtDate(tomorrow),
            responseDate: fmtDate(nextWeek),
          };
        } catch (err) {
          console.error("Error parsing entry:", err, entry);
          return null;
        }
      })
      // Keep only known liens & releases
      .filter((e) => e && e.lienType !== "Unknown");

    // 2) Build suppression set from all “Lien Release” entries
    const releaseKeySet = new Set(
      parsed
        .filter((e) => e.lienType === "Lien Release")
        .map((e) => `${e.address}|${e.rawAmount}`)
    );

    // 3) Collect personal liens (lexID present), skipping releases & suppressions
    const personalAddresses = new Set();
    const personalLiens = [];
    for (const e of parsed) {
      if (e.lexID && e.lienType !== "Lien Release") {
        const key = `${e.address}|${e.rawAmount}`;
        if (!releaseKeySet.has(key) && !personalAddresses.has(e.address)) {
          personalAddresses.add(e.address);
          personalLiens.push(e);
        }
      }
    }

    // 4) Collect business liens (no lexID), skipping releases, suppressions, and personal overlaps
    const businessAddresses = new Set();
    const businessLiens = [];
    for (const e of parsed) {
      if (!e.lexID && e.lienType !== "Lien Release") {
        const key = `${e.address}|${e.rawAmount}`;
        if (
          !releaseKeySet.has(key) &&
          !personalAddresses.has(e.address) &&
          !businessAddresses.has(e.address)
        ) {
          businessAddresses.add(e.address);
          businessLiens.push(e);
        }
      }
    }

    // Final return: two clean lists
    return { personalLiens, businessLiens };
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
