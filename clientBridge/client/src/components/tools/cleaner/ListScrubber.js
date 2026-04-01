import React, { useState, useRef } from "react";
import { csv } from "csvtojson";
import { useApi } from "../../../utils/api";

export default function ListScrubber() {
  const api = useApi();
  api.defaults.withCredentials = true;

  const [domain, setDomain] = useState("TAG");
  const [rawList, setRawList] = useState([]);
  const [cleanList, setCleanList] = useState([]);
  const [flaggedList, setFlaggedList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [jobProgress, setJobProgress] = useState(null);
  const pollRef = useRef(null);

  // ============ UPLOAD ============
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const rows = await csv().fromString(
          ev.target.result.replace(/\u0000/g, ""),
        );
        const processed = rows
          .map((row) => ({
            name: (row.Name || row.name || "").trim(),
            cell: (
              row.Cell ||
              row.cell ||
              row.Phone ||
              row.phone ||
              ""
            ).replace(/\D/g, ""),
            caseNumber: (
              row["Case #"] ||
              row.caseNumber ||
              row.CaseNumber ||
              ""
            )
              .toString()
              .trim(),
          }))
          .filter((r) => r.caseNumber);

        setRawList(processed);
        setCleanList([]);
        setFlaggedList([]);
        setJobProgress(null);
        setProgress(`Loaded ${processed.length} contacts`);
      } catch {
        setProgress("Error parsing CSV");
      }
    };
    reader.readAsText(file);
  };

  // ============ POLL FOR STATUS ============
  const pollStatus = (jobId) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/api/cleaner/status/${jobId}`);
        console.log(
          "[SCRUB] Poll:",
          res.data.status,
          res.data.percent || 0,
          "%",
        );
        const data = res.data;

        if (data.status === "running") {
          setJobProgress(data);
          setProgress(
            `Processing: ${data.processed}/${data.total} (${data.percent}%) — ${data.clean} clean, ${data.flagged} flagged, ${data.removed} removed`,
          );
        } else if (data.status === "done") {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setJobProgress(null);
          setCleanList(data.clean || []);
          setFlaggedList(data.flagged || []);
          setLoading(false);
          setProgress(
            `Done: ${data.stats?.clean || 0} clean, ${data.stats?.flagged || 0} flagged in ${data.durationSeconds || 0}s`,
          );
        } else if (data.status === "error") {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setJobProgress(null);
          setLoading(false);
          setProgress(`Error: ${data.error}`);
        }
      } catch (err) {
        // Don't kill the poll on transient errors
        console.error("Poll error:", err.message);
      }
    }, 3000);
  };

  // ============ CLEAN ============
  const handleClean = async () => {
    if (!rawList.length) return;
    setLoading(true);
    setProgress("Starting...");
    setJobProgress(null);
    setCleanList([]);
    setFlaggedList([]);

    try {
      console.log("[SCRUB] POST /api/cleaner/clients starting...");
      const res = await api.post("/api/cleaner/clients", {
        contacts: rawList,
        domain,
      });
      console.log("[SCRUB] POST response:", res.status, res.data);

      if (res.data.jobId) {
        console.log("[SCRUB] Got jobId:", res.data.jobId, "— starting poll");
        setProgress(`Job started — polling for progress...`);
        pollStatus(res.data.jobId);
      } else {
        console.log(
          "[SCRUB] No jobId — got synchronous response (old controller?)",
        );
        setCleanList(res.data.clean || []);
        setFlaggedList(res.data.flagged || []);
        setLoading(false);
        setProgress(
          `Done: ${res.data.stats?.clean || 0} clean, ${res.data.stats?.flagged || 0} flagged`,
        );
      }
    } catch (err) {
      console.error(
        "[SCRUB] POST failed:",
        err.response?.status,
        err.response?.data?.substring?.(0, 200) || err.message,
      );
      setLoading(false);
      setProgress(err.response?.data?.error || "Clean failed - check console");
    }
  };

  // ============ REVIEW ACTIONS ============
  const handleApprove = (client) => {
    setFlaggedList((prev) =>
      prev.filter((c) => c.caseNumber !== client.caseNumber),
    );
    setCleanList((prev) => [
      ...prev,
      { name: client.name, cell: client.cell, caseNumber: client.caseNumber },
    ]);
  };

  const handleReject = (client) => {
    setFlaggedList((prev) =>
      prev.filter((c) => c.caseNumber !== client.caseNumber),
    );
  };

  // ============ EXPORT ============
  const handleExport = () => {
    if (!cleanList.length) return;

    const csvContent = [
      "Name,Phone",
      ...cleanList.map((c) => `"${c.name || ""}","${c.cell || ""}"`),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clean_list_${domain}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reviewComplete = flaggedList.length === 0 && cleanList.length > 0;

  // ============ RENDER ============
  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h2 className="text-xl font-bold mb-4">🧹 List Scrubber</h2>

      {/* Domain Select */}
      <div className="mb-4">
        <label className="text-sm mr-2">Domain: {domain}</label>
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="p-2 border rounded"
        >
          <option value="TAG">TAG</option>
          <option value="WYNN">WYNN</option>
          <option value="AMITY">AMITY</option>
        </select>
      </div>

      {/* Upload */}
      <div className="mb-4">
        <input type="file" accept=".csv" onChange={handleUpload} />
        {rawList.length > 0 && (
          <span className="ml-2 text-sm text-gray-600">
            {rawList.length} loaded
          </span>
        )}
      </div>

      {/* Clean Button */}
      {rawList.length > 0 && (
        <button
          onClick={handleClean}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50 mb-4"
        >
          {loading ? "Cleaning..." : "Clean List"}
        </button>
      )}

      {/* Progress */}
      {progress && (
        <div className="mb-4 p-2 bg-gray-100 rounded text-sm">{progress}</div>
      )}

      {/* Progress Bar */}
      {jobProgress && (
        <div className="mb-4">
          <div
            style={{
              background: "#e5e7eb",
              borderRadius: 6,
              height: 24,
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                background: "#3b82f6",
                height: "100%",
                width: `${jobProgress.percent || 0}%`,
                transition: "width 0.5s ease",
                borderRadius: 6,
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 600,
                color: jobProgress.percent > 50 ? "#fff" : "#374151",
              }}
            >
              {jobProgress.processed}/{jobProgress.total} ({jobProgress.percent}
              %)
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              color: "#666",
              marginTop: 4,
            }}
          >
            <span>✅ {jobProgress.clean} clean</span>
            <span>⚠️ {jobProgress.flagged} flagged</span>
            <span>🗑 {jobProgress.removed} removed</span>
          </div>
        </div>
      )}

      {/* Stats */}
      {!loading && (cleanList.length > 0 || flaggedList.length > 0) && (
        <div className="mb-6 p-4 bg-gray-50 rounded flex items-center justify-between">
          <div className="flex gap-4">
            <span className="text-green-600 font-semibold">
              ✅ {cleanList.length} approved
            </span>
            <span className="text-orange-600 font-semibold">
              ⚠️ {flaggedList.length} to review
            </span>
          </div>

          {reviewComplete && (
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-green-600 text-white rounded font-semibold"
            >
              Export CSV ({cleanList.length})
            </button>
          )}
        </div>
      )}

      {/* Flagged Items */}
      {flaggedList.length > 0 && (
        <div className="space-y-4">
          {flaggedList.map((client) => (
            <FlagCard
              key={client.caseNumber}
              client={client}
              onApprove={() => handleApprove(client)}
              onReject={() => handleReject(client)}
            />
          ))}
        </div>
      )}

      {/* Review Complete Message */}
      {reviewComplete && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded text-center">
          <p className="text-green-800 font-semibold">✅ Review complete!</p>
          <p className="text-sm text-green-600">
            Click "Export CSV" to download your clean list.
          </p>
        </div>
      )}
    </div>
  );
}

// ============ FLAG CARD COMPONENT ============
function FlagCard({ client, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(false);
  const flags = client.reviewMessages || [];

  const hasDNC = flags.some((f) => f.category?.includes("DNC"));
  const borderColor = hasDNC ? "border-red-300" : "border-yellow-300";
  const headerBg = hasDNC ? "bg-red-50" : "bg-yellow-50";

  return (
    <div
      className={`border-2 ${borderColor} rounded-lg overflow-hidden bg-white shadow-sm`}
    >
      <div
        className={`${headerBg} px-4 py-3 flex items-center justify-between`}
      >
        <div className="flex items-center gap-4">
          <div>
            <div className="font-semibold text-gray-900">
              {client.name || "No Name"}
            </div>
            <div className="text-sm text-gray-600 flex items-center gap-3 mt-0.5">
              <span>Case #{client.caseNumber}</span>
              {client.cell && (
                <span className="flex items-center gap-1">
                  <span>📞</span>
                  {client.cell.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3")}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onApprove}
            className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors"
          >
            ✓ Approve
          </button>
          <button
            onClick={onReject}
            className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 transition-colors"
          >
            ✗ Reject
          </button>
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        {flags.map((flag, i) => (
          <FlagItem key={i} flag={flag} />
        ))}
      </div>

      {flags.some((f) => f.data) && (
        <div className="border-t">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 flex items-center justify-center gap-1 transition-colors"
          >
            {expanded ? "▲ Hide Details" : "▼ Show Full Details"}
          </button>

          {expanded && (
            <div className="px-4 pb-4 space-y-3">
              {flags.map((flag, i) =>
                flag.data ? <FlagDetails key={i} flag={flag} /> : null,
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FlagItem({ flag }) {
  const getCategoryStyle = (category) => {
    if (category?.includes("DNC"))
      return "bg-red-100 text-red-800 border-red-200";
    if (category?.includes("NEGATIVE"))
      return "bg-orange-100 text-orange-800 border-orange-200";
    if (category?.includes("ZERO"))
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    if (category?.includes("ERROR"))
      return "bg-gray-100 text-gray-800 border-gray-200";
    return "bg-blue-100 text-blue-800 border-blue-200";
  };

  const getCategoryIcon = (category) => {
    if (category?.includes("DNC")) return "🚫";
    if (category?.includes("NEGATIVE")) return "💸";
    if (category?.includes("ZERO")) return "📋";
    if (category?.includes("ERROR")) return "⚠️";
    return "📌";
  };

  return (
    <div className="flex items-start gap-2">
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-medium whitespace-nowrap ${getCategoryStyle(
          flag.category,
        )}`}
      >
        <span>{getCategoryIcon(flag.category)}</span>
        {flag.category?.replace(/_/g, " ")}
      </span>
      <span className="text-sm text-gray-700 leading-relaxed">
        {flag.message}
      </span>
    </div>
  );
}

function FlagDetails({ flag }) {
  const { data, category } = flag;
  if (!data) return null;

  return (
    <div className="bg-gray-50 rounded-lg p-3 text-sm">
      <div className="font-medium text-gray-700 mb-2 pb-2 border-b border-gray-200">
        {category?.replace(/_/g, " ")} Details
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {data.date && <DetailRow label="Date" value={data.date} />}
        {data.createdBy && (
          <DetailRow label="Created By" value={data.createdBy} />
        )}
        {data.amount !== undefined && (
          <DetailRow
            label="Amount"
            value={`$${data.amount}`}
            highlight={data.amount <= 0}
          />
        )}
        {data.matchedText && (
          <DetailRow
            label="Matched Text"
            value={`"${data.matchedText}"`}
            highlight
            fullWidth
          />
        )}
      </div>

      {data.subject && (
        <div className="mt-3 pt-2 border-t border-gray-200">
          <div className="text-xs font-medium text-gray-500 mb-1">Subject</div>
          <div className="text-gray-800">{data.subject}</div>
        </div>
      )}

      {data.description && (
        <div className="mt-3 pt-2 border-t border-gray-200">
          <div className="text-xs font-medium text-gray-500 mb-1">
            Description
          </div>
          <div className="text-gray-800">{data.description}</div>
        </div>
      )}

      {data.comment && (
        <div className="mt-3 pt-2 border-t border-gray-200">
          <div className="text-xs font-medium text-gray-500 mb-1">Comment</div>
          <div className="text-gray-800 whitespace-pre-wrap">
            {data.comment}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, highlight = false, fullWidth = false }) {
  return (
    <div className={fullWidth ? "col-span-2" : ""}>
      <span className="text-xs font-medium text-gray-500">{label}: </span>
      <span
        className={`${
          highlight ? "text-red-600 font-medium" : "text-gray-800"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
