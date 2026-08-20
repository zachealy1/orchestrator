/// <reference lib="webworker" />

import {
  CodePreviewCache,
  highlightPreviewContent,
} from "../lib/codePreview";
import {
  prepareDiffDocument,
  prepareSourceDocument,
} from "../lib/previewDocuments";
import type {
  CodePreviewHighlightWorkerRequest,
  CodePreviewHighlightWorkerResponse,
} from "../lib/codePreviewWorkerProtocol";

const workerScope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;
const cache = new CodePreviewCache();

workerScope.addEventListener(
  "message",
  async (event: MessageEvent<CodePreviewHighlightWorkerRequest>) => {
    const request = event.data;
    try {
      let response: CodePreviewHighlightWorkerResponse;
      if (request.type === "highlight") {
        const lines = await highlightPreviewContent(request.input, cache);
        response = {
          type: "highlighted",
          generationId: request.generationId,
          lines,
        };
      } else if (request.type === "prepare-source") {
        const document = await prepareSourceDocument(request.input, cache);
        response = {
          type: "source-prepared",
          generationId: request.generationId,
          document,
        };
      } else {
        const document = await prepareDiffDocument(request.input, cache);
        response = {
          type: "diff-prepared",
          generationId: request.generationId,
          document,
        };
      }
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
