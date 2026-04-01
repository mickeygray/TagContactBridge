// hooks/useToast.js — replaces MessageState + MessageContext
import { useState, useEffect } from "react";
import { toast } from "../utils/toast";

export function useToast() {
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    return toast.subscribe((n) => {
      setNotification(n);
      // Auto-dismiss after 8 seconds
      setTimeout(() => setNotification(null), 8000);
    });
  }, []);

  const dismiss = () => setNotification(null);

  return { notification, dismiss };
}
