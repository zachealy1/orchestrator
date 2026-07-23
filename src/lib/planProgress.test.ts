import { describe, expect, it } from "vitest";
import { emptyRunView, type RunViewState } from "./codexEventReducer";
import {
  derivePlanProgressIndicator,
  parseRunPlanProgress,
} from "./planProgress";

function runningPlan(
  statuses: string[],
  overrides: Partial<RunViewState> = {},
): RunViewState {
  return {
    ...emptyRunView,
    status: "running",
    planProgress: parseRunPlanProgress(
      statuses.map((status, index) => ({
        step: `Plan step ${index + 1}`,
        status,
      })),
    ),
    ...overrides,
  };
}

describe("plan progress", () => {
  it("derives the current step and authoritative total", () => {
    expect(
      derivePlanProgressIndicator(
        runningPlan(["completed", "in_progress", "pending", "pending"]),
      ),
    ).toEqual({
      currentStep: 2,
      totalSteps: 4,
      completedSteps: 1,
      progressPercent: 25,
      stepLabel: "Plan step 2",
      state: "in-progress",
    });
  });

  it("uses native approval and user-input states", () => {
    const waitingApproval = runningPlan(["completed", "in_progress"], {
      nativePlan: {
        ...emptyRunView.nativePlan,
        threadActiveFlags: ["waitingOnApproval"],
      },
    });
    expect(derivePlanProgressIndicator(waitingApproval)?.state).toBe(
      "waiting-approval",
    );

    const blocked = runningPlan(["completed", "in_progress"], {
      nativePlan: {
        ...emptyRunView.nativePlan,
        threadActiveFlags: ["waitingOnUserInput"],
      },
    });
    expect(derivePlanProgressIndicator(blocked)?.state).toBe("blocked");
  });

  it("represents explicit paused and failed progress states", () => {
    expect(
      derivePlanProgressIndicator(
        runningPlan(["completed", "paused", "pending"]),
      )?.state,
    ).toBe("paused");
    expect(
      derivePlanProgressIndicator(
        runningPlan(["completed", "failed", "pending"]),
      )?.state,
    ).toBe("failed");
  });

  it("hides single-step, completed, and cancelled plans", () => {
    expect(
      derivePlanProgressIndicator(runningPlan(["in_progress"])),
    ).toBeNull();
    expect(
      derivePlanProgressIndicator(runningPlan(["completed", "completed"])),
    ).toBeNull();
    expect(
      derivePlanProgressIndicator(
        runningPlan(["in_progress", "pending"], {
          nativePlan: {
            ...emptyRunView.nativePlan,
            phase: "cancelled",
          },
        }),
      ),
    ).toBeNull();
  });

  it("does not invent progress when step statuses are unavailable", () => {
    expect(
      derivePlanProgressIndicator(runningPlan(["unknown", "unknown"])),
    ).toBeNull();
  });
});
