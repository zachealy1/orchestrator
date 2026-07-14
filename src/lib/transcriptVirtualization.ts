import type { RunViewState } from "./codexEventReducer";
import type { HistoryTurnHint } from "../types";

const TRANSCRIPT_WIDTH_BUCKET_PX = 32;
const TRANSCRIPT_MEASUREMENT_CACHE_LIMIT = 4_000;
const MIN_TRANSCRIPT_ROW_HEIGHT_PX = 180;
const APPROXIMATE_CHARACTER_WIDTH_PX = 8.2;
const APPROXIMATE_LINE_HEIGHT_PX = 24;
const MAX_TRANSCRIPT_DEFAULT_ROW_HEIGHT_PX = 1_400;

export type TranscriptGeometryEntry = {
  clientId: string;
  prompt: string;
  status: RunViewState["status"];
  runView: RunViewState;
};

const transcriptMeasurementCache = new Map<string, number>();
let transcriptEntryFingerprints = new WeakMap<TranscriptGeometryEntry, string>();

export function getTranscriptWidthBucket(width: number) {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1_024;
  return Math.max(
    TRANSCRIPT_WIDTH_BUCKET_PX,
    Math.round(safeWidth / TRANSCRIPT_WIDTH_BUCKET_PX) *
      TRANSCRIPT_WIDTH_BUCKET_PX,
  );
}

export function buildTranscriptMeasurementKey(
  entry: TranscriptGeometryEntry,
  width: number,
  scope = "global",
) {
  return [
    scope,
    entry.clientId,
    getTranscriptWidthBucket(width),
    getTranscriptEntryFingerprint(entry),
  ].join(":");
}

export function getCachedTranscriptRowHeight(
  entry: TranscriptGeometryEntry,
  width: number,
  scope = "global",
) {
  const key = buildTranscriptMeasurementKey(entry, width, scope);
  const cached = transcriptMeasurementCache.get(key);
  if (cached === undefined) {
    return undefined;
  }

  transcriptMeasurementCache.delete(key);
  transcriptMeasurementCache.set(key, cached);
  return cached;
}

export function cacheTranscriptRowHeight(
  entry: TranscriptGeometryEntry,
  width: number,
  height: number,
  scope = "global",
) {
  if (!Number.isFinite(height) || height <= 0) {
    return;
  }

  const key = buildTranscriptMeasurementKey(entry, width, scope);
  transcriptMeasurementCache.delete(key);
  transcriptMeasurementCache.set(key, Math.ceil(height));

  while (transcriptMeasurementCache.size > TRANSCRIPT_MEASUREMENT_CACHE_LIMIT) {
    const oldestKey = transcriptMeasurementCache.keys().next().value;
    if (typeof oldestKey !== "string") {
      break;
    }
    transcriptMeasurementCache.delete(oldestKey);
  }
}

export function estimateTranscriptRowHeight(
  entry: TranscriptGeometryEntry,
  width: number,
  scope = "global",
) {
  const cached = getCachedTranscriptRowHeight(entry, width, scope);
  if (cached !== undefined) {
    return cached;
  }

  const contentWidth = Math.max(280, Math.min(1_040, width) - 72);
  const charactersPerLine = Math.max(
    28,
    Math.floor(contentWidth / APPROXIMATE_CHARACTER_WIDTH_PX),
  );
  const runView = entry.runView;
  const assistantText =
    runView.finalMessage ||
    runView.error ||
    runView.streamEvents.map((event) => event.text).join("\n");
  const promptLines = estimateWrappedLineCount(entry.prompt, charactersPerLine);
  const assistantLines = estimateWrappedLineCount(
    assistantText,
    charactersPerLine,
  );
  const activityRows =
    Number(runView.commands.length > 0) +
    Number(runView.editedFiles.length > 0);
  const approvalHeight = runView.approvalRequests.reduce(
    (height, request) =>
      height + 170 + Math.ceil(request.choices.length / 2) * 58,
    0,
  );
  const traceRows =
    runView.streamEvents.length > 0 ||
    runView.latestPlan.length > 0 ||
    runView.latestDiff.length > 0
      ? 1
      : 0;

  return Math.max(
    MIN_TRANSCRIPT_ROW_HEIGHT_PX,
    104 +
      promptLines * APPROXIMATE_LINE_HEIGHT_PX +
      assistantLines * APPROXIMATE_LINE_HEIGHT_PX +
      activityRows * 34 +
      approvalHeight +
      traceRows * 34,
  );
}

export function calculateTranscriptDefaultItemHeight(
  entries: TranscriptGeometryEntry[],
  width: number,
  scope = "global",
) {
  if (entries.length === 0) {
    return MIN_TRANSCRIPT_ROW_HEIGHT_PX;
  }

  const estimates = entries
    .map((entry) => estimateTranscriptRowHeight(entry, width, scope))
    .sort((left, right) => left - right);
  const trimCount = estimates.length >= 10 ? Math.floor(estimates.length * 0.1) : 0;
  const trimmed = estimates.slice(trimCount, estimates.length - trimCount);
  const average =
    trimmed.reduce((total, estimate) => total + estimate, 0) /
    Math.max(1, trimmed.length);

  return Math.max(
    MIN_TRANSCRIPT_ROW_HEIGHT_PX,
    Math.min(MAX_TRANSCRIPT_DEFAULT_ROW_HEIGHT_PX, Math.round(average)),
  );
}

export function estimateHistoryPlaceholderHeight(
  hint: HistoryTurnHint | undefined,
  width: number,
) {
  if (!hint) {
    return MIN_TRANSCRIPT_ROW_HEIGHT_PX;
  }

  const contentWidth = Math.max(280, Math.min(1_040, width) - 72);
  const charactersPerLine = Math.max(
    28,
    Math.floor(contentWidth / APPROXIMATE_CHARACTER_WIDTH_PX),
  );
  const promptLines = Math.max(
    hint.promptLines,
    Math.ceil(hint.promptCharacters / charactersPerLine),
  );
  const responseLines = Math.max(
    hint.responseLines,
    Math.ceil(hint.responseCharacters / charactersPerLine),
  );

  return Math.max(
    MIN_TRANSCRIPT_ROW_HEIGHT_PX,
    104 +
      promptLines * APPROXIMATE_LINE_HEIGHT_PX +
      responseLines * APPROXIMATE_LINE_HEIGHT_PX,
  );
}

export function clearTranscriptMeasurementCache() {
  transcriptMeasurementCache.clear();
  transcriptEntryFingerprints = new WeakMap<TranscriptGeometryEntry, string>();
}

function getTranscriptEntryFingerprint(entry: TranscriptGeometryEntry) {
  const existing = transcriptEntryFingerprints.get(entry);
  if (existing !== undefined) {
    return existing;
  }

  const runView = entry.runView;
  const parts = [
    entry.status,
    entry.prompt,
    runView.finalMessage,
    runView.error ?? "",
    ...runView.streamEvents.flatMap((event) => [event.kind, event.text]),
    ...runView.commands.flatMap((command) => [
      command.id,
      command.command,
      command.status,
      command.output,
    ]),
    ...runView.editedFiles.flatMap((file) => [
      file.path,
      file.status,
      String(file.additions),
      String(file.deletions),
    ]),
    ...runView.approvalRequests.flatMap((request) => [
      request.key,
      request.status,
      request.selectedChoiceId ?? "",
      request.error ?? "",
      ...request.choices.flatMap((choice) => [
        choice.id,
        choice.label,
        choice.description,
      ]),
    ]),
    ...Object.entries(runView.approvalResourcesByItemId).flatMap(
      ([itemId, resources]) => [itemId, ...resources],
    ),
    runView.latestPlan,
    runView.latestDiff,
  ];
  let hash = 2_166_136_261;
  parts.forEach((part) => {
    for (let index = 0; index < part.length; index += 1) {
      hash ^= part.charCodeAt(index);
      hash = Math.imul(hash, 16_777_619);
    }
    hash ^= 0xff;
    hash = Math.imul(hash, 16_777_619);
  });
  const fingerprint = (hash >>> 0).toString(36);
  transcriptEntryFingerprints.set(entry, fingerprint);
  return fingerprint;
}

function estimateWrappedLineCount(text: string, charactersPerLine: number) {
  if (!text) {
    return 0;
  }

  return text.split("\n").reduce((total, line) => {
    const visibleCharacters = line.replace(/\s+$/u, "").length;
    return total + Math.max(1, Math.ceil(visibleCharacters / charactersPerLine));
  }, 0);
}
