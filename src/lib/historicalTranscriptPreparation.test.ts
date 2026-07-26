import { describe, expect, it, vi } from "vitest";
import type {
  HistoricalMarkdownWorkerRequest,
  HistoricalMarkdownWorkerResponse,
} from "../types";
import { HistoricalTranscriptPreparer } from "./historicalTranscriptPreparation";

class FakeHistoricalMarkdownWorker {
  onmessage:
    | ((event: MessageEvent<HistoricalMarkdownWorkerResponse>) => void)
    | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  request: HistoricalMarkdownWorkerRequest | null = null;
  terminate = vi.fn();

  postMessage(request: HistoricalMarkdownWorkerRequest) {
    this.request = request;
  }

  respond() {
    if (!this.request) throw new Error("No worker request was posted.");
    const response: HistoricalMarkdownWorkerResponse = {
      type: "prepared",
      generation: {
        generationId: this.request.generationId,
        transcriptKey: this.request.transcriptKey,
        sourceCharacters: this.request.turns.reduce(
          (total, turn) => total + turn.markdown.length,
          0,
        ),
        turns: this.request.turns.map((turn) => ({
          entryId: turn.entryId,
          summary: {
            kind: "html",
            html: `<p>${turn.markdown}</p>`,
            sourceHash: turn.sourceHash,
          },
        })),
      },
    };
    this.onmessage?.(new MessageEvent("message", { data: response }));
  }
}

function entry(id: string, finalMessage: string) {
  return {
    clientId: id,
    runView: { finalMessage },
  };
}

describe("HistoricalTranscriptPreparer", () => {
  it("prepares every turn and reuses a matching transcript cache", async () => {
    const workers: FakeHistoricalMarkdownWorker[] = [];
    const preparer = new HistoricalTranscriptPreparer({
      createWorker: () => {
        const worker = new FakeHistoricalMarkdownWorker();
        workers.push(worker);
        return worker;
      },
    });
    const entries = [entry("one", "First"), entry("two", "Second")];
    const pending = preparer.prepare(entries, "chat:1:v1");
    workers[0].respond();

    const prepared = await pending;
    expect(prepared.map((item) => item.preparedSummary?.kind)).toEqual([
      "html",
      "html",
    ]);

    const cached = await preparer.prepare(entries, "chat:1:v1");
    expect(cached[1].preparedSummary).toEqual(prepared[1].preparedSummary);
    expect(workers).toHaveLength(1);
  });

  it("does not publish a large transcript before every turn is prepared", async () => {
    const worker = new FakeHistoricalMarkdownWorker();
    const preparer = new HistoricalTranscriptPreparer({
      createWorker: () => worker,
    });
    let published = false;
    const pending = preparer
      .prepare(
        Array.from({ length: 300 }, (_, index) =>
          entry(`turn-${index}`, `Summary ${index}`),
        ),
        "chat:large:v1",
      )
      .then((entries) => {
        published = true;
        return entries;
      });

    await Promise.resolve();
    expect(published).toBe(false);
    worker.respond();
    const prepared = await pending;
    expect(prepared).toHaveLength(300);
    expect(prepared.every((item) => item.preparedSummary?.kind === "html")).toBe(
      true,
    );
  });

  it("cancels stale generations when another chat starts preparing", async () => {
    const workers: FakeHistoricalMarkdownWorker[] = [];
    const preparer = new HistoricalTranscriptPreparer({
      createWorker: () => {
        const worker = new FakeHistoricalMarkdownWorker();
        workers.push(worker);
        return worker;
      },
    });
    const stale = preparer.prepare([entry("old", "Old")], "chat:old:v1");
    const current = preparer.prepare([entry("new", "New")], "chat:new:v1");

    await expect(stale).rejects.toMatchObject({ name: "AbortError" });
    expect(workers[0].terminate).toHaveBeenCalled();
    workers[1].respond();
    await expect(current).resolves.toMatchObject([
      { clientId: "new", preparedSummary: { kind: "html" } },
    ]);
  });

  it("keeps formatted summaries when a worker is unavailable", async () => {
    const preparer = new HistoricalTranscriptPreparer({
      createWorker: () => null,
      renderMarkdown: async (markdown) => `<p><strong>${markdown}</strong></p>`,
    });

    const prepared = await preparer.prepare(
      [entry("fallback", "**Readable text**")],
      "chat:fallback:v1",
    );

    expect(prepared[0].preparedSummary).toMatchObject({
      kind: "html",
      html: "<p><strong>**Readable text**</strong></p>",
    });
  });

  it("uses safe plain text only when fallback Markdown preparation also fails", async () => {
    const preparer = new HistoricalTranscriptPreparer({
      createWorker: () => null,
      renderMarkdown: async () => {
        throw new Error("Parser unavailable");
      },
    });

    const prepared = await preparer.prepare(
      [entry("fallback", "**Readable text**")],
      "chat:plain-fallback:v1",
    );

    expect(prepared[0].preparedSummary).toMatchObject({
      kind: "plain",
      text: "**Readable text**",
    });
  });

  it("falls back when the Markdown worker stops responding", async () => {
    vi.useFakeTimers();
    try {
      const worker = new FakeHistoricalMarkdownWorker();
      const preparer = new HistoricalTranscriptPreparer({
        createWorker: () => worker,
        renderMarkdown: async (markdown) => `<p>${markdown}</p>`,
        workerTimeoutMs: 100,
      });

      const pending = preparer.prepare(
        [entry("stalled", "Still readable")],
        "chat:stalled-worker:v1",
      );
      await vi.advanceTimersByTimeAsync(100);

      await expect(pending).resolves.toMatchObject([
        {
          clientId: "stalled",
          preparedSummary: {
            kind: "html",
            html: "<p>Still readable</p>",
          },
        },
      ]);
      expect(worker.terminate).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("enforces the chat-count and source-character cache limits", async () => {
    const preparer = new HistoricalTranscriptPreparer({
      createWorker: () => null,
      renderMarkdown: async (markdown) => `<p>${markdown}</p>`,
      maxChats: 2,
      maxSourceCharacters: 10,
    });

    await preparer.prepare([entry("one", "1111")], "chat:1");
    await preparer.prepare([entry("two", "2222")], "chat:2");
    await preparer.prepare([entry("three", "3333")], "chat:3");

    expect(preparer.getCacheStats()).toEqual({
      chats: 2,
      sourceCharacters: 8,
    });
  });
});
