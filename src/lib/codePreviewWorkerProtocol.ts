import type {
  CodePreviewHighlightInput,
  PreviewSemanticToken,
} from "./codePreview";
import type {
  PreparedDiffDocument,
  PreparedSourceDocument,
  PrepareDiffDocumentInput,
  PrepareSourceDocumentInput,
} from "./previewDocuments";

export type CodePreviewHighlightWorkerRequest =
  | {
      type: "highlight";
      generationId: string;
      input: CodePreviewHighlightInput;
    }
  | {
      type: "prepare-source";
      generationId: string;
      input: PrepareSourceDocumentInput;
    }
  | {
      type: "prepare-diff";
      generationId: string;
      input: PrepareDiffDocumentInput;
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
    }
  | {
      type: "source-prepared";
      generationId: string;
      document: PreparedSourceDocument;
    }
  | {
      type: "diff-prepared";
      generationId: string;
      document: PreparedDiffDocument;
    };
