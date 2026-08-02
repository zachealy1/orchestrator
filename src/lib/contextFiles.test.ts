import { describe, expect, it } from "vitest";
import type { ComposerContextFile } from "../features/composer/types";
import {
  contextFileMarkdownReference,
  restorePromptInlineFileReferencesForComposer,
  serializePromptInlineFileReferences,
} from "./contextFiles";

const file: ComposerContextFile = {
  path: "/Users/zachealy/development/repositories/career-documents/hello-world.txt",
  name: "hello-world.txt",
  source: "search",
  status: "ready",
};

describe("inline context file references", () => {
  it("serializes the visible file token as a line-addressed Markdown link", () => {
    expect(contextFileMarkdownReference(file)).toBe(
      "[hello-world.txt](/Users/zachealy/development/repositories/career-documents/hello-world.txt:1)",
    );
    expect(
      serializePromptInlineFileReferences("Update TXT hello-world.txt", [file]),
    ).toBe(
      "Update [hello-world.txt](/Users/zachealy/development/repositories/career-documents/hello-world.txt:1)",
    );
  });

  it("keeps serialized references stable and restores their composer display token", () => {
    const markdown = `Update ${contextFileMarkdownReference(file)}`;

    expect(serializePromptInlineFileReferences(markdown, [file])).toBe(markdown);
    expect(restorePromptInlineFileReferencesForComposer(markdown, [file])).toBe(
      "Update TXT hello-world.txt",
    );
  });

  it("encodes paths that would otherwise break a Markdown destination", () => {
    expect(
      contextFileMarkdownReference({
        ...file,
        path: "/Users/test/My Project/file (draft).txt",
        name: "file (draft).txt",
      }),
    ).toBe(
      "[file (draft).txt](/Users/test/My%20Project/file%20%28draft%29.txt:1)",
    );
  });
});
