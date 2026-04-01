// components/layout/ToastContainer.js
import React from "react";
import { useToast } from "../../hooks/useToast";

export default function ToastContainer() {
  const { notification, dismiss } = useToast();

  if (!notification) return null;

  return (
    <div className="toast-container">
      <div className={`toast-item ${notification.type}`}>
        <div>
          <div className="toast-title">{notification.title}</div>
          {notification.msg && <div className="toast-msg">{notification.msg}</div>}
        </div>
        <button className="toast-close" onClick={dismiss}>
          &times;
        </button>
      </div>
    </div>
  );
}
