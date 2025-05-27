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
  const { parseSingleLexisFile } = useLexisData();
  const [file, setFile] = useState(null);

  const {
    "First Name": firstName,
    "Last Name": lastName,
    Address,
    City,
    State,
    "Case #": caseNumber,
  } = record;

  const onDrop = async (acceptedFiles) => {
    const uploadedFile = acceptedFiles[0];
    if (!uploadedFile || !caseNumber) return;

    setFile(uploadedFile);

    // ✅ Upload file to Logics
    uploadFileToCase({ file: uploadedFile, caseNumber });

    // ✅ Parse file locally and pass result back to parent
    const parsedLead = await parseSingleLexisFile(uploadedFile);
    if (parsedLead) {
      onLeadExtracted(caseNumber, parsedLead);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ".txt",
    multiple: false,
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
      }}
    >
      <CopyableItem label="First" value={firstName} />
      <CopyableItem label="Last" value={lastName} />
      <CopyableItem label="Address" value={Address} />
      <CopyableItem label="City" value={City} />
      <CopyableItem label="State" value={State} />
      <CopyableItem label="Case #" value={caseNumber} />

      <div
        {...getRootProps()}
        style={{
          border: "2px dashed #888",
          borderRadius: "6px",
          padding: "6px 12px",
          cursor: "pointer",
          backgroundColor: isDragActive ? "#d0eaff" : "#fff",
          color: "#333",
        }}
      >
        <input {...getInputProps()} />
        {file ? "✅ File Uploaded" : "📂 Drop TXT"}
      </div>

      <button className="btn-delete" onClick={() => onFileRemove(caseNumber)}>
        ❌
      </button>
    </div>
  );
};

export default FileAppendItem;
