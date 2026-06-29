import { describe, expect, it } from "vitest";
import { buildDiffRows, pairChangedLineBlocks } from "./diffPreview";

describe("diffPreview", () => {
  it("builds full-file rows with unchanged context and changed lines", () => {
    const rows = buildDiffRows("A\nOld\nZ\n", "A\nNew\nZ\n");

    expect(rows.map((row) => row.kind)).toEqual([
      "unchanged",
      "changed",
      "unchanged",
    ]);
    expect(rows[0]).toMatchObject({
      baseLineNumber: 1,
      headLineNumber: 1,
      baseText: "A",
      headText: "A",
    });
    expect(rows[1]).toMatchObject({
      baseLineNumber: 2,
      headLineNumber: 2,
      baseText: "Old",
      headText: "New",
    });
    expect(rows[2]).toMatchObject({
      baseLineNumber: 3,
      headLineNumber: 3,
      baseText: "Z",
      headText: "Z",
    });
  });

  it("pairs changed blocks even when line counts differ", () => {
    expect(pairChangedLineBlocks(["one"], ["one", "two"])).toEqual([
      { baseText: "one", headText: "one" },
      { baseText: null, headText: "two" },
    ]);
  });
});
