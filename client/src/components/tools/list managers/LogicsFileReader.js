import React, { useState, useContext } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import ListContext from "../../../context/list/listContext";
import MessageContext from "../../../context/message/messageContext";
import NewClientReviewList from "./NewClientReviewList";

const LogicsFileReader = () => {
  // Local state for raw CSV rows and errors
  const [clients, setClients] = useState([]);
  const [error, setError] = useState("");
  const [domain, setDomain] = useState("TAG");

  // Context actions and messaging
  const { addCreateDateClients } = useContext(ListContext);
  const { startLoading, stopLoading, showMessage, showError } =
    useContext(MessageContext);

  /**
   * Map a normalized CSV row to your Client schema
   */
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
    saleDate: null,
    stage: null,
    token: null,
    tokenExpiresAt: null,
    createDate: new Date().toISOString().split("T")[0],
    invoiceCount: undefined,
    lastInvoiceAmount: undefined,
    delinquentAmount: undefined,
    delinquentDate: null,
    reviewDate: null,
    lastContactDate: null,
    invoiceCountChangeDate: null,
    contactedThisPeriod: false,
    stagesReceived: [],
  });

  /**
   * Handle CSV file upload + parsing
   */
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

  /**
   * Download the raw mapped client list as CSV
   */
  const exportToCSV = () => {
    const ws = XLSX.utils.json_to_sheet(clients);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clients");
    const d = new Date();
    const filename = `${
      d.getMonth() + 1
    }-${d.getDate()}-${d.getFullYear()} Clients.csv`;
    XLSX.writeFile(wb, filename, { bookType: "csv" });
  };

  /**
   * Save mapped clients to backend (will run verification)
   */
  const saveClients = async () => {
    if (clients.length === 0) {
      showError("New Prospect Upload", "No clients to save.", 400);
      return;
    }
    startLoading();
    try {
      const res = await addCreateDateClients(clients);
      // res.added & res.flagged expected
      const addedCount = Array.isArray(res.added) ? res.added.length : 0;
      showMessage(
        "New Prospect Upload",
        `Successfully saved ${addedCount} clients.`,
        200
      );
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      showError(
        "New Prospect Upload",
        `Failed to save clients: ${msg}`,
        status
      );
    } finally {
      stopLoading();
    }
  };

  return (
    <div className="card">
      <h3>📂 Bulk Lead Upload</h3>
      {error && <p className="text-danger">{error}</p>}

      <div className="grid-2 mb-2">
        <label>Domain:</label>
        <select value={domain} onChange={(e) => setDomain(e.target.value)}>
          <option value="TAG">TAG</option>
          <option value="WYNN">WYNN</option>
          <option value="AMITY">AMITY</option>
        </select>
      </div>

      <input
        type="file"
        accept=".csv"
        onChange={handleFileUpload}
        className="mb-2"
      />

      <button onClick={exportToCSV} className="btn btn-primary">
        Download Mapped CSV
      </button>
      <button onClick={saveClients} className="btn btn-primary ml-2">
        Save Client List
      </button>
      <NewClientReviewList />
    </div>
  );
};

export default LogicsFileReader;
