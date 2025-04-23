import React, { useState } from "react";
import { useDropzone } from "react-dropzone";
import RVMContext from "../../context/rvm/rvmContext";
import CopyableItem from "./CopyableItem";

const FileAppendItem = ({ record, onFileRemove }) => {
  const { uploadFileToCase } = React.useContext(RVMContext);
  const [file, setFile] = useState(null);

  const {
    "First Name": firstName,
    "Last Name": lastName,
    Address,
    City,
    State,
    "Case #": caseID,
  } = record;
  const onDrop = (acceptedFiles) => {
    const uploadedFile = acceptedFiles[0];
    setFile(uploadedFile);

    if (uploadedFile && caseID) {
      uploadFileToCase({
        file: uploadedFile,
        caseID,
      });
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
        backgroundColor: file ? "#e0ffe0" : "#f9f9f9",
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
      <CopyableItem label="Case #" value={caseID} />
      {/* 📂 Dropzone */}
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
      </div>{" "}
      <button className="btn-delete" onClick={() => onFileRemove(caseID)}>
        ❌
      </button>
    </div>
  );
};

export default FileAppendItem;
