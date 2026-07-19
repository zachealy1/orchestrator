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
