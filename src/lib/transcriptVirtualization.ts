import type { RunViewState } from "./codexEventReducer";
import type { HistoryTurnHint } from "../types";

const TRANSCRIPT_WIDTH_BUCKET_PX = 32;
const TRANSCRIPT_MEASUREMENT_CACHE_LIMIT = 4_000;
const MIN_TRANSCRIPT_ROW_HEIGHT_PX = 180;
const APPROXIMATE_CHARACTER_WIDTH_PX = 8.2;
const APPROXIMATE_LINE_HEIGHT_PX = 24;

export type TranscriptGeometryEntry = {
  clientId: string;
  prompt: string;
  status: RunViewState["status"];
  runView: RunViewState;
};

const transcriptMeasurementCache = new Map<string, number>();
let transcriptEntryRevisions = new WeakMap<TranscriptGeometryEntry, number>();
let nextTranscriptEntryRevision = 1;

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
) {
  const runView = entry.runView;
  const streamTextLength = runView.streamEvents.reduce(
    (total, event) => total + event.text.length,
    0,
  );
  const commandTextLength = runView.commands.reduce(
    (total, command) => total + command.command.length + command.output.length,
    0,
  );

  return [
    entry.clientId,
    getTranscriptWidthBucket(width),
    getTranscriptEntryRevision(entry),
    entry.status,
    entry.prompt.length,
    runView.finalMessage.length,
    runView.error?.length ?? 0,
    runView.streamEvents.length,
    streamTextLength,
    runView.commands.length,
    commandTextLength,
    runView.editedFiles.length,
    runView.serverRequests.length,
    runView.latestPlan.length,
    runView.latestDiff.length,
  ].join(":");
}

export function getCachedTranscriptRowHeight(
  entry: TranscriptGeometryEntry,
  width: number,
) {
  const key = buildTranscriptMeasurementKey(entry, width);
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
) {
  if (!Number.isFinite(height) || height <= 0) {
    return;
  }

  const key = buildTranscriptMeasurementKey(entry, width);
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
) {
  const cached = getCachedTranscriptRowHeight(entry, width);
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
    Number(runView.editedFiles.length > 0) +
    Number(runView.serverRequests.length > 0);
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
      traceRows * 34,
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
  transcriptEntryRevisions = new WeakMap<TranscriptGeometryEntry, number>();
  nextTranscriptEntryRevision = 1;
}

function getTranscriptEntryRevision(entry: TranscriptGeometryEntry) {
  const existing = transcriptEntryRevisions.get(entry);
  if (existing !== undefined) {
    return existing;
  }

  const revision = nextTranscriptEntryRevision;
  nextTranscriptEntryRevision += 1;
  transcriptEntryRevisions.set(entry, revision);
  return revision;
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
