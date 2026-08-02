import { describe, expect, it } from "vitest";
import { buildBoundedAccountHandoffContext } from "../App";

describe("buildBoundedAccountHandoffContext", () => {
  it("keeps the objective and approved plan while omitting synthetic implementation prompts", () => {
    const context = buildBoundedAccountHandoffContext(
      [
        {
          turnIndex: 1,
          prompt: "Build a responsive Snake game",
          finalMessage: "Prepared the implementation plan.",
          completedPlan: "# Snake plan\n\nImplement keyboard and touch controls.",
          intent: "plan",
          planReviewState: "approved",
        },
        {
          turnIndex: 2,
          prompt: "Implement the plan.",
          finalMessage: "Implemented the game and verified its controls.",
          completedPlan: "",
          intent: "plan-implementation",
          planReviewState: null,
        },
      ],
      "",
      2_000,
    );

    expect(context).toContain("Build a responsive Snake game");
    expect(context).toContain("Implement keyboard and touch controls");
    expect(context).toContain("Implemented the game");
    expect(context).not.toContain("User: Implement the plan.");
  });

  it("honours the transfer budget while retaining the original objective", () => {
    const context = buildBoundedAccountHandoffContext(
      [
        {
          turnIndex: 1,
          prompt: "Preserve this objective",
          finalMessage: "x".repeat(20_000),
          completedPlan: "",
          intent: "normal",
          planReviewState: null,
        },
      ],
      "",
      80,
    );

    expect(context).toContain("Preserve this objective");
    expect(context.length).toBeLessThan(1_000);
  });
});
