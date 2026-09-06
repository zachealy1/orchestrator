import { describe, expect, it } from "vitest";
import { readAppStyles } from "../test/readAppStyles";

const css = readAppStyles();

describe("branch creation field CSS", () => {
  it("does not add a blue highlight when the branch-name input is focused", () => {
    expect(css).toMatch(
      /\.branch-creation-field input:focus,\s*\.branch-creation-field input:focus-visible\s*\{[^}]*border-color: var\(--color-divider\);[^}]*box-shadow: none;/,
    );
  });
});
