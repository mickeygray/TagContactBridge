import React, { useState, useContext } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import ListContext from "../../../context/list/listContext";
import MessageContext from "../../../context/message/messageContext";
import NewCreateClientAnalysisList from "../lists/NewCreateClientAnalysisList";

const LogicsFileReader = () => {
  // RAW rows → mapped clients
  const [clients, setClients] = useState([]);
  // file‐parse errors
  const [error, setError] = useState("");
  // which domain (TAG, WYNN, AMITY)
  const [domain, setDomain] = useState("TAG");
  // which tool / mode
  const [mode, setMode] = useState("bulkUpload"); // bulkUpload | zeroInvoice | prospectDialer

  // Context actions
  const {
    addCreateDateClients, // bulkUpload
    parseZeros, // zeroInvoiceParse
    buildDialerList, // prospectDialerBuilder
    zeroInvoiceList, // output of zeroInvoice
    prospectDialerList, // output of dialer build
  } = useContext(ListContext);
  const { startLoading, stopLoading, showMessage, showError } =
    useContext(MessageContext);

  // map CSV → client object
  const mapRowToClient = (row) => ({
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
  });

  // handle CSV upload & parse
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ({ target }) => {
      const raw = target.result;
      const cleaned = raw
        .replace(/\u0000/g, "")
        .replace(/\r/g, "")
        .replace(/" +/g, '"')
        .replace(/"/g, "")
        .trim();

      Papa.parse(cleaned, {
        header: true,
        skipEmptyLines: true,
        complete: ({ data }) => {
          // Filter out unwanted statuses
          const filtered = data.filter((r) => {
            const st = r.Status || "";
            return !/Non-Collectible|Bad\/Inactive|Suspended|Settled|TIER 5/i.test(
              st
            );
          });
          // Map to schema objects
          const mapped = filtered.map(mapRowToClient);
          setClients(mapped);
        },
        error: (err) => {
          console.error(err);
          setError("Failed to parse CSV file");
        },
      });
    };
    reader.readAsText(file);
  };

  const handleMultipleFileUpload = (fileList) => {
    setError("");
    const files = Array.from(fileList);
    if (files.length === 0) return;

    let allRows = [];
    const normalizePhone = (raw = "") => raw.replace(/[^\d]/g, "");

    // helper to process one file
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

    // read all files in sequence
    Promise.all(files.map(processFile))
      .then((arrays) => {
        arrays.forEach((arr) => allRows.push(...arr));
        console.log("Total raw rows:", allRows.length);

        const dialerList = allRows
          .map((r) => ({
            name: (r.Name || "").trim(),
            cell: normalizePhone(r.Cell || r.Phone),
            caseNumber: r["Case #"] || r.caseNumber || "",
          }))
          .filter((c) => c.cell.length === 10);

        console.log("Valid 10-digit cells:", dialerList.length);
        setClients(dialerList);
      })
      .catch((err) => {
        console.error("Error parsing files:", err);
        setError("Failed to parse dialer files");
      });
  };
  // export whichever list is active to CSV
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
  console.log(prospectDialerList);
  // run the selected tool
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
        </select>
      </div>

      <input
        type="file"
        multiple={mode === "prospectDialer"}
        accept=".csv"
        onChange={(e) => {
          if (mode === "prospectDialer") {
            handleMultipleFileUpload(e.target.files);
          } else {
            handleFileUpload(e);
          }
        }}
        className="mb-2"
      />

      <button onClick={exportToCSV} className="btn btn-primary">
        Download{" "}
        {mode === "bulkUpload"
          ? "Mapped CSV"
          : mode === "zeroInvoice"
          ? "Zero Invoices CSV"
          : "Dialer CSV"}
      </button>

      <button onClick={handleAction} className="btn btn-primary ml-2">
        {mode === "bulkUpload"
          ? "Save Client List"
          : mode === "zeroInvoice"
          ? "Scan Zero‐Invoices"
          : "Build Prospect Dialer"}
      </button>
      {mode === "prospectDialer" && (
        <p className="mb-2 text-sm text-gray-700">
          {clients.length} valid {clients.length === 1 ? "number" : "numbers"}{" "}
          loaded
        </p>
      )}
      {/* show review if bulk upload */}
      {mode === "bulkUpload" && <NewCreateClientAnalysisList />}
    </div>
  );
};

export default LogicsFileReader;
