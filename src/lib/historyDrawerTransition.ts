export type HistoryDrawerPhase =
  | "closed"
  | "opening"
  | "open"
  | "closing";

export function historyDrawerReservesSpace(phase: HistoryDrawerPhase) {
  return phase === "opening" || phase === "open";
}

export function historyDrawerTargetsOpen(phase: HistoryDrawerPhase) {
  return phase === "opening" || phase === "open";
}

export function historyDrawerIsVisible(phase: HistoryDrawerPhase) {
  return phase !== "closed";
}
