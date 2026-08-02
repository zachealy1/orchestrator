import {
  highlightPreviewContent,
  type CodePreviewHighlightInput,
  type PreviewSemanticToken,
} from "./codePreview";
import type {
  CodePreviewHighlightWorkerRequest,
  CodePreviewHighlightWorkerResponse,
} from "./codePreviewWorkerProtocol";

export type CodePreviewHighlightWorker = {
  onmessage:
    | ((event: MessageEvent<CodePreviewHighlightWorkerResponse>) => void)
    | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: CodePreviewHighlightWorkerRequest): void;
  terminate(): void;
};

type ActiveHighlight = {
  generationId: string;
  cancel: (reason: Error) => void;
};

type CodePreviewHighlightingServiceOptions = {
  createWorker?: () => CodePreviewHighlightWorker | null;
  highlightOnMainThread?: (
    input: CodePreviewHighlightInput,
  ) => Promise<PreviewSemanticToken[][]>;
};

export const MAIN_THREAD_HIGHLIGHT_MAX_CHARACTERS = 100_000;

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
  const error = new Error("Code preview highlighting was cancelled.");
  error.name = "AbortError";
  return error;
}

export class CodePreviewHighlightingService {
  private readonly createWorker: () => CodePreviewHighlightWorker | null;
  private readonly highlightOnMainThread: (
    input: CodePreviewHighlightInput,
  ) => Promise<PreviewSemanticToken[][]>;
  private worker: CodePreviewHighlightWorker | null = null;
  private active: ActiveHighlight | null = null;
  private generationSequence = 0;

  constructor(options: CodePreviewHighlightingServiceOptions = {}) {
    this.createWorker = options.createWorker ?? createBrowserWorker;
    this.highlightOnMainThread =
      options.highlightOnMainThread ?? highlightPreviewContent;
  }

  highlight(input: CodePreviewHighlightInput, signal?: AbortSignal) {
    if (signal?.aborted) {
      return Promise.reject<PreviewSemanticToken[][]>(highlightAbortError());
    }

    this.cancel();
    const generationId = `code-preview-highlight-${++this.generationSequence}`;
    const worker = this.worker ?? this.createWorker();
    if (!worker) {
      // A missing Worker should never turn a large preview into a blocking
      // main-thread syntax-highlighting job. The caller will keep rendering
      // the already-available plain-text rows.
      if (input.content.length > MAIN_THREAD_HIGHLIGHT_MAX_CHARACTERS) {
        return Promise.resolve<PreviewSemanticToken[][]>([]);
      }
      return this.highlightWithoutWorker(input, generationId, signal);
    }
    this.worker = worker;

    return new Promise<PreviewSemanticToken[][]>((resolve, reject) => {
      let settled = false;

      const finish = (terminateWorker: boolean) => {
        if (settled) {
          return false;
        }
        settled = true;
        signal?.removeEventListener("abort", handleAbort);
        worker.onmessage = null;
        worker.onerror = null;
        if (this.active?.generationId === generationId) {
          this.active = null;
        }
        if (terminateWorker && this.worker === worker) {
          worker.terminate();
          this.worker = null;
        }
        return true;
      };

      const handleAbort = () => {
        if (!finish(true)) {
          return;
        }
        reject(highlightAbortError());
      };

      worker.onmessage = (event) => {
        const response = event.data;
        if (response.generationId !== generationId) {
          return;
        }
        if (response.type === "highlighted") {
          if (!finish(false)) {
            return;
          }
          resolve(response.lines);
          return;
        }

        if (!finish(true)) {
          return;
        }
        reject(new Error(response.message));
      };
      worker.onerror = (event) => {
        if (!finish(true)) {
          return;
        }
        reject(new Error(event.message || "Code preview highlighting worker failed."));
      };
      this.active = {
        generationId,
        cancel: (reason) => {
          if (!finish(true)) {
            return;
          }
          reject(reason);
        },
      };
      signal?.addEventListener("abort", handleAbort, { once: true });
      if (signal?.aborted) {
        handleAbort();
        return;
      }

      const request: CodePreviewHighlightWorkerRequest = {
        type: "highlight",
        generationId,
        input,
      };
      try {
        worker.postMessage(request);
      } catch (error) {
        if (!finish(true)) {
          return;
        }
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  cancel() {
    this.active?.cancel(highlightAbortError());
  }

  dispose() {
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
  }

  private highlightWithoutWorker(
    input: CodePreviewHighlightInput,
    generationId: string,
    signal?: AbortSignal,
  ) {
    return new Promise<PreviewSemanticToken[][]>((resolve, reject) => {
      let settled = false;

      const finish = () => {
        if (settled) {
          return false;
        }
        settled = true;
        signal?.removeEventListener("abort", handleAbort);
        if (this.active?.generationId === generationId) {
          this.active = null;
        }
        return true;
      };

      const handleAbort = () => {
        if (!finish()) {
          return;
        }
        reject(highlightAbortError());
      };

      this.active = {
        generationId,
        cancel: (reason) => {
          if (!finish()) {
            return;
          }
          reject(reason);
        },
      };
      signal?.addEventListener("abort", handleAbort, { once: true });
      if (signal?.aborted) {
        handleAbort();
        return;
      }

      void this.highlightOnMainThread(input).then(
        (lines) => {
          if (finish()) {
            resolve(lines);
          }
        },
        (error) => {
          if (finish()) {
            reject(error);
          }
        },
      );
    });
  }
}

export const codePreviewHighlightingService =
  new CodePreviewHighlightingService();
