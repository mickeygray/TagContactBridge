// hooks/useCxAgent.js
// ─────────────────────────────────────────────────────────────
// Agent widget hook for CX platform control.
// Provides: status, setAvailable, setUnavailable, markDnc, freezeProspect
//
// This is what the minimal agent widget consumes — either as
// a standalone page (/agent) or a Chrome extension popup.
// ─────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "../utils/api";
import { toast } from "../utils/toast";

export function useCxAgent(extensionId) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    if (!extensionId) return;
    try {
      const res = await api.get(`/ringbridge/cx/agent/${extensionId}/status`);
      setStatus(res.data);
    } catch {
      // Agent not mapped or ringBridge down
      setStatus(null);
    }
  }, [extensionId]);

  // Poll status every 10s
  useEffect(() => {
    if (!extensionId) return;
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 10000);
    return () => clearInterval(pollRef.current);
  }, [extensionId, fetchStatus]);

  const setAvailable = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.post(`/ringbridge/cx/agent/${extensionId}/available`);
      setStatus((prev) => prev ? { ...prev, ...res.data } : res.data);
      toast.success("Status", "Set to Available");
    } catch (err) {
      toast.error("Status", err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [extensionId]);

  const setUnavailable = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.post(`/ringbridge/cx/agent/${extensionId}/unavailable`);
      setStatus((prev) => prev ? { ...prev, ...res.data } : res.data);
      toast.success("Status", "Set to Unavailable");
    } catch (err) {
      toast.error("Status", err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [extensionId]);

  const markDnc = useCallback(async (phone, company) => {
    setLoading(true);
    try {
      await api.post("/ringbridge/cx/agent/dnc", { phone, company });
      toast.success("DNC", `${phone} marked Do Not Contact`);
    } catch (err) {
      toast.error("DNC", err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const freezeProspect = useCallback(async (phone, company) => {
    setLoading(true);
    try {
      await api.post("/ringbridge/cx/agent/freeze", { phone, company });
      toast.success("Frozen", `${phone} outreach paused`);
    } catch (err) {
      toast.error("Freeze", err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    status,
    loading,
    setAvailable,
    setUnavailable,
    markDnc,
    freezeProspect,
    refresh: fetchStatus,
  };
}
