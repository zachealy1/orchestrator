import { describe, expect, it } from "vitest";
import {
  mergeThemeTokenLine,
  preparePlaintextDiffDocument,
  preparePlaintextSourceDocument,
  splitSourceLines,
} from "./previewDocuments";

describe("preview document preparation", () => {
  it("splits CRLF, CR, and LF source without changing row geometry", () => {
    expect(splitSourceLines("one\r\ntwo\rthree\nfour")).toEqual([
      "one",
      "two",
      "three",
      "four",
    ]);
  });

  it("combines different light and dark token boundaries losslessly", () => {
    const tokens = mergeThemeTokenLine(
      "const value",
      [
        { content: "const", color: "#111", offset: 0 },
        { content: " value", color: "#222", offset: 5 },
      ],
      [
        { content: "const ", color: "#aaa", offset: 0 },
        { content: "value", color: "#bbb", offset: 6 },
      ],
    );
    expect(tokens.map((token) => token.content).join("")).toBe("const value");
    expect(tokens).toEqual([
      {
        content: "const",
        lightColor: "#111",
        darkColor: "#aaa",
        semantic: undefined,
      },
      {
        content: " ",
        lightColor: "#222",
        darkColor: "#aaa",
        semantic: undefined,
      },
      {
        content: "value",
        lightColor: "#222",
        darkColor: "#bbb",
        semantic: undefined,
      },
    ]);
  });

  it("creates immutable plaintext source rows without a later recolor mode", () => {
    const document = preparePlaintextSourceDocument({
      path: "/repo/large.ts",
      content: "one\ntwo",
      language: "typescript",
      truncated: true,
      version: "v1",
    });
    expect(document.highlightingMode).toBe("plaintext");
    expect(document.lines).toEqual([
      [{ content: "one" }],
      [{ content: "two" }],
    ]);
  });

  it("builds diff rows before publication and marks bounded inputs truncated", () => {
    const document = preparePlaintextDiffDocument({
      path: "/repo/file.txt",
      sections: [
        {
          id: "unstaged-0",
          baseContent: "old\n",
          headContent: "new\n",
          diffContent: "",
          baseTruncated: false,
          headTruncated: true,
        },
      ],
    });
    expect(document.truncated).toBe(true);
    expect(document.sections[0].rows).toHaveLength(1);
    expect(document.sections[0].rows[0]).toMatchObject({
      kind: "changed",
      baseText: "old",
      headText: "new",
    });
  });

  it("uses bounded exact Git hunks when full-file inputs are truncated", () => {
    const document = preparePlaintextDiffDocument({
      path: "/repo/file.txt",
      sections: [
        {
          id: "unstaged-0",
          baseContent: "unrelated truncated prefix",
          headContent: "unrelated truncated prefix",
          diffContent:
            "diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -40,2 +40,2 @@\n context\n-old\n+new\n",
          baseTruncated: true,
          headTruncated: true,
        },
      ],
    });

    expect(document.highlightingMode).toBe("plaintext");
    expect(document.sections[0].rows).toEqual([
      expect.objectContaining({
        kind: "unchanged",
        baseLineNumber: 40,
        headLineNumber: 40,
        baseText: "context",
      }),
      expect.objectContaining({
        kind: "changed",
        baseLineNumber: 41,
        headLineNumber: 41,
        baseText: "old",
        headText: "new",
      }),
    ]);
  });
});
