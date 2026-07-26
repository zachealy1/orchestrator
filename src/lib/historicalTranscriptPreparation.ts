import type {
  HistoricalMarkdownWorkerRequest,
  HistoricalMarkdownWorkerResponse,
  PreparedHistoricalSummary,
} from "../types";
import {
  hashHistoricalMarkdown,
  renderHistoricalMarkdown,
} from "./historicalMarkdown";

const DEFAULT_PREPARED_CHAT_LIMIT = 5;
const DEFAULT_SOURCE_CHARACTER_BUDGET = 2_000_000;
const DEFAULT_WORKER_TIMEOUT_MS = 5_000;
export const HISTORICAL_RENDER_PIPELINE_VERSION = "prepared-html-v1";

type HistoricalPreparationEntry = {
  clientId: string;
  runView: {
    finalMessage: string;
  };
  preparedSummary?: PreparedHistoricalSummary;
};

type PreparedHistoricalEntry<T extends HistoricalPreparationEntry> = T & {
  preparedSummary: PreparedHistoricalSummary;
};

type WorkerLike = {
  onmessage: ((event: MessageEvent<HistoricalMarkdownWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: HistoricalMarkdownWorkerRequest): void;
  terminate(): void;
};

type PreparedTranscriptCacheEntry = {
  sourceCharacters: number;
  summaries: Map<string, PreparedHistoricalSummary>;
};

type ActivePreparation = {
  generationId: string;
  worker: WorkerLike;
  reject: (reason: Error) => void;
};

type HistoricalTranscriptPreparerOptions = {
  createWorker?: () => WorkerLike | null;
  renderMarkdown?: (markdown: string) => Promise<string>;
  maxChats?: number;
  maxSourceCharacters?: number;
  workerTimeoutMs?: number;
};

function createBrowserWorker(): WorkerLike | null {
  if (typeof Worker === "undefined") return null;
  return new Worker(
    new URL("../workers/historicalMarkdown.worker.ts", import.meta.url),
    { type: "module" },
  );
}

function abortError() {
  const error = new Error("Historical transcript preparation was cancelled.");
  error.name = "AbortError";
  return error;
}

function plainSummary(markdown: string, sourceHash: string): PreparedHistoricalSummary {
  return { kind: "plain", text: markdown, sourceHash };
}

export class HistoricalTranscriptPreparer {
  private readonly createWorker: () => WorkerLike | null;
  private readonly renderMarkdown: (markdown: string) => Promise<string>;
  private readonly maxChats: number;
  private readonly maxSourceCharacters: number;
  private readonly workerTimeoutMs: number;
  private readonly cache = new Map<string, PreparedTranscriptCacheEntry>();
  private active: ActivePreparation | null = null;
  private generationSequence = 0;

  constructor(options: HistoricalTranscriptPreparerOptions = {}) {
    this.createWorker = options.createWorker ?? createBrowserWorker;
    this.renderMarkdown = options.renderMarkdown ?? renderHistoricalMarkdown;
    this.maxChats = options.maxChats ?? DEFAULT_PREPARED_CHAT_LIMIT;
    this.maxSourceCharacters =
      options.maxSourceCharacters ?? DEFAULT_SOURCE_CHARACTER_BUDGET;
    this.workerTimeoutMs = options.workerTimeoutMs ?? DEFAULT_WORKER_TIMEOUT_MS;
  }

  async prepare<T extends HistoricalPreparationEntry>(
    entries: T[],
    transcriptKey: string,
    signal?: AbortSignal,
  ): Promise<PreparedHistoricalEntry<T>[]> {
    if (signal?.aborted) throw abortError();

    const sources = entries.map((entry) => {
      const markdown = entry.runView.finalMessage;
      return {
        entryId: entry.clientId,
        markdown,
        sourceHash: hashHistoricalMarkdown(markdown),
      };
    });
    const cached = this.readCache(transcriptKey, sources);
    if (cached) {
      return this.applySummaries(entries, cached);
    }

    this.cancel();
    const worker = this.createWorker();
    if (!worker) {
      return await this.prepareWithoutWorker(
        entries,
        sources,
        transcriptKey,
        signal,
      );
    }

    const generationId = `historical-render-${++this.generationSequence}`;
    const request: HistoricalMarkdownWorkerRequest = {
      type: "prepare",
      generationId,
      transcriptKey,
      turns: sources,
    };

    return await new Promise<PreparedHistoricalEntry<T>[]>((resolve, reject) => {
      let settled = false;
      let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
      const finish = () => {
        if (settled) return false;
        settled = true;
        if (timeoutId !== null) {
          globalThis.clearTimeout(timeoutId);
          timeoutId = null;
        }
        signal?.removeEventListener("abort", handleAbort);
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
        if (this.active?.generationId === generationId) {
          this.active = null;
        }
        return true;
      };
      const resolveFallback = () => {
        if (!finish()) return;
        void this.prepareWithoutWorker(
          entries,
          sources,
          transcriptKey,
          signal,
        ).then(resolve, reject);
      };
      const handleAbort = () => {
        if (!finish()) return;
        reject(abortError());
      };

      worker.onmessage = (event) => {
        const response = event.data;
        if (
          response.type === "prepared" &&
          response.generation.generationId === generationId
        ) {
          if (!finish()) return;
          const summaries = new Map(
            response.generation.turns.map((turn) => [turn.entryId, turn.summary]),
          );
          const completeSummaries = new Map<string, PreparedHistoricalSummary>();
          sources.forEach((source) => {
            const prepared = summaries.get(source.entryId);
            completeSummaries.set(
              source.entryId,
              prepared?.sourceHash === source.sourceHash
                ? prepared
                : plainSummary(source.markdown, source.sourceHash),
            );
          });
          this.writeCache(transcriptKey, {
            sourceCharacters: response.generation.sourceCharacters,
            summaries: completeSummaries,
          });
          resolve(this.applySummaries(entries, completeSummaries));
          return;
        }

        if (response.type === "error" && response.generationId === generationId) {
          resolveFallback();
        }
      };
      worker.onerror = () => resolveFallback();
      this.active = {
        generationId,
        worker,
        reject: (reason) => {
          if (!finish()) return;
          reject(reason);
        },
      };
      signal?.addEventListener("abort", handleAbort, { once: true });
      timeoutId = globalThis.setTimeout(resolveFallback, this.workerTimeoutMs);

      try {
        worker.postMessage(request);
      } catch {
        resolveFallback();
      }
    });
  }

  cancel() {
    const active = this.active;
    if (!active) return;
    this.active = null;
    active.reject(abortError());
  }

  clear() {
    this.cancel();
    this.cache.clear();
  }

  getCacheStats() {
    return {
      chats: this.cache.size,
      sourceCharacters: [...this.cache.values()].reduce(
        (total, entry) => total + entry.sourceCharacters,
        0,
      ),
    };
  }

  private readCache(
    transcriptKey: string,
    sources: Array<{ entryId: string; sourceHash: string }>,
  ) {
    const cached = this.cache.get(transcriptKey);
    if (
      !cached ||
      sources.some(
        (source) => cached.summaries.get(source.entryId)?.sourceHash !== source.sourceHash,
      )
    ) {
      return null;
    }
    this.cache.delete(transcriptKey);
    this.cache.set(transcriptKey, cached);
    return cached.summaries;
  }

  private writeCache(transcriptKey: string, entry: PreparedTranscriptCacheEntry) {
    this.cache.delete(transcriptKey);
    if (entry.sourceCharacters > this.maxSourceCharacters) return;
    this.cache.set(transcriptKey, entry);

    while (
      this.cache.size > this.maxChats ||
      this.getCacheStats().sourceCharacters > this.maxSourceCharacters
    ) {
      const oldestKey = this.cache.keys().next().value;
      if (typeof oldestKey !== "string") break;
      this.cache.delete(oldestKey);
    }
  }

  private async prepareWithoutWorker<T extends HistoricalPreparationEntry>(
    entries: T[],
    sources: Array<{ entryId: string; markdown: string; sourceHash: string }>,
    transcriptKey: string,
    signal?: AbortSignal,
  ) {
    const summaries = new Map<string, PreparedHistoricalSummary>();
    for (let index = 0; index < sources.length; index += 1) {
      if (signal?.aborted) throw abortError();
      const source = sources[index];
      try {
        summaries.set(source.entryId, {
          kind: "html",
          html: await this.renderMarkdown(source.markdown),
          sourceHash: source.sourceHash,
        });
      } catch {
        summaries.set(
          source.entryId,
          plainSummary(source.markdown, source.sourceHash),
        );
      }

      if ((index + 1) % 8 === 0 && index + 1 < sources.length) {
        await yieldToBrowser();
      }
    }
    if (signal?.aborted) throw abortError();
    this.writeCache(transcriptKey, {
      sourceCharacters: sources.reduce(
        (total, source) => total + source.markdown.length,
        0,
      ),
      summaries,
    });
    return this.applySummaries(entries, summaries);
  }

  private applySummaries<T extends HistoricalPreparationEntry>(
    entries: T[],
    summaries: Map<string, PreparedHistoricalSummary>,
  ) {
    return entries.map((entry) => ({
      ...entry,
      preparedSummary:
        summaries.get(entry.clientId) ??
        plainSummary(
          entry.runView.finalMessage,
          hashHistoricalMarkdown(entry.runView.finalMessage),
        ),
    })) as PreparedHistoricalEntry<T>[];
  }
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

const historicalTranscriptPreparer = new HistoricalTranscriptPreparer();

export function prepareHistoricalTranscript<T extends HistoricalPreparationEntry>(
  entries: T[],
  transcriptKey: string,
  signal?: AbortSignal,
) {
  return historicalTranscriptPreparer.prepare(entries, transcriptKey, signal);
}

export function cancelHistoricalTranscriptPreparation() {
  historicalTranscriptPreparer.cancel();
}

export function clearHistoricalTranscriptPreparationCache() {
  historicalTranscriptPreparer.clear();
}

export type {
  HistoricalPreparationEntry,
  HistoricalTranscriptPreparerOptions,
  PreparedHistoricalEntry,
};
