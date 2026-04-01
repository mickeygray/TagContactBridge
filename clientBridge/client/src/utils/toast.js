// utils/toast.js — simple pub/sub for notifications
let listeners = [];

export const toast = {
  success: (title, msg) =>
    listeners.forEach((fn) => fn({ type: "success", title, msg })),
  error: (title, msg) =>
    listeners.forEach((fn) => fn({ type: "error", title, msg })),
  info: (title, msg) =>
    listeners.forEach((fn) => fn({ type: "info", title, msg })),
  subscribe: (fn) => {
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((l) => l !== fn);
    };
  },
};
