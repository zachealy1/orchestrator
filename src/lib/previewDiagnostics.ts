export type PreviewDiagnosticStage =
  | "native-transfer-started"
  | "native-transfer-completed"
  | "worker-started"
  | "grammar-loading"
  | "grammar-ready"
  | "tokenization-started"
  | "tokenization-completed"
  | "request-started"
  | "worker-completed"
  | "stable-paint"
  | "rendered-range"
  | "geometry-error"
  | "long-task";

export type PreviewDiagnostic = {
  identity: string;
  stage: PreviewDiagnosticStage;
  elapsedMs?: number;
  durationMs?: number;
  rowCount?: number;
  firstRow?: number;
  lastRow?: number;
  gapCount?: number;
  overlapCount?: number;
};

const starts = new Map<string, number>();

export function recordPreviewDiagnostic(diagnostic: PreviewDiagnostic) {
  if (!import.meta.env.DEV || typeof performance === "undefined") {
    return;
  }
  if (
    diagnostic.stage === "request-started" ||
    diagnostic.stage === "native-transfer-started" ||
    diagnostic.stage === "grammar-loading" ||
    diagnostic.stage === "tokenization-started"
  ) {
    starts.set(diagnostic.identity, performance.now());
  }
  const startedAt = starts.get(diagnostic.identity);
  const detail = {
    ...diagnostic,
    elapsedMs:
      diagnostic.elapsedMs ??
      (startedAt === undefined ? undefined : performance.now() - startedAt),
  };
  if (
    diagnostic.stage === "stable-paint" ||
    diagnostic.stage === "native-transfer-completed" ||
    diagnostic.stage === "grammar-ready" ||
    diagnostic.stage === "tokenization-completed"
  ) {
    starts.delete(diagnostic.identity);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<PreviewDiagnostic>("orchestrator:preview-diagnostic", {
        detail,
      }),
    );
  }
}

export function recordPreviewGeometry(
  identity: string,
  container: Element,
  rowSelector: string,
) {
  if (!import.meta.env.DEV) return;
  const rows = [...container.querySelectorAll<HTMLElement>(rowSelector)]
    .map((row) => ({
      index: Number.parseInt(row.dataset.index ?? "", 10),
      rect: row.getBoundingClientRect(),
    }))
    .filter((row) => Number.isFinite(row.index))
    .sort((left, right) => left.index - right.index);
  let gapCount = 0;
  let overlapCount = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const distance = rows[index].rect.top - rows[index - 1].rect.bottom;
    if (distance > 0.5) gapCount += 1;
    if (distance < -0.5) overlapCount += 1;
  }
  recordPreviewDiagnostic({
    identity,
    stage: gapCount || overlapCount ? "geometry-error" : "rendered-range",
    rowCount: rows.length,
    firstRow: rows[0]?.index,
    lastRow: rows[rows.length - 1]?.index,
    gapCount,
    overlapCount,
  });
}

let observingLongTasks = false;

export function startPreviewLongTaskDiagnostics() {
  if (
    observingLongTasks ||
    !import.meta.env.DEV ||
    typeof PerformanceObserver === "undefined"
  ) {
    return;
  }
  const supported = PerformanceObserver.supportedEntryTypes ?? [];
  if (!supported.includes("longtask")) return;
  observingLongTasks = true;
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      recordPreviewDiagnostic({
        identity: "preview-main-thread",
        stage: "long-task",
        durationMs: entry.duration,
      });
    }
  });
  observer.observe({ entryTypes: ["longtask"] });
}
