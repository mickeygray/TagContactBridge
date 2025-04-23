import React, { useState, useContext } from "react";
import { csv } from "csvtojson";
import LeadContext from "../context/lead/leadContext";
import ProspectContext from "../context/prospect/prospectContext";

const InvoiceUploader = () => {
  const [file, setFile] = useState(null);
  const { updateLeadsFromInvoices } = useContext(LeadContext);
  const { updateProspectsFromInvoices } = useContext(ProspectContext);

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
  };

  const handleUpload = () => {
    if (!file) {
      alert("Please select a file first.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async function (event) {
      try {
        // Clean the raw content to remove NULL characters
        const cleanedContent = event.target.result.replace(/\u0000/g, "");

        // Parse the cleaned CSV content into JSON
        const jsonData = await csv().fromString(cleanedContent);

        // Format data to match required structure
        const formattedInvoices = jsonData.map((row) => ({
          name: row.Name,
          phone: row.Phone || "N/A",
          email: row.Email,
          lastInvoiceDate: row["Last Invoice Date"],
          lastInvoiceAmount: parseFloat(row["Last Invoice Amount"]) || 0,
        }));

        console.log("Formatted Invoice Data:", formattedInvoices);

        // Send invoice data to update leads and prospects
        await updateLeadsFromInvoices(formattedInvoices);
        await updateProspectsFromInvoices(formattedInvoices);

        alert("Invoice data processed successfully.");
      } catch (error) {
        console.error("Parsing Error:", error);
        alert("An error occurred while parsing the file.");
      }
    };

    reader.onerror = function (error) {
      console.error("File reading error:", error);
      alert("An error occurred while reading the file.");
    };

    reader.readAsText(file);
  };

  return (
    <div className="card">
      <h3>Upload Invoice CSV</h3>
      <input type="file" accept=".csv" onChange={handleFileChange} />
      <button className="button mt-2" onClick={handleUpload}>
        Upload
      </button>
    </div>
  );
};

export default InvoiceUploader;
