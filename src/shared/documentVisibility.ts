import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

export function isDocumentVisible() {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function subscribeDocumentVisibility(listener: () => void) {
  if (listeners.size === 0 && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", notify);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", notify);
    }
  };
}

export function useDocumentVisible() {
  return useSyncExternalStore(subscribeDocumentVisibility, isDocumentVisible, () => true);
}
