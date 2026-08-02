import { describe, expect, it, vi } from "vitest";
import type {
  CodePreviewHighlightInput,
  PreviewSemanticToken,
} from "./codePreview";
import {
  CodePreviewHighlightingService,
  MAIN_THREAD_HIGHLIGHT_MAX_CHARACTERS,
  type CodePreviewHighlightWorker,
} from "./codePreviewHighlighting";
import type {
  CodePreviewHighlightWorkerRequest,
  CodePreviewHighlightWorkerResponse,
} from "./codePreviewWorkerProtocol";

class FakeCodePreviewHighlightWorker implements CodePreviewHighlightWorker {
  onmessage:
    | ((event: MessageEvent<CodePreviewHighlightWorkerResponse>) => void)
    | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  request: CodePreviewHighlightWorkerRequest | null = null;
  terminate = vi.fn();

  postMessage(request: CodePreviewHighlightWorkerRequest) {
    this.request = request;
  }

  respond(lines: PreviewSemanticToken[][] = [[{ content: "const", offset: 0 }]]) {
    if (!this.request) {
      throw new Error("No worker request was posted.");
    }
    const response: CodePreviewHighlightWorkerResponse = {
      type: "highlighted",
      generationId: this.request.generationId,
      lines,
    };
    this.onmessage?.(new MessageEvent("message", { data: response }));
  }

  respondWithError(message: string) {
    if (!this.request) {
      throw new Error("No worker request was posted.");
    }
    const response: CodePreviewHighlightWorkerResponse = {
      type: "error",
      generationId: this.request.generationId,
      message,
    };
    this.onmessage?.(new MessageEvent("message", { data: response }));
  }
}

function input(path: string): CodePreviewHighlightInput {
  return {
    path,
    content: "const value = 1;",
    language: "typescript",
    resolvedTheme: "dark",
  };
}

describe("CodePreviewHighlightingService", () => {
  it("highlights in a worker and reuses the idle worker", async () => {
    const workers: FakeCodePreviewHighlightWorker[] = [];
    const mainThreadHighlight = vi.fn();
    const service = new CodePreviewHighlightingService({
      createWorker: () => {
        const worker = new FakeCodePreviewHighlightWorker();
        workers.push(worker);
        return worker;
      },
      highlightOnMainThread: mainThreadHighlight,
    });

    const first = service.highlight(input("/repo/first.ts"));
    expect(workers[0].request?.input.path).toBe("/repo/first.ts");
    workers[0].respond([[{ content: "first", offset: 0 }]]);
    await expect(first).resolves.toEqual([[{ content: "first", offset: 0 }]]);

    const second = service.highlight(input("/repo/second.ts"));
    expect(workers).toHaveLength(1);
    expect(workers[0].request?.input.path).toBe("/repo/second.ts");
    workers[0].respond([[{ content: "second", offset: 0 }]]);
    await expect(second).resolves.toEqual([[{ content: "second", offset: 0 }]]);
    expect(mainThreadHighlight).not.toHaveBeenCalled();

    service.dispose();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });

  it("terminates a stale generation before starting the next file", async () => {
    const workers: FakeCodePreviewHighlightWorker[] = [];
    const service = new CodePreviewHighlightingService({
      createWorker: () => {
        const worker = new FakeCodePreviewHighlightWorker();
        workers.push(worker);
        return worker;
      },
    });

    const stale = service.highlight(input("/repo/stale.ts"));
    const current = service.highlight(input("/repo/current.ts"));

    await expect(stale).rejects.toMatchObject({ name: "AbortError" });
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(workers[1].request?.input.path).toBe("/repo/current.ts");
    workers[1].respond([[{ content: "current", offset: 0 }]]);
    await expect(current).resolves.toEqual([[{ content: "current", offset: 0 }]]);
    service.dispose();
  });

  it("uses the main thread only when Worker is unavailable", async () => {
    const highlighted = [[{ content: "fallback", offset: 0 }]];
    const mainThreadHighlight = vi.fn().mockResolvedValue(highlighted);
    const service = new CodePreviewHighlightingService({
      createWorker: () => null,
      highlightOnMainThread: mainThreadHighlight,
    });

    await expect(service.highlight(input("/repo/fallback.ts"))).resolves.toEqual(
      highlighted,
    );
    expect(mainThreadHighlight).toHaveBeenCalledOnce();
  });

  it("keeps a large preview plaintext when Worker is unavailable", async () => {
    const mainThreadHighlight = vi.fn();
    const service = new CodePreviewHighlightingService({
      createWorker: () => null,
      highlightOnMainThread: mainThreadHighlight,
    });
    const largeInput = {
      ...input("/repo/large.ts"),
      content: "x".repeat(MAIN_THREAD_HIGHLIGHT_MAX_CHARACTERS + 1),
    };

    await expect(service.highlight(largeInput)).resolves.toEqual([]);
    expect(mainThreadHighlight).not.toHaveBeenCalled();
  });

  it("rejects worker failures without moving expensive work to the main thread", async () => {
    const worker = new FakeCodePreviewHighlightWorker();
    const mainThreadHighlight = vi.fn();
    const service = new CodePreviewHighlightingService({
      createWorker: () => worker,
      highlightOnMainThread: mainThreadHighlight,
    });

    const pending = service.highlight(input("/repo/broken.ts"));
    worker.respondWithError("grammar failed");

    await expect(pending).rejects.toThrow("grammar failed");
    expect(mainThreadHighlight).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("supports AbortSignal cancellation", async () => {
    const worker = new FakeCodePreviewHighlightWorker();
    const service = new CodePreviewHighlightingService({
      createWorker: () => worker,
    });
    const controller = new AbortController();
    const pending = service.highlight(input("/repo/cancelled.ts"), controller.signal);

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
