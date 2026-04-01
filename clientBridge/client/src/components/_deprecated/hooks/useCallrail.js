import { useState } from "react";
import axios from "axios";

const useCallRail = () => {
  const [calls, setCalls] = useState([]);
  const [error, setError] = useState(null);
  const apiKey = process.env.REACT_APP_CALL_RAIL_KEY;
  const accountId = process.env.REACT_APP_CALL_RAIL_ACCOUNT_ID;
  const fetchCalls = async () => {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    let allCalls = [];
    let page = 1;
    let hasMore = true;

    try {
      while (hasMore) {
        const url = `https://api.callrail.com/v3/a/${accountId}/calls.json?date_range=yesterday&page=${page}&answered=true&min_duration=60`;

        const res = await axios.get(url, {
          headers: {
            Authorization: `Token token=${apiKey}`,
          },
        });

        const pageCalls = res.data.calls || [];
        allCalls = [...allCalls, ...pageCalls];

        if (pageCalls.length < 100) {
          hasMore = false; // No more pages
        } else {
          page++;
        }
      }

      setCalls(allCalls);
      setError(null);
    } catch (err) {
      console.error("Error fetching CallRail calls:", err);
      setError(err);
    }
  };

  const getRecordingAudio = async (callId) => {
    try {
      const response = await axios.get(`/api/calls/${callId}`, {
        responseType: "blob",
      });

      const audioUrl = URL.createObjectURL(response.data);
      return audioUrl;
    } catch (err) {
      console.error("Failed to load audio recording:", err);
      return null;
    }
  };
  const [trackingMap, setTrackingMap] = useState({});
  const mapTrackingNumbers = (trackers) => {
    const mapping = {};
    const normalizePhone = (num) => (num || "").replace(/\D/g, "");

    trackers.forEach((tracker) => {
      tracker.tracking_numbers.forEach((number) => {
        const cleaned = normalizePhone(number);
        mapping[cleaned] = tracker.name || "Unknown Line";
      });
    });
    return mapping;
  };
  const fetchTrackingNumbers = async () => {
    try {
      const res = await axios.get(
        `https://api.callrail.com/v3/a/${accountId}/trackers.json`,
        {
          headers: {
            Authorization: `Token token=${apiKey}`,
          },
        }
      );
      const mapping = mapTrackingNumbers(res.data.trackers);
      setTrackingMap(mapping);

      // save this in useState
    } catch (err) {
      console.error("Error fetching trackers:", err);
    }
  };
  return {
    calls,
    error,
    fetchCalls,
    getRecordingAudio,
    trackingMap,
    fetchTrackingNumbers, // Export this helper
  };
};

export default useCallRail;
