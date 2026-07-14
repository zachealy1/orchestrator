import { describe, expect, it } from "vitest";
import {
  buildRunPrompt,
  estimateTokens,
  improvePrompt,
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

  it("builds deterministic improved prompts", () => {
    const improved = improvePrompt("Add search");
    expect(improved).toContain("Objective:");
    expect(improved).toContain("Acceptance criteria:");
    expect(improved).toContain("Add search");
  });

  it("adds subagent recommendations to run prompts", () => {
    const prompt = buildRunPrompt("Objective:\nReview", [
      { kind: "subagent", title: "Security", body: "Spawn a security subagent." },
      { kind: "route", title: "Plan", body: "Start with a plan." },
    ]);

    expect(prompt).toContain("Recommended delegation:");
    expect(prompt).toContain("Spawn a security subagent.");
    expect(prompt).not.toContain("Start with a plan.");
  });
});
