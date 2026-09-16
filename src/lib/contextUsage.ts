export type TokenUsage = {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  turnTokens: number | null;
  turnCachedInputTokens: number | null;
  contextTokens: number | null;
  modelContextWindow: number | null;
};

export type ContextUsageDisplay = {
  label: string;
  usedLabel: string | null;
  windowLabel: string | null;
  title: string;
  percentage: number | null;
};

export function parseThreadTokenUsage(value: unknown): TokenUsage | null {
  const usage = readObject(value);
  const total = readObject(usage.total);
  if (!hasNumericTokenBreakdown(total)) {
    return null;
  }

  const last = readObject(usage.last);
  return {
    totalTokens: readNonNegativeNumber(total.totalTokens) ?? 0,
    inputTokens: readNonNegativeNumber(total.inputTokens) ?? 0,
    cachedInputTokens: readNonNegativeNumber(total.cachedInputTokens) ?? 0,
    outputTokens: readNonNegativeNumber(total.outputTokens) ?? 0,
    reasoningOutputTokens:
      readNonNegativeNumber(total.reasoningOutputTokens) ?? 0,
    turnTokens: null,
    turnCachedInputTokens: null,
    contextTokens: readNonNegativeNumber(last.totalTokens),
    modelContextWindow: readPositiveNumber(usage.modelContextWindow),
  };
}

// A resumed engine may start a new cumulative counter. Establish its baseline
// from the first report before applying deltas; old transcript totals can belong
// to a different counter, or be absent when history has not been loaded.
export function resolveTokenUsageBaseline(
  value: unknown,
  baseline: { total: number | null; cachedInput: number | null },
) {
  const usage = readObject(value);
  const total = readObject(usage.total);
  const last = readObject(usage.last);
  const totalTokens = readNonNegativeNumber(total.totalTokens);
  const lastTokens = readNonNegativeNumber(last.totalTokens);
  const counterRestarted = totalTokens !== null && totalTokens === lastTokens;
  const needsBaseline =
    baseline.total === null ||
    (totalTokens !== null && totalTokens < baseline.total);
  if (!counterRestarted && !needsBaseline) return baseline;

  const inferBaseline = (current: unknown, recent: unknown) => {
    const currentCount = readNonNegativeNumber(current);
    const recentCount = readNonNegativeNumber(recent);
    return currentCount !== null && recentCount !== null && currentCount >= recentCount
      ? currentCount - recentCount
      : null;
  };
  return {
    total: counterRestarted ? 0 : inferBaseline(total.totalTokens, last.totalTokens),
    cachedInput: counterRestarted
      ? 0
      : inferBaseline(total.cachedInputTokens, last.cachedInputTokens),
  };
}

export function getContextUsageDisplay(
  tokenUsage: TokenUsage | null,
  fallbackContextWindow: number,
  defaultContextWindow: number,
): ContextUsageDisplay {
  if (!tokenUsage) {
    const windowSize =
      fallbackContextWindow > 0 ? fallbackContextWindow : defaultContextWindow;
    return {
      label: `0 / ${windowSize.toLocaleString()} (0%)`,
      usedLabel: "0",
      windowLabel: windowSize.toLocaleString(),
      title: `No runtime usage reported yet; expected context window is ${windowSize.toLocaleString()} tokens`,
      percentage: 0,
    };
  }

  if (tokenUsage.contextTokens === null) {
    return {
      label: "Context unavailable",
      usedLabel: null,
      windowLabel: null,
      title: `${tokenUsage.totalTokens.toLocaleString()} cumulative tokens reported; current context size was not reported`,
      percentage: null,
    };
  }

  const used = tokenUsage.contextTokens.toLocaleString();
  const windowSize = tokenUsage.modelContextWindow;
  if (!windowSize) {
    return {
      label: `${used} context tokens`,
      usedLabel: used,
      windowLabel: null,
      title: `${used} tokens in the active context; context-window size was not reported`,
      percentage: null,
    };
  }

  const percentage = Math.max(
    0,
    Math.min(100, Math.round((tokenUsage.contextTokens / windowSize) * 100)),
  );
  return {
    label: `${used} / ${windowSize.toLocaleString()} (${percentage}%)`,
    usedLabel: used,
    windowLabel: windowSize.toLocaleString(),
    title: `${used} of ${windowSize.toLocaleString()} tokens in the active context, reported by Codex`,
    percentage,
  };
}

function hasNumericTokenBreakdown(value: Record<string, unknown>) {
  return [
    value.totalTokens,
    value.inputTokens,
    value.cachedInputTokens,
    value.outputTokens,
    value.reasoningOutputTokens,
  ].some((candidate) => readNonNegativeNumber(candidate) !== null);
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readNonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function readPositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}
