import { describe, expect, it } from "vitest";
import {
  buildDiffOverviewMarkers,
  buildDiffRows,
  calculateOverviewViewport,
  pairChangedLineBlocks,
  scrollToOverviewPosition,
  type DiffRow,
} from "./diffPreview";

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

  it("builds overview markers only for changed rows", () => {
    const rows: DiffRow[] = [
      {
        id: "one",
        kind: "unchanged",
        baseLineNumber: 1,
        headLineNumber: 1,
        baseText: "one",
        headText: "one",
      },
      {
        id: "two",
        kind: "changed",
        baseLineNumber: 2,
        headLineNumber: 2,
        baseText: "old",
        headText: "new",
      },
      {
        id: "three",
        kind: "added",
        baseLineNumber: null,
        headLineNumber: 3,
        baseText: "",
        headText: "added",
      },
      {
        id: "four",
        kind: "removed",
        baseLineNumber: 3,
        headLineNumber: null,
        baseText: "removed",
        headText: "",
      },
    ];

    expect(buildDiffOverviewMarkers(rows)).toEqual([
      {
        id: "two-overview",
        kind: "changed",
        rowIndex: 1,
        topPercent: 25,
        heightPercent: 25,
      },
      {
        id: "three-overview",
        kind: "added",
        rowIndex: 2,
        topPercent: 50,
        heightPercent: 25,
      },
      {
        id: "four-overview",
        kind: "removed",
        rowIndex: 3,
        topPercent: 75,
        heightPercent: 25,
      },
    ]);
  });

  it("calculates the overview viewport from scroll metrics", () => {
    expect(calculateOverviewViewport(50, 200, 100)).toEqual({
      topPercent: 25,
      heightPercent: 50,
      scrollable: true,
    });

    expect(calculateOverviewViewport(0, 100, 100)).toEqual({
      topPercent: 0,
      heightPercent: 100,
      scrollable: false,
    });
  });

  it("scrolls a container from an overview ratio", () => {
    const container = {
      clientHeight: 100,
      scrollHeight: 500,
      scrollTop: 0,
    } as HTMLElement;

    expect(scrollToOverviewPosition(container, 0.5)).toBe(200);
    expect(container.scrollTop).toBe(200);
    expect(scrollToOverviewPosition(container, 2)).toBe(400);
    expect(container.scrollTop).toBe(400);
  });
});
