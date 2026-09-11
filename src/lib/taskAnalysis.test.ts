import { describe, expect, it } from "vitest";
import {
  estimateTokens,
  recommendRoute,
} from "./taskAnalysis";

describe("taskAnalysis", () => {
  it("estimates tokens from words and characters", () => {
    expect(estimateTokens("fix the tests")).toBe(4);
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });

  it("routes broad or risky prompts to plan-first", () => {
    expect(recommendRoute("Implement a database migration")).toBe("plan-first");
    expect(recommendRoute("Rename this button")).toBe("direct-run");
  });

});
