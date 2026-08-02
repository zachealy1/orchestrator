import type {
  CodePreviewHighlightInput,
  PreviewSemanticToken,
} from "./codePreview";

export type CodePreviewHighlightWorkerRequest = {
  type: "highlight";
  generationId: string;
  input: CodePreviewHighlightInput;
};

export type CodePreviewHighlightWorkerResponse =
  | {
      type: "highlighted";
      generationId: string;
      lines: PreviewSemanticToken[][];
    }
  | {
      type: "error";
      generationId: string;
      message: string;
    };
