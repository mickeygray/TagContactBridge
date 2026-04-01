// hooks/useSystemLog.js
// Subscribes to the backend SSE log stream.
// Errors/warnings auto-fire toast notifications.
// Exposes log history for the debug panel.

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "../utils/toast";

const MAX_ENTRIES = 500;

export function useSystemLog() {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState(null);
  const eventSourceRef = useRef(null);

  // Connect to SSE stream
  useEffect(() => {
    const es = new EventSource("/api/logs/stream", { withCredentials: true });
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const entry = JSON.parse(event.data);

        setLogs((prev) => {
          const next = [entry, ...prev];
          return next.length > MAX_ENTRIES ? next.slice(0, MAX_ENTRIES) : next;
        });

        // Surface errors and warnings as toasts
        if (entry.level === "error") {
          toast.error(
            `${entry.bridge} ${entry.category}`,
            entry.message
          );
        } else if (entry.level === "warn") {
          toast.info(
            `${entry.bridge} ${entry.category}`,
            entry.message
          );
        }
      } catch { /* malformed SSE data, ignore */ }
    };

    es.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnects
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  return { logs, connected, stats, setStats, clearLogs };
}
