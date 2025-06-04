// FileAppendItem.js
import React, { useState } from "react";
import { useDropzone } from "react-dropzone";
import ClientContext from "../../../context/client/clientContext";
import useLexisData from "../../../hooks/useLexisData";
import CopyableItem from "../../layout/CopyableItem";

const FileAppendItem = ({
  record,
  onFileRemove,
  onLeadExtracted,
  isParsed,
}) => {
  const { uploadFileToCase } = React.useContext(ClientContext);
  const { parseLexisRecord, buildSummaryText } = useLexisData();
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const {
    "First Name": firstName,
    "Last Name": lastName,
    Address,
    City,
    State,
    caseNumber,
  } = record;

  const onDrop = async (acceptedFiles) => {
    const uploadedFile = acceptedFiles[0];
    if (!uploadedFile || !caseNumber) return;

    setIsProcessing(true);
    setFile(uploadedFile);

    try {
      // Read file content
      const fileContent = await uploadedFile.text();

      // Parse the file
      const parsedData = parseLexisRecord(fileContent);

      // Set isBusinessOwner flag

      // Generate summary text
      const summaryText = buildSummaryText(parsedData);

      // Create a new file with the summary text
      const summaryFile = new File([summaryText], `${caseNumber}_summary.txt`, {
        type: "text/plain",
      });

      // Upload summary to Logics
      await uploadFileToCase({ file: summaryFile, caseNumber });

      // Pass parsed data back to parent
      onLeadExtracted(caseNumber, parsedData);
    } catch (error) {
      console.error("Error processing file:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/plain": [".txt"] },
    multiple: false,
    disabled: isProcessing,
  });

  return (
    <div
      className="file-append-item"
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "8px",
        marginBottom: "10px",
        backgroundColor: isParsed ? "#e0ffe0" : "#f9f9f9",
        border: "1px solid #ccc",
        padding: "10px",
        borderRadius: "6px",
        opacity: isProcessing ? 0.7 : 1,
      }}
    >
      <CopyableItem label="First" value={firstName} />
      <CopyableItem label="Last" value={lastName} />
      <CopyableItem label="Address" value={Address} />
      <CopyableItem label="City" value={City} />
      <CopyableItem label="State" value={State} />
      <CopyableItem label="CaseNumber" value={caseNumber} />

      <div
        {...getRootProps()}
        style={{
          border: "2px dashed #888",
          borderRadius: "6px",
          padding: "6px 12px",
          cursor: isProcessing ? "wait" : "pointer",
          backgroundColor: isDragActive ? "#d0eaff" : "#fff",
          color: "#333",
        }}
      >
        <input {...getInputProps()} />
        {isProcessing
          ? "⏳ Processing..."
          : isParsed
          ? "✅ File Uploaded"
          : "📂 Drop TXT"}
      </div>

      <button
        className="btn-delete"
        onClick={() => onFileRemove(caseNumber)}
        disabled={isProcessing}
      >
        ❌
      </button>
    </div>
  );
};

export default FileAppendItem;
