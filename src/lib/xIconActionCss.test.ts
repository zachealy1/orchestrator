import { describe, expect, it } from "vitest";
import { readAppStyles } from "../test/readAppStyles";

const css = readAppStyles();

describe("X icon action styles", () => {
  it("keeps neutral X glyphs from inheriting blue button hover colors", () => {
    expect(css).toMatch(
      /button:has\(svg\.lucide-x\):hover:not\(:disabled\)[\s\S]*?color: var\(--color-text-secondary\);/,
    );
  });

  it("keeps destructive X glyphs on the error color", () => {
    expect(css).toMatch(
      /button:is\(\.danger, \.cancel, \.approval-choice-danger\):has\(svg\.lucide-x\):hover:not\(:disabled\)[\s\S]*?color: var\(--color-error\);/,
    );
  });
});
