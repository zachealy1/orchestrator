/// <reference lib="webworker" />

import { renderHistoricalMarkdown } from "../lib/historicalMarkdown";
import type { HistoricalMarkdownWorkerRequest, HistoricalMarkdownWorkerResponse, PreparedHistoricalTurn } from "../features/conversations/types";

const workerScope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;

workerScope.addEventListener(
  "message",
  async (event: MessageEvent<HistoricalMarkdownWorkerRequest>) => {
    const request = event.data;
    if (request.type !== "prepare") return;

    try {
      const turns: PreparedHistoricalTurn[] = [];
      for (const turn of request.turns) {
        turns.push({
          entryId: turn.entryId,
          summary: {
            kind: "html",
            html: await renderHistoricalMarkdown(turn.markdown),
            sourceHash: turn.sourceHash,
          },
        });
      }

      const response: HistoricalMarkdownWorkerResponse = {
        type: "prepared",
        generation: {
          generationId: request.generationId,
          transcriptKey: request.transcriptKey,
          sourceCharacters: request.turns.reduce(
            (total, turn) => total + turn.markdown.length,
            0,
          ),
          turns,
        },
      };
      workerScope.postMessage(response);
    } catch (error) {
      const response: HistoricalMarkdownWorkerResponse = {
        type: "error",
        generationId: request.generationId,
        message: error instanceof Error ? error.message : String(error),
      };
      workerScope.postMessage(response);
    }
  },
);

export {};
