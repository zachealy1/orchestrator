import { describe, expect, it } from "vitest";
import { buildNativePlanPreview } from "./nativePlanPreview";

describe("buildNativePlanPreview", () => {
  it("returns short plans without truncation", () => {
    const text = "# Plan\n\nOne paragraph.";
    expect(buildNativePlanPreview(text)).toEqual({
      isLong: false,
      previewText: text,
    });
  });

  it("cuts long plans on complete markdown block boundaries", () => {
    const text = [
      "# Plan",
      "",
      "First.",
      "",
      "Second.",
      "",
      "Third.",
      "",
      "Fourth.",
      "",
      "Fifth.",
    ].join("\n");
    const preview = buildNativePlanPreview(text);
    expect(preview.isLong).toBe(true);
    expect(preview.previewText).not.toContain("Fifth.");
  });
});
