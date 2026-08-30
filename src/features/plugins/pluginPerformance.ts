type PluginPerformanceMark = {
  name: string;
  at: number;
  detail?: Record<string, unknown>;
};

type PluginLogoSnapshot = {
  activeCount: number;
  queuedCount: number;
  retainedCount: number;
  requestedUrls: readonly string[];
  completedUrls: readonly string[];
};

export type PluginFrameSample = {
  label: string;
  frameBudgetMs: number;
  frameCount: number;
  withinBudgetPercent: number;
  p95Ms: number;
  maxMs: number;
  stallsOver50Ms: number;
};

export type PluginPerformanceSnapshot = {
  marks: readonly PluginPerformanceMark[];
  cardRenders: Readonly<Record<string, number>>;
  logoPreloader: PluginLogoSnapshot | null;
  frameBudgetMs: number | null;
  frameSamples: readonly PluginFrameSample[];
};

export type PluginPerformanceProbe = {
  calibrateFrameBudget: (durationMs?: number) => Promise<number>;
  reset: () => void;
  snapshot: () => PluginPerformanceSnapshot;
  startFrameSample: (
    label: string,
    durationMs?: number,
  ) => Promise<PluginFrameSample>;
};

type PluginPerformanceStore = {
  marks: PluginPerformanceMark[];
  cardRenders: Map<string, number>;
  frameBudgetMs: number | null;
  frameSamples: PluginFrameSample[];
  logoSnapshot: (() => PluginLogoSnapshot) | null;
};

declare global {
  interface Window {
    __orchestratorPluginPerformance?: PluginPerformanceProbe;
  }
}

const enabled =
  import.meta.env.DEV || import.meta.env.VITE_PLUGIN_PERFORMANCE === "1";
const store: PluginPerformanceStore = {
  marks: [],
  cardRenders: new Map(),
  frameBudgetMs: null,
  frameSamples: [],
  logoSnapshot: null,
};

export function isPluginPerformanceEnabled() {
  return enabled;
}

export function markPluginPerformance(
  name: string,
  detail?: Record<string, unknown>,
) {
  if (!enabled || typeof performance === "undefined") return;
  const at = performance.now();
  store.marks.push({ name, at, detail });
  try {
    performance.mark(`orchestrator.plugins.${name}`, { detail });
  } catch {
    performance.mark(`orchestrator.plugins.${name}`);
  }
}

export function recordPluginCardRender(pluginId: string) {
  if (!enabled) return;
  store.cardRenders.set(pluginId, (store.cardRenders.get(pluginId) ?? 0) + 1);
}

export function registerPluginLogoSnapshot(
  readSnapshot: () => PluginLogoSnapshot,
) {
  if (!enabled) return;
  store.logoSnapshot = readSnapshot;
}

function snapshot(): PluginPerformanceSnapshot {
  return {
    marks: [...store.marks],
    cardRenders: Object.fromEntries(store.cardRenders),
    logoPreloader: store.logoSnapshot?.() ?? null,
    frameBudgetMs: store.frameBudgetMs,
    frameSamples: [...store.frameSamples],
  };
}

function reset() {
  store.marks.length = 0;
  store.cardRenders.clear();
  store.frameSamples.length = 0;
}

async function calibrateFrameBudget(durationMs = 600) {
  const intervals = await collectFrameIntervals(durationMs);
  const stableIntervals = intervals.filter((interval) => interval < 50).sort(
    (left, right) => left - right,
  );
  const frameBudgetMs = percentile(stableIntervals, 0.5) || 1000 / 60;
  store.frameBudgetMs = frameBudgetMs;
  return frameBudgetMs;
}

async function startFrameSample(label: string, durationMs = 10_000) {
  const intervals = await collectFrameIntervals(durationMs);
  const frameBudgetMs = store.frameBudgetMs ?? (await calibrateFrameBudget());
  const permittedInterval = frameBudgetMs * 1.2;
  const sorted = [...intervals].sort((left, right) => left - right);
  const sample: PluginFrameSample = {
    label,
    frameBudgetMs,
    frameCount: intervals.length,
    withinBudgetPercent:
      intervals.length === 0
        ? 0
        : (intervals.filter((interval) => interval <= permittedInterval).length /
            intervals.length) *
          100,
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted[sorted.length - 1] ?? 0,
    stallsOver50Ms: intervals.filter((interval) => interval > 50).length,
  };
  store.frameSamples.push(sample);
  return sample;
}

function collectFrameIntervals(durationMs: number) {
  return new Promise<number[]>((resolve) => {
    const intervals: number[] = [];
    const startedAt = performance.now();
    let previous = startedAt;
    const sample = (now: number) => {
      intervals.push(now - previous);
      previous = now;
      if (now - startedAt >= durationMs) {
        resolve(intervals.slice(1));
        return;
      }
      window.requestAnimationFrame(sample);
    };
    window.requestAnimationFrame(sample);
  });
}

function percentile(values: readonly number[], ratio: number) {
  if (values.length === 0) return 0;
  return values[Math.min(values.length - 1, Math.floor(values.length * ratio))];
}

if (enabled && typeof window !== "undefined") {
  window.__orchestratorPluginPerformance = {
    calibrateFrameBudget,
    reset,
    snapshot,
    startFrameSample,
  };
}
