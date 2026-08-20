import {
  BoundedPreviewHighlightCache,
  CodePreviewCache,
  detectPreviewLanguage,
  highlightPreviewContent,
  type CodePreviewHighlightInput,
  type PreviewSemanticToken,
} from "./codePreview";
import type {
  CodePreviewHighlightWorkerRequest,
  CodePreviewHighlightWorkerResponse,
} from "./codePreviewWorkerProtocol";
import {
  diffDocumentIdentity,
  prepareDiffDocument,
  preparePlaintextSourceDocument,
  prepareSourceDocument,
  sourceDocumentIdentity,
  type PreparedDiffDocument,
  type PreparedSourceDocument,
  type PrepareDiffDocumentInput,
  type PrepareSourceDocumentInput,
} from "./previewDocuments";
import {
  recordPreviewDiagnostic,
  startPreviewLongTaskDiagnostics,
} from "./previewDiagnostics";

export type CodePreviewHighlightWorker = {
  onmessage:
    | ((event: MessageEvent<CodePreviewHighlightWorkerResponse>) => void)
    | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: CodePreviewHighlightWorkerRequest): void;
  terminate(): void;
};

type CodePreviewHighlightingServiceOptions = {
  cache?: CodePreviewCache;
  createWorker?: () => CodePreviewHighlightWorker | null;
  highlightOnMainThread?: (
    input: CodePreviewHighlightInput,
  ) => Promise<PreviewSemanticToken[][]>;
};

type PendingWorkerRequest = {
  reject: (error: Error) => void;
  resolve: (response: CodePreviewHighlightWorkerResponse) => void;
};

export const MAIN_THREAD_HIGHLIGHT_MAX_CHARACTERS = 100_000;
const PREPARED_CACHE_MAX_ENTRIES = 8;
const PREPARED_CACHE_MAX_SOURCE_CHARACTERS = 8_000_000;

function createBrowserWorker(): CodePreviewHighlightWorker | null {
  if (typeof Worker === "undefined") {
    return null;
  }

  try {
    return new Worker(new URL("../workers/codePreview.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    return null;
  }
}

function highlightAbortError() {
  const error = new Error("Code preview preparation was cancelled.");
  error.name = "AbortError";
  return error;
}

export class CodePreviewHighlightingService {
  private readonly cache: CodePreviewCache;
  private readonly createWorker: () => CodePreviewHighlightWorker | null;
  private readonly highlightOnMainThread: (
    input: CodePreviewHighlightInput,
  ) => Promise<PreviewSemanticToken[][]>;
  private readonly preparedSources = new BoundedPreviewHighlightCache<
    Promise<PreparedSourceDocument>
  >(PREPARED_CACHE_MAX_ENTRIES, PREPARED_CACHE_MAX_SOURCE_CHARACTERS);
  private readonly preparedDiffs = new BoundedPreviewHighlightCache<
    Promise<PreparedDiffDocument>
  >(PREPARED_CACHE_MAX_ENTRIES, PREPARED_CACHE_MAX_SOURCE_CHARACTERS);
  private readonly pending = new Map<string, PendingWorkerRequest>();
  private readonly warmingLanguages = new Map<string, Promise<void>>();
  private worker: CodePreviewHighlightWorker | null = null;
  private generationSequence = 0;

  constructor(options: CodePreviewHighlightingServiceOptions = {}) {
    startPreviewLongTaskDiagnostics();
    this.cache = options.cache ?? new CodePreviewCache();
    this.createWorker = options.createWorker ?? createBrowserWorker;
    this.highlightOnMainThread =
      options.highlightOnMainThread ??
      ((input) => highlightPreviewContent(input, this.cache));
  }

  highlight(input: CodePreviewHighlightInput, signal?: AbortSignal) {
    if (signal?.aborted) {
      return Promise.reject<PreviewSemanticToken[][]>(highlightAbortError());
    }

    const worker = this.ensureWorker();
    if (!worker) {
      if (input.content.length > MAIN_THREAD_HIGHLIGHT_MAX_CHARACTERS) {
        return Promise.resolve<PreviewSemanticToken[][]>([]);
      }
      return withAbortSignal(this.highlightOnMainThread(input), signal);
    }

    return this.requestWorker(
      {
        type: "highlight",
        generationId: this.nextGeneration("highlight"),
        input,
      },
      (response) => {
        if (response.type !== "highlighted") {
          throw new Error("Preview worker returned an unexpected response.");
        }
        return response.lines;
      },
      signal,
    );
  }

  warm(path: string, language = detectPreviewLanguage(path)) {
    if (language === "plaintext") return Promise.resolve();
    const existing = this.warmingLanguages.get(language);
    if (existing) return existing;
    const worker = this.ensureWorker();
    if (!worker) return Promise.resolve();
    const input: PrepareSourceDocumentInput = {
      path: `warm.${language}`,
      content: "",
      language,
      truncated: false,
    };
    const request = this.requestWorker(
      {
        type: "prepare-source",
        generationId: this.nextGeneration("warm"),
        input,
      },
      (response) => {
        if (response.type !== "source-prepared") {
          throw new Error("Preview worker returned an unexpected warm-up response.");
        }
      },
    ).catch((error) => {
      this.warmingLanguages.delete(language);
      throw error;
    });
    this.warmingLanguages.set(language, request);
    return request;
  }

  prepareSource(input: PrepareSourceDocumentInput, signal?: AbortSignal) {
    const key = sourceDocumentIdentity(input);
    const cached = this.preparedSources.get(key);
    if (cached) {
      return withAbortSignal(cached, signal);
    }

    recordPreviewDiagnostic({ identity: key, stage: "request-started" });
    const worker = this.ensureWorker();
    const request = worker
      ? this.requestWorker(
          {
            type: "prepare-source",
            generationId: this.nextGeneration("source"),
            input,
          },
          (response) => {
            if (response.type !== "source-prepared") {
              throw new Error("Preview worker returned an unexpected source response.");
            }
            return response.document;
          },
        )
      : input.content.length <= MAIN_THREAD_HIGHLIGHT_MAX_CHARACTERS
        ? prepareSourceDocument(input, this.cache)
        : Promise.resolve(preparePlaintextSourceDocument(input));
    const cachedRequest = request
      .then((document) => {
        recordPreviewDiagnostic({
          identity: key,
          stage: "worker-completed",
          rowCount: document.lines.length,
        });
        return document;
      })
      .catch((error) => {
        this.preparedSources.deleteIfValue(key, cachedRequest);
        throw error;
      });
    this.preparedSources.set(key, cachedRequest, input.content.length);
    return withAbortSignal(cachedRequest, signal);
  }

  prepareDiff(input: PrepareDiffDocumentInput, signal?: AbortSignal) {
    const key = diffDocumentIdentity(input);
    const cached = this.preparedDiffs.get(key);
    if (cached) {
      return withAbortSignal(cached, signal);
    }

    recordPreviewDiagnostic({ identity: key, stage: "request-started" });
    const worker = this.ensureWorker();
    const request = worker
      ? this.requestWorker(
          {
            type: "prepare-diff",
            generationId: this.nextGeneration("diff"),
            input,
          },
          (response) => {
            if (response.type !== "diff-prepared") {
              throw new Error("Preview worker returned an unexpected diff response.");
            }
            return response.document;
          },
        )
      : prepareDiffDocument(input, this.cache);
    const sourceCharacters = input.sections.reduce(
      (total, section) =>
        total + section.baseContent.length + section.headContent.length,
      0,
    );
    const cachedRequest = request
      .then((document) => {
        recordPreviewDiagnostic({
          identity: key,
          stage: "worker-completed",
          rowCount: document.sections.reduce(
            (total, section) => total + section.rows.length,
            0,
          ),
        });
        return document;
      })
      .catch((error) => {
        this.preparedDiffs.deleteIfValue(key, cachedRequest);
        throw error;
      });
    this.preparedDiffs.set(key, cachedRequest, sourceCharacters);
    return withAbortSignal(cachedRequest, signal);
  }

  cancel() {
    const reason = highlightAbortError();
    for (const pending of this.pending.values()) {
      pending.reject(reason);
    }
    this.pending.clear();
  }

  dispose() {
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
    this.preparedSources.clear();
    this.preparedDiffs.clear();
    this.warmingLanguages.clear();
  }

  getStats() {
    return {
      pendingRequests: this.pending.size,
      sourceDocuments: this.preparedSources.getStats(),
      diffDocuments: this.preparedDiffs.getStats(),
    };
  }

  private ensureWorker() {
    if (this.worker) {
      return this.worker;
    }
    const worker = this.createWorker();
    if (!worker) {
      return null;
    }
    recordPreviewDiagnostic({
      identity: "preview-worker",
      stage: "worker-started",
    });
    worker.onmessage = (event) => {
      const response = event.data;
      const pending = this.pending.get(response.generationId);
      if (!pending) {
        return;
      }
      this.pending.delete(response.generationId);
      if (response.type === "error") {
        pending.reject(new Error(response.message));
      } else {
        pending.resolve(response);
      }
    };
    worker.onerror = (event) => {
      this.failWorker(
        new Error(event.message || "Code preview preparation worker failed."),
      );
    };
    this.worker = worker;
    return worker;
  }

  private requestWorker<T>(
    request: CodePreviewHighlightWorkerRequest,
    project: (response: CodePreviewHighlightWorkerResponse) => T,
    signal?: AbortSignal,
  ) {
    const worker = this.worker;
    if (!worker) {
      return Promise.reject<T>(new Error("Preview worker is unavailable."));
    }
    const response = new Promise<T>((resolve, reject) => {
      this.pending.set(request.generationId, {
        reject,
        resolve: (workerResponse) => {
          try {
            resolve(project(workerResponse));
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        },
      });
      try {
        worker.postMessage(request);
      } catch (error) {
        this.pending.delete(request.generationId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    return withAbortSignal(response, signal);
  }

  private nextGeneration(kind: string) {
    return `preview-${kind}-${++this.generationSequence}`;
  }

  private failWorker(error: Error) {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }
}

function withAbortSignal<T>(promise: Promise<T>, signal?: AbortSignal) {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject<T>(highlightAbortError());
  }

  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => reject(highlightAbortError());
    signal.addEventListener("abort", handleAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", handleAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", handleAbort);
        reject(error);
      },
    );
  });
}
