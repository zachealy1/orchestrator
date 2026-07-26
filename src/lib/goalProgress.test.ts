import { describe, expect, it } from "vitest";
import {
  deriveGoalProgressIndicator,
  goalElapsedSeconds,
  goalKeepsRunOpen,
  parseThreadGoal,
} from "./goalProgress";

describe("goal progress", () => {
  it("parses the native goal payload and preserves authoritative timing", () => {
    expect(
      parseThreadGoal(
        {
          threadId: "thread-1",
          objective: "Finish the migration",
          status: "active",
          timeUsedSeconds: 72,
          tokensUsed: 1_500,
        },
        { observedAtMs: 10_000 },
      ),
    ).toEqual({
      threadId: "thread-1",
      objective: "Finish the migration",
      status: "active",
      timeUsedSeconds: 72,
      observedAtMs: 10_000,
    });
  });

  it("rejects malformed goals instead of inventing state", () => {
    expect(
      parseThreadGoal({
        threadId: "thread-1",
        objective: "",
        status: "active",
        timeUsedSeconds: 10,
      }),
    ).toBeNull();
    expect(
      parseThreadGoal({
        threadId: "thread-1",
        objective: "Finish the migration",
        status: "unknown",
        timeUsedSeconds: 10,
      }),
    ).toBeNull();
    expect(
      parseThreadGoal({
        threadId: "thread-1",
        objective: "Finish the migration",
        status: "active",
        timeUsedSeconds: -1,
      }),
    ).toBeNull();
  });

  it("increments only active goals and keeps paused goals open", () => {
    const active = parseThreadGoal(
      {
        threadId: "thread-1",
        objective: "Finish the migration",
        status: "active",
        timeUsedSeconds: 10,
      },
      { observedAtMs: 1_000 },
    )!;
    const paused = { ...active, status: "paused" as const };

    expect(goalElapsedSeconds(active, 4_900)).toBe(13);
    expect(goalElapsedSeconds(paused, 4_900)).toBe(10);
    expect(goalKeepsRunOpen(paused)).toBe(true);
    expect(goalKeepsRunOpen({ ...active, status: "complete" })).toBe(false);
  });

  it("hides completed goals and carries pending controls into the model", () => {
    const goal = parseThreadGoal({
      threadId: "thread-1",
      objective: "Finish the migration",
      status: "active",
      timeUsedSeconds: 10,
    })!;

    expect(deriveGoalProgressIndicator(goal, "pausing")).toEqual({
      ...goal,
      actionPending: "pausing",
    });
    expect(
      deriveGoalProgressIndicator({ ...goal, status: "complete" }, null),
    ).toBeNull();
  });
});
