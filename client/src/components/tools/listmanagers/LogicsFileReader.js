import React, { useState, useContext } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import ListContext from "../../../context/list/listContext";
import MessageContext from "../../../context/message/messageContext";
import NewCreateClientAnalysisList from "../lists/NewCreateClientAnalysisList";

const LogicsFileReader = () => {
  const [clients, setClients] = useState([]);
  const [error, setError] = useState("");
  const [domain, setDomain] = useState("TAG");
  const [mode, setMode] = useState("bulkUpload"); // bulkUpload | zeroInvoice | prospectDialer | advanceScrape

  // Context actions
  const {
    addCreateDateClients,
    parseZeros,
    buildDialerList,
    zeroInvoiceList,
    prospectDialerList,
  } = useContext(ListContext);
  const { startLoading, stopLoading, showMessage, showError } =
    useContext(MessageContext);

  // 1. Bulk Upload CSV Handler
  const handleBulkUploadCsv = (file) => {
    setError("");
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ({ target }) => {
      const cleaned = target.result
        .replace(/\u0000/g, "")
        .replace(/\r/g, "")
        .replace(/" +/g, '"')
        .replace(/"/g, "")
        .trim();

      Papa.parse(cleaned, {
        header: true,
        skipEmptyLines: true,
        complete: ({ data }) => {
          const filtered = data.filter((r) => {
            const st = r.Status || "";
            return !/Non-Collectible|Bad\/Inactive|Suspended|Settled|TIER 5/i.test(
              st
            );
          });
          const mapped = filtered.map((row) => ({
            name: row["Name"] || "",
            email: row["Email"] || "",
            cell: row["Cell"] || "",
            caseNumber: row["Case #"] || "",
            initialPayment: parseFloat(row["Initial Payment"] || 0),
            totalPayment: parseFloat(row["Total Payments"] || 0),
            secondPaymentDate: row["Second Payment Date"]
              ? new Date(row["Second Payment Date"])
              : null,
            domain,
            createDate: new Date().toISOString().split("T")[0],
          }));
          setClients(mapped);
        },
        error: (err) => setError("Failed to parse CSV file"),
      });
    };
    reader.readAsText(file);
  };

  // 2. Zero Invoice CSV Handler
  const handleZeroInvoiceCsv = (file) => {
    setError("");
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ({ target }) => {
      const cleaned = target.result
        .replace(/\u0000/g, "")
        .replace(/\r/g, "")
        .replace(/" +/g, '"')
        .replace(/"/g, "")
        .trim();

      Papa.parse(cleaned, {
        header: true,
        skipEmptyLines: true,
        complete: ({ data }) => {
          // Schema may be different if needed; adjust as necessary
          const mapped = data.map((row) => ({
            name: row["Name"] || "",
            email: row["Email"] || "",
            cell: row["Cell"] || "",
            caseNumber: row["Case #"] || "",
            totalPayment: parseFloat(row["Total Payments"] || 0),
            domain,
            createDate: new Date().toISOString().split("T")[0],
          }));
          setClients(mapped);
        },
        error: (err) => setError("Failed to parse CSV file"),
      });
    };
    reader.readAsText(file);
  };

  // 3. Prospect Dialer CSV Handler (multiple files)
  const handleProspectDialerCsv = (fileList) => {
    setError("");
    const files = Array.from(fileList);
    if (files.length === 0) return;

    let allRows = [];
    const normalizePhone = (raw = "") => raw.replace(/[^\d]/g, "");

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

    Promise.all(files.map(processFile))
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
      .catch((err) => {
        setError("Failed to parse dialer files");
      });
  };
  const parseRawLeadData = (rawData) => {
    console.log("parseRawLeadData input:", rawData);

    const uniqueAddresses = new Set();

    // Step 1: Filter out entries with no LexID in "Debtor"
    const filtered = rawData.filter((entry) => {
      const nameRegex = /^(.*?),\s*(.*?)\nLexID\(sm\):\n(\d+)/;
      const result = nameRegex.test(entry["Debtor"]);
      if (!result) {
        console.log("Filtered out (no LexID match):", entry);
      }
      return result;
    });

    console.log("After LexID filter:", filtered);

    // Step 2: Map and parse all fields
    const mapped = filtered.map((entry) => {
      try {
        const nameRegex = /^(.*?),\s*(.*?)\nLexID\(sm\):\n(\d+)/;
        const filingRegex =
          /Filing Date:(\d{1,2}\/\d{1,2}\/\d{4}).*?Amount:\$(\d{1,3}(?:,\d{3})*|\d+)/s;
        const certificateNumberRegex = /Certificate Number:(\w+)/;
        const filingNumberRegex = /Filing Number:([\w\d]+)/;
        const filingOfficeRegex = /Filing Office:(.*)$/m;

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
          ? toSentenceCase(addressLines[0].trim())
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
        const isFederalTaxLien = entry["Filing"]?.includes("FEDERAL TAX LIEN");
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
        const settlementAmount = amount ? amount * 0.05 : 0;
        const savings = amount ? amount - settlementAmount : 0;

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

        const parsedObj = {
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
          filingNumber,
          authority,
          certificateNumber: isFederalTaxLien ? certificateNumber : null,
          filingOffice: isFederalTaxLien ? filingOffice : null,
          settlementAmount: formattedSettlementAmount,
          savings: formattedSavings,
          noticeDate,
          responseDate,
        };
        console.log("Parsed object:", parsedObj);
        return parsedObj;
      } catch (error) {
        console.error("Error parsing entry:", entry, error);
        return null;
      }
    });

    console.log("After map (parsed rows):", mapped);

    // Step 3: Filter out nulls and 'Unknown' liens
    const filteredParsed = mapped.filter(
      (entry) => entry !== null && entry.lienType !== "Unknown"
    );
    console.log("After filter out null/unknown:", filteredParsed);

    // Step 4: Deduplicate by address
    const deduped = filteredParsed.filter((entry) => {
      if (uniqueAddresses.has(entry.address)) {
        console.log("Duplicate address filtered out:", entry.address);
        return false;
      } else {
        uniqueAddresses.add(entry.address);
        return true;
      }
    });

    console.log("After deduplication:", deduped);
    return deduped;
  };

  // 4. Advance Scrape XLSX Handler (multiple files)
  const handleAdvanceScrapeXlsx = (fileList) => {
    setError("");
    const files = Array.from(fileList);
    if (files.length === 0) return;

    let allRows = [];
    let isFirstFile = true;

    const processXlsx = (file, isFirst) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: "array" });

          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const rawJsonData = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
          });

          console.log(`[${file.name}] Raw rows:`, rawJsonData);

          // Extract the "Terms" row (optional)
          if (isFirst) {
            const termsRow = rawJsonData.find((row) =>
              row.some(
                (cell) => typeof cell === "string" && cell.includes("terms(")
              )
            );
            const termsString = termsRow
              ? termsRow.find((cell) => cell.includes("terms("))
              : null;
            if (termsString) {
              console.log(
                `[${file.name}] Extracted terms string:`,
                termsString
              );
            }
          }

          // Find the index of the "No." header row
          const startIndex = rawJsonData.findIndex((row) =>
            row.includes("No.")
          );
          console.log(`[${file.name}] Header row index:`, startIndex);

          if (startIndex === -1) {
            reject("No valid header row found in " + file.name);
            return;
          }

          const filteredRows = rawJsonData.slice(startIndex + 1);

          console.log(`[${file.name}] Data rows (after header):`, filteredRows);

          // Convert to objects
          const jsonData = XLSX.utils.sheet_to_json(
            XLSX.utils.json_to_sheet(filteredRows),
            { header: ["No", "Debtor", "Address", "Filing", "Creditor"] }
          );
          console.log(`[${file.name}] Parsed objects:`, jsonData);

          resolve(jsonData);
        };
        reader.onerror = () => reject("Failed to read " + file.name);
        reader.readAsArrayBuffer(file);
      });

    Promise.all(files.map((file, i) => processXlsx(file, i === 0)))
      .then((arrays) => {
        arrays.forEach((arr, idx) => {
          console.log(`Merged file #${idx + 1}:`, arr);
          allRows.push(...arr);
        });
        console.log("All merged rows before parsing:", allRows);

        // Pipe to your parser
        const formatted = parseRawLeadData(allRows);

        console.log("Formatted rows after parseRawLeadData:", formatted);

        setClients(formatted);
        setError("");
      })
      .catch((err) => {
        console.error("Parse error in handleAdvanceScrapeXlsx:", err);
        setError(typeof err === "string" ? err : "Failed to parse XLSX files");
      });
  };

  // Export CSV (for all but advanceScrape)
  const exportToCSV = () => {
    let sheetData;
    let filename;
    if (mode === "zeroInvoice") {
      sheetData = zeroInvoiceList;
      filename = "ZeroInvoices.csv";
    } else if (mode === "prospectDialer") {
      sheetData = prospectDialerList;
      filename = "ProspectDialer.csv";
    } else {
      sheetData = clients;
      filename = "Clients.csv";
    }
    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, `${filename}`, { bookType: "csv" });
  };

  // Export XLSX (for advanceScrape)
  const exportToXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(clients);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, "AdvanceScrape.xlsx", { bookType: "xlsx" });
  };

  // run the selected tool (no action for advanceScrape)
  const handleAction = async () => {
    if (clients.length === 0) {
      showError("Upload", "No clients to process.", 400);
      return;
    }
    startLoading();
    try {
      if (mode === "bulkUpload") {
        const res = await addCreateDateClients(clients);
        const count = Array.isArray(res.added) ? res.added.length : 0;
        showMessage("Bulk Upload", `Saved ${count} clients.`, 200);
      } else if (mode === "zeroInvoice") {
        await parseZeros(clients);
        showMessage(
          "Zero Invoice",
          `Found ${zeroInvoiceList.length} zero‐amount invoices.`,
          200
        );
      } else if (mode === "prospectDialer") {
        await buildDialerList(clients);
        showMessage(
          "Dialer Builder",
          `Built dialer list with ${prospectDialerList.length} entries.`,
          200
        );
      }
      // No action for advanceScrape
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      showError("Error", msg, err.response?.status);
    } finally {
      stopLoading();
    }
  };

  return (
    <div className="card">
      <h3>📂 Bulk Lead Upload</h3>
      {error && <p className="text-danger">{error}</p>}

      {/* Mode selector */}
      <div className="grid-2 mb-2">
        <label>Domain:</label>
        <select value={domain} onChange={(e) => setDomain(e.target.value)}>
          <option value="TAG">TAG</option>
          <option value="WYNN">WYNN</option>
          <option value="AMITY">AMITY</option>
        </select>

        <label>Tool:</label>
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="bulkUpload">Bulk Upload</option>
          <option value="zeroInvoice">Zero Invoice Parse</option>
          <option value="prospectDialer">Prospect Dialer Builder</option>
          <option value="advanceScrape">Advance Scrape Tool</option>
        </select>
      </div>

      <input
        type="file"
        multiple={mode === "prospectDialer" || mode === "advanceScrape"}
        accept={mode === "advanceScrape" ? ".xlsx" : ".csv"}
        onChange={(e) => {
          if (mode === "bulkUpload") handleBulkUploadCsv(e.target.files[0]);
          else if (mode === "zeroInvoice")
            handleZeroInvoiceCsv(e.target.files[0]);
          else if (mode === "prospectDialer")
            handleProspectDialerCsv(e.target.files);
          else if (mode === "advanceScrape")
            handleAdvanceScrapeXlsx(e.target.files);
        }}
        className="mb-2"
      />

      {mode === "advanceScrape" ? (
        <button
          onClick={exportToXLSX}
          className="btn btn-primary"
          disabled={clients.length === 0}
        >
          Download Advance Scrape XLSX
        </button>
      ) : (
        <button onClick={exportToCSV} className="btn btn-primary">
          Download{" "}
          {mode === "bulkUpload"
            ? "Mapped CSV"
            : mode === "zeroInvoice"
            ? "Zero Invoices CSV"
            : mode === "prospectDialer"
            ? "Dialer CSV"
            : null}
        </button>
      )}

      {/* Action button, not shown for advanceScrape */}
      {mode !== "advanceScrape" && (
        <button onClick={handleAction} className="btn btn-primary ml-2">
          {mode === "bulkUpload"
            ? "Save Client List"
            : mode === "zeroInvoice"
            ? "Scan Zero‐Invoices"
            : mode === "prospectDialer"
            ? "Build Prospect Dialer"
            : null}
        </button>
      )}

      {mode === "prospectDialer" && (
        <p className="mb-2 text-sm text-gray-700">
          {clients.length} valid {clients.length === 1 ? "number" : "numbers"}{" "}
          loaded
        </p>
      )}

      {mode === "bulkUpload" && <NewCreateClientAnalysisList />}
    </div>
  );
};

export default LogicsFileReader;
