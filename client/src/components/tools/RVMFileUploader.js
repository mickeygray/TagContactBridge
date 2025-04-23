import React, { useContext, useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import RVMContext from "../../context/rvm/rvmContext";
import { CSVLink } from "react-csv";
const RVMFileUploader = () => {
  const {
    extractedLeads,
    txtFiles,
    scrapingQueue,
    scrubLeads,
    uploadTXTs,
    removeFile,
    processBatch,
    uploadFileToCase,
  } = useContext(RVMContext);

  console.log(extractedLeads);
  const [selectedLead, setSelectedLead] = useState(null); // ✅ Tracks lead being edited
  const generateCSVData = () => {
    const csvData = [["Fname", "PhoneTo"]];

    extractedLeads.forEach((lead) => {
      // ✅ Primary phone number (if available)
      if (lead.phone && lead.phone !== "N/A") {
        csvData.push([lead.name, lead.phone]);
      }

      // ✅ Include all additional phone numbers
      if (lead.phoneNumbers.length > 0) {
        lead.phoneNumbers.forEach((phoneObj) => {
          csvData.push([lead.name, phoneObj]);
        });
      }
    });

    return csvData;
  };
  // ✅ Handle dropped files
  const onDrop = useCallback(
    (acceptedFiles) => {
      uploadTXTs([...txtFiles, ...acceptedFiles]); // Add new files
    },
    [txtFiles, uploadTXTs]
  );

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: ".txt",
    multiple: true,
  });

  // ✅ Function to determine color-coding
  const getLeadStatusColor = (lead) => {
    if (!lead.name || lead.phoneNumbers.length === 0) return "red"; // 🔴 Missing Name/Phone
    if (!lead.address || !lead.city || !lead.state || !lead.zip)
      return "yellow"; // 🟡 Incomplete Address
    return "green"; // ✅ Complete
  };

  return (
    <div className="rvm-uploader">
      {/* Drag & Drop Area */}
      <div {...getRootProps()} className="dropzone">
        <input {...getInputProps()} />
        <p>📂 Drag & drop TXT files here, or click to select files</p>
      </div>
      {/* 🟡 Processing Queue - Scraping Animation */}
      {scrapingQueue.length > 0 && (
        <div className="processing-bar">
          <h4>⏳ Scraping Leads...</h4>
          <div className="progress-bar">
            {scrapingQueue.map((file, index) => (
              <div key={index} className="progress-item">
                {file.name} 🏗️
              </div>
            ))}
          </div>
        </div>
      )}
      {txtFiles.length > 0 && (
        <button
          onClick={() => {
            const testFile = txtFiles[0];
            const testCaseID = 69338; // Replace with a valid test CaseID
            uploadFileToCase({ file: testFile, caseID: testCaseID });
          }}
        >
          📤 Upload First TXT to Logics
        </button>
      )}
      {/* 📜 Uploaded File Tray */}
      {txtFiles.length > 0 && (
        <div className="file-tray">
          <h4>📜 Files Ready to Upload</h4>
          <ul>
            {txtFiles.map((file, index) => (
              <li key={index} className="file-item">
                📄 {file.name}
                <button onClick={() => removeFile(index)}>❌</button>
              </li>
            ))}
          </ul>
          <button onClick={processBatch} className="start-processing">
            🚀 Start Scraping
          </button>
        </div>
      )}
      <button
        onClick={scrubLeads}
        disabled={extractedLeads.length === 0}
        style={{
          padding: "10px 20px",
          borderRadius: "5px",
          border: "none",
          backgroundColor: extractedLeads.length > 0 ? "#007bff" : "#d6d6d6",
          color: "#ffffff",
          cursor: extractedLeads.length > 0 ? "pointer" : "not-allowed",
          fontSize: "16px",
          fontWeight: "bold",
        }}
      >
        Scrub Leads
      </button>

      {/* 🟢 Extracted Leads Display */}
      {extractedLeads.length > 0 && (
        <div className="lead-summary">
          <h4>✅ Extracted Leads</h4>
          <ul className="lead-list">
            {extractedLeads.map((lead, index) => (
              <li
                key={index}
                className={`lead-card ${getLeadStatusColor(lead)}`}
                onClick={() => setSelectedLead(lead)} // ✅ Open Edit Modal
              >
                <h5>🔹 {lead.name || "Unknown Name"}</h5>
                <hr />
                <ul>
                  <li>
                    <strong>📞 Phones:</strong> {lead.phoneNumbers.length}{" "}
                  </li>
                  <li>
                    <strong>📧 Emails:</strong> {lead.emails.length}{" "}
                  </li>
                  <li>
                    <strong>💰 Total Debt:</strong> $
                    {lead.federalDebt + lead.stateDebt}
                  </li>
                  <li>
                    <strong>⚖️ Lien Count:</strong> {lead.taxLiens.length}
                  </li>
                  <li>
                    <strong>📄 Source:</strong> {lead.fileName}
                  </li>
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedLead && (
        <div className="modal">
          <div className="modal-content">
            <h4>📝 Edit Lead</h4>

            {/* ✅ Name */}
            <label>Name:</label>
            <input
              type="text"
              value={selectedLead.name}
              onChange={(e) =>
                setSelectedLead({ ...selectedLead, name: e.target.value })
              }
            />

            {/* ✅ Phone Numbers (Editable) */}
            <label>Phone Numbers:</label>
            <ul>
              {selectedLead.phoneNumbers.map((phone, index) => (
                <li key={index}>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => {
                      const updatedPhones = [...selectedLead.phoneNumbers];
                      updatedPhones[index] = e.target.value;
                      setSelectedLead({
                        ...selectedLead,
                        phoneNumbers: updatedPhones,
                      });
                    }}
                  />
                  <button
                    onClick={() => {
                      const updatedPhones = selectedLead.phoneNumbers.filter(
                        (_, i) => i !== index
                      );
                      setSelectedLead({
                        ...selectedLead,
                        phoneNumbers: updatedPhones,
                      });
                    }}
                  >
                    ❌
                  </button>
                </li>
              ))}
            </ul>

            {/* ✅ Emails (Editable) */}
            <label>Emails:</label>
            <ul>
              {selectedLead.emails.map((email, index) => (
                <li key={index}>
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => {
                      const updatedEmails = [...selectedLead.emails];
                      updatedEmails[index] = e.target.value;
                      setSelectedLead({
                        ...selectedLead,
                        emails: updatedEmails,
                      });
                    }}
                  />
                  <button
                    onClick={() => {
                      const updatedEmails = selectedLead.emails.filter(
                        (_, i) => i !== index
                      );
                      setSelectedLead({
                        ...selectedLead,
                        emails: updatedEmails,
                      });
                    }}
                  >
                    ❌
                  </button>
                </li>
              ))}
            </ul>

            {/* ✅ Tax Liens (Removable) */}
            <label>Tax Liens:</label>
            <ul>
              {selectedLead.taxLiens.map((lien, index) => (
                <li key={index}>
                  {lien.type} - ${lien.amount} ({lien.filingDate})
                  <button
                    onClick={() => {
                      const updatedLiens = selectedLead.taxLiens.filter(
                        (_, i) => i !== index
                      );
                      setSelectedLead({
                        ...selectedLead,
                        taxLiens: updatedLiens,
                      });
                    }}
                  >
                    ❌
                  </button>
                </li>
              ))}
            </ul>

            <button onClick={() => setSelectedLead(null)}>Close</button>
          </div>
        </div>
      )}

      {extractedLeads.length > 0 && (
        <div className="csv-export">
          <h4>✅ Export Leads to CSV</h4>
          <CSVLink
            data={generateCSVData()}
            filename="rvm_leads.csv"
            className="button primary"
          >
            📥 Download CSV
          </CSVLink>
        </div>
      )}
    </div>
  );
};

export default RVMFileUploader;
