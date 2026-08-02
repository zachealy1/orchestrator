/// <reference lib="webworker" />

import { highlightPreviewContent } from "../lib/codePreview";
import type {
  CodePreviewHighlightWorkerRequest,
  CodePreviewHighlightWorkerResponse,
} from "../lib/codePreviewWorkerProtocol";

const workerScope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;

workerScope.addEventListener(
  "message",
  async (event: MessageEvent<CodePreviewHighlightWorkerRequest>) => {
    const request = event.data;
    if (request.type !== "highlight") {
      return;
    }

    try {
      const lines = await highlightPreviewContent(request.input);
      const response: CodePreviewHighlightWorkerResponse = {
        type: "highlighted",
        generationId: request.generationId,
        lines,
      };
      workerScope.postMessage(response);
    } catch (error) {
      const response: CodePreviewHighlightWorkerResponse = {
        type: "error",
        generationId: request.generationId,
        message: error instanceof Error ? error.message : String(error),
      };
      workerScope.postMessage(response);
    }
  },
);

export {};
