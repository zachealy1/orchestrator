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
import { preparePlaintextSourceDocument } from "./previewDocuments";

class FakeCodePreviewHighlightWorker implements CodePreviewHighlightWorker {
  onmessage:
    | ((event: MessageEvent<CodePreviewHighlightWorkerResponse>) => void)
    | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  requests = new Map<string, CodePreviewHighlightWorkerRequest>();
  terminate = vi.fn();

  postMessage(request: CodePreviewHighlightWorkerRequest) {
    this.requests.set(request.generationId, request);
  }

  requestForPath(path: string) {
    return [...this.requests.values()].find(
      (request) => request.input.path === path,
    );
  }

  respondHighlighted(
    request: CodePreviewHighlightWorkerRequest,
    lines: PreviewSemanticToken[][],
  ) {
    this.onmessage?.(
      new MessageEvent("message", {
        data: {
          type: "highlighted",
          generationId: request.generationId,
          lines,
        } satisfies CodePreviewHighlightWorkerResponse,
      }),
    );
  }

  respondSource(request: CodePreviewHighlightWorkerRequest) {
    if (request.type !== "prepare-source") throw new Error("Expected source request");
    this.onmessage?.(
      new MessageEvent("message", {
        data: {
          type: "source-prepared",
          generationId: request.generationId,
          document: preparePlaintextSourceDocument(request.input),
        } satisfies CodePreviewHighlightWorkerResponse,
      }),
    );
  }

  respondWithError(request: CodePreviewHighlightWorkerRequest, message: string) {
    this.onmessage?.(
      new MessageEvent("message", {
        data: {
          type: "error",
          generationId: request.generationId,
          message,
        } satisfies CodePreviewHighlightWorkerResponse,
      }),
    );
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
  it("reuses one persistent worker for sequential requests", async () => {
    const worker = new FakeCodePreviewHighlightWorker();
    const service = new CodePreviewHighlightingService({
      createWorker: () => worker,
    });
    const first = service.highlight(input("/repo/first.ts"));
    const firstRequest = worker.requestForPath("/repo/first.ts")!;
    worker.respondHighlighted(firstRequest, [[{ content: "first", offset: 0 }]]);
    await expect(first).resolves.toEqual([[{ content: "first", offset: 0 }]]);

    const second = service.highlight(input("/repo/second.ts"));
    const secondRequest = worker.requestForPath("/repo/second.ts")!;
    worker.respondHighlighted(secondRequest, [[{ content: "second", offset: 0 }]]);
    await expect(second).resolves.toEqual([[{ content: "second", offset: 0 }]]);
    expect(worker.terminate).not.toHaveBeenCalled();

    service.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("allows concurrent preparations to finish independently", async () => {
    const worker = new FakeCodePreviewHighlightWorker();
    const service = new CodePreviewHighlightingService({
      createWorker: () => worker,
    });
    const first = service.highlight(input("/repo/first.ts"));
    const second = service.highlight(input("/repo/second.ts"));
    const firstRequest = worker.requestForPath("/repo/first.ts")!;
    const secondRequest = worker.requestForPath("/repo/second.ts")!;

    worker.respondHighlighted(secondRequest, [[{ content: "second", offset: 0 }]]);
    worker.respondHighlighted(firstRequest, [[{ content: "first", offset: 0 }]]);
    await expect(second).resolves.toEqual([[{ content: "second", offset: 0 }]]);
    await expect(first).resolves.toEqual([[{ content: "first", offset: 0 }]]);
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it("warms a requested grammar once without replacing the shared worker", async () => {
    const worker = new FakeCodePreviewHighlightWorker();
    const service = new CodePreviewHighlightingService({
      createWorker: () => worker,
    });

    const first = service.warm("/repo/App.tsx");
    const request = worker.requestForPath("warm.tsx")!;
    worker.respondSource(request);
    await first;
    await service.warm("/repo/Other.tsx");

    expect(worker.requests.size).toBe(1);
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it("cancels one consumer without terminating the shared worker", async () => {
    const worker = new FakeCodePreviewHighlightWorker();
    const service = new CodePreviewHighlightingService({
      createWorker: () => worker,
    });
    const controller = new AbortController();
    const cancelled = service.highlight(input("/repo/cancelled.ts"), controller.signal);
    const retained = service.highlight(input("/repo/retained.ts"));
    const retainedRequest = worker.requestForPath("/repo/retained.ts")!;
    controller.abort();
    worker.respondHighlighted(retainedRequest, [[{ content: "retained", offset: 0 }]]);

    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    await expect(retained).resolves.toEqual([[{ content: "retained", offset: 0 }]]);
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it("prepares and caches immutable source documents", async () => {
    const worker = new FakeCodePreviewHighlightWorker();
    const service = new CodePreviewHighlightingService({
      createWorker: () => worker,
    });
    const sourceInput = {
      path: "/repo/file.ts",
      content: "const value = 1;",
      language: "typescript",
      truncated: false,
      version: "v1",
    };
    const first = service.prepareSource(sourceInput);
    const request = worker.requestForPath(sourceInput.path)!;
    worker.respondSource(request);
    const document = await first;
    await expect(service.prepareSource(sourceInput)).resolves.toBe(document);
    expect(worker.requests.size).toBe(1);
  });

  it("uses the main thread only for small previews when Worker is unavailable", async () => {
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

    const largeInput = {
      ...input("/repo/large.ts"),
      content: "x".repeat(MAIN_THREAD_HIGHLIGHT_MAX_CHARACTERS + 1),
    };
    await expect(service.highlight(largeInput)).resolves.toEqual([]);
    expect(mainThreadHighlight).toHaveBeenCalledOnce();
  });

  it("rejects one worker request failure without destroying the worker", async () => {
    const worker = new FakeCodePreviewHighlightWorker();
    const service = new CodePreviewHighlightingService({
      createWorker: () => worker,
    });
    const pending = service.highlight(input("/repo/broken.ts"));
    worker.respondWithError(worker.requestForPath("/repo/broken.ts")!, "grammar failed");
    await expect(pending).rejects.toThrow("grammar failed");
    expect(worker.terminate).not.toHaveBeenCalled();
  });
});
