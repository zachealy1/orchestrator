import { describe, expect, it } from "vitest";
import { emptyRunView } from "./codexEventReducer";
import {
  buildCommitIntentContext,
  type WorkspaceCommitIntentContext,
} from "./commitMessage";
import type { RunIntent } from "./nativePlanMode";

function entry(input: {
  prompt: string;
  intent?: RunIntent;
  plan?: string;
  result?: string;
}) {
  return {
    prompt: input.prompt,
    runView: {
      ...emptyRunView,
      finalMessage: input.result ?? "",
      latestPlan: input.plan ?? "",
      nativePlan: {
        ...emptyRunView.nativePlan,
        intent: input.intent ?? "normal",
        completedText: input.plan ?? "",
      },
    },
  };
}

describe("buildCommitIntentContext", () => {
  it("uses an ordinary prompt and result as the commit intent", () => {
    expect(
      buildCommitIntentContext([
        entry({
          prompt: "Keep the header controls on one row",
          result: "Removed the responsive stacking rule.",
        }),
      ]),
    ).toEqual<WorkspaceCommitIntentContext>({
      objective: "Keep the header controls on one row",
      approvedPlan: null,
      implementationOutcome: "Removed the responsive stacking rule.",
    });
  });

  it("uses the originating objective and approved plan for implementation turns", () => {
    expect(
      buildCommitIntentContext([
        entry({
          prompt:
            "Create an expressJS app in this directory. Just plan out the scaffolding, nothing more",
          intent: "plan",
          plan:
            "Create a minimal Express scaffold with a GET /health endpoint.",
        }),
        entry({
          prompt: "Implement the plan.",
          intent: "plan-implementation",
          result:
            "Implemented a CommonJS Express app with GET /health returning status ok.",
        }),
      ]),
    ).toEqual<WorkspaceCommitIntentContext>({
      objective:
        "Create an expressJS app in this directory. Just plan out the scaffolding, nothing more",
      approvedPlan:
        "Create a minimal Express scaffold with a GET /health endpoint.",
      implementationOutcome:
        "Implemented a CommonJS Express app with GET /health returning status ok.",
    });
  });

  it("uses the latest revised plan without treating revision text as the objective", () => {
    expect(
      buildCommitIntentContext([
        entry({
          prompt: "Build Snake as a web app",
          intent: "plan",
          plan: "Build Snake with arrow-key controls.",
        }),
        entry({
          prompt: "Also support WASD",
          intent: "plan-revision",
          plan: "Build Snake with arrow-key and WASD controls.",
        }),
        entry({
          prompt: "Implement the plan.",
          intent: "plan-implementation",
          result: "Implemented both keyboard control schemes.",
        }),
      ]),
    ).toEqual<WorkspaceCommitIntentContext>({
      objective: "Build Snake as a web app",
      approvedPlan: "Build Snake with arrow-key and WASD controls.",
      implementationOutcome: "Implemented both keyboard control schemes.",
    });
  });

  it("never promotes an orphaned plan implementation prompt to an objective", () => {
    expect(
      buildCommitIntentContext([
        entry({
          prompt: "Implement the plan.",
          intent: "plan-implementation",
          result: "Added the requested Express scaffold.",
        }),
      ]),
    ).toEqual<WorkspaceCommitIntentContext>({
      objective: null,
      approvedPlan: null,
      implementationOutcome: "Added the requested Express scaffold.",
    });
  });
});
