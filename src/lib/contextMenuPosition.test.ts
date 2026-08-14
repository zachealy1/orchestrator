import { describe, expect, it } from "vitest";
import { clampFloatingMenuPosition } from "./contextMenuPosition";

describe("clampFloatingMenuPosition", () => {
  it("keeps the complete menu inside the right and bottom viewport edges", () => {
    expect(
      clampFloatingMenuPosition({
        x: 980,
        y: 740,
        width: 248,
        height: 190,
        viewportWidth: 1024,
        viewportHeight: 768,
      }),
    ).toEqual({ x: 768, y: 570 });
  });

  it("preserves pointer coordinates that already have enough clearance", () => {
    expect(
      clampFloatingMenuPosition({
        x: 120,
        y: 140,
        width: 248,
        height: 190,
        viewportWidth: 1024,
        viewportHeight: 768,
      }),
    ).toEqual({ x: 120, y: 140 });
  });

  it("anchors oversized menus to the viewport gutter", () => {
    expect(
      clampFloatingMenuPosition({
        x: 100,
        y: 100,
        width: 500,
        height: 500,
        viewportWidth: 320,
        viewportHeight: 240,
      }),
    ).toEqual({ x: 8, y: 8 });
  });
});
