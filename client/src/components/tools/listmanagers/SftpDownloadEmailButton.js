// components/SftpDownloadEmailButton.jsx
import React, { useState, useContext } from "react";
import ListContext from "../../../context/list/listContext";

export default function SftpDownloadEmailButton() {
  const { downloadAndEmailDaily } = useContext(ListContext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const handleClick = async () => {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      // calls your ListState action which posts to /api/list/download-and-email
      const data = await downloadAndEmailDaily();
      setResult(data);
    } catch (err) {
      setError(err.message || "Failed to download and email report");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <button
        onClick={handleClick}
        disabled={loading}
        className="button primary"
      >
        {loading ? "Running…" : "Download & Email Daily Report"}
      </button>

      {error && <p className="text-red-600 mt-2">Error: {error}</p>}

      {result && (
        <div className="mt-2 text-green-700">
          {result.zipSent && <p>✅ ZIP Sent: {result.zipSent}</p>}
          {Array.isArray(result.filesSent) && (
            <p>📎 Files: {result.filesSent.join(", ")}</p>
          )}
          {typeof result.totalCount === "number" && (
            <p>Total Records: {result.totalCount}</p>
          )}
          {typeof result.stateCount === "number" && (
            <p>State Tax Records: {result.stateCount}</p>
          )}
          {typeof result.federalCount === "number" && (
            <p>Federal Tax Records: {result.federalCount}</p>
          )}
        </div>
      )}
    </div>
  );
}
