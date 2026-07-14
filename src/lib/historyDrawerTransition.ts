export type HistoryDrawerPhase =
  | "closed"
  | "preparing"
  | "opening"
  | "open"
  | "releasing"
  | "closing-ready"
  | "closing";

export function historyDrawerReservesSpace(phase: HistoryDrawerPhase) {
  return phase === "open";
}

export function historyDrawerInputAnimating(phase: HistoryDrawerPhase) {
  return (
    phase === "preparing" ||
    phase === "opening" ||
    phase === "closing-ready" ||
    phase === "closing"
  );
}

export function historyDrawerInputContracted(phase: HistoryDrawerPhase) {
  return (
    phase === "opening" ||
    phase === "releasing" ||
    phase === "closing-ready"
  );
}

export function historyDrawerIsVisible(phase: HistoryDrawerPhase) {
  return phase !== "closed";
}
