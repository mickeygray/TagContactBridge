import React, { useState } from "react";
import useCallRail from "../../../hooks/useCallrail"; // Assuming it's in hooks

const CallCard = ({ call, onDelete }) => {
  const { getRecordingAudio } = useCallRail(); // grab the new helper
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  const copyNumber = () => {
    navigator.clipboard.writeText(call.customer_phone_number);
    alert("Phone number copied to clipboard");
  };

  const handleLoadRecording = async () => {
    setLoading(true);
    const url = await getRecordingAudio(call.id); // use backend proxy
    setAudioUrl(url);
    setLoading(false);
  };
  const formatDuration = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    return [
      h > 0 ? `${h}h` : null,
      m > 0 ? `${m}m` : h > 0 ? "0m" : null,
      `${s}s`,
    ]
      .filter(Boolean)
      .join(" ");
  };

  return (
    <div className="card call-card">
      <div className="call-header">
        <strong>{call.customer_name || "Unknown Caller"}</strong>
        <button onClick={() => onDelete(call.id)} className="delete-button">
          ❌
        </button>
      </div>

      <p>
        📞 <strong>{call.customer_phone_number}</strong>
      </p>
      <p>📆 {new Date(call.start_time).toLocaleString()}</p>
      <p>🕓 Duration: {formatDuration(call.duration)}</p>
      <p>📡 Line: {call.lineName}</p>

      {!audioUrl && (
        <button
          className="btn btn-outline mt-1"
          onClick={handleLoadRecording}
          disabled={loading}
        >
          {loading ? "Loading..." : "Load Recording"}
        </button>
      )}

      {audioUrl && (
        <audio controls src={audioUrl} className="mt-1">
          Your browser does not support the audio element.
        </audio>
      )}

      <button className="btn btn-outline mt-1" onClick={copyNumber}>
        Copy Number
      </button>
    </div>
  );
};

export default CallCard;
