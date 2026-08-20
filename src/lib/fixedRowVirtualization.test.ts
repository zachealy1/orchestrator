import { describe, expect, it } from "vitest";
import { previewOverscanRows } from "./fixedRowVirtualization";

describe("fixed preview row virtualization", () => {
  it("mounts two complete viewport heights outside the visible range", () => {
    expect(previewOverscanRows(720, 20)).toBe(72);
    expect(previewOverscanRows(721, 24)).toBe(62);
  });
});
