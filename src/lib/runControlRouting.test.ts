import { describe, expect, it } from "vitest";
import {
  selectRunControlForIds,
  type RunControlRouteCandidate,
} from "./runControlRouting";

function control(
  overrides: Partial<RunControlRouteCandidate & { id: string }> = {},
): RunControlRouteCandidate & { id: string } {
  return {
    id: "control",
    profileKey: "account:3",
    stopped: false,
    threadId: "thread-1",
    turnId: null,
    startedAt: "2026-07-26T15:00:00.000Z",
    acceptsThreadContinuation: false,
    ...overrides,
  };
}

describe("run control routing", () => {
  it("routes a thread-scoped request to the newest active control", () => {
    const oldControl = control({
      id: "old",
      turnId: "turn-old",
      startedAt: "2026-07-26T15:00:00.000Z",
    });
    const currentControl = control({
      id: "current",
      turnId: "turn-current",
      startedAt: "2026-07-26T15:05:00.000Z",
    });

    expect(
      selectRunControlForIds(
        [oldControl, currentControl],
        "account:3",
        "thread-1",
        null,
      ),
    ).toBe(currentControl);
  });

  it("prefers an exact turn even when it is older", () => {
    const oldControl = control({
      id: "old",
      turnId: "turn-old",
      startedAt: "2026-07-26T15:00:00.000Z",
    });
    const currentControl = control({
      id: "current",
      turnId: "turn-current",
      startedAt: "2026-07-26T15:05:00.000Z",
    });

    expect(
      selectRunControlForIds(
        [oldControl, currentControl],
        "account:3",
        "thread-1",
        "turn-old",
      ),
    ).toBe(oldControl);
  });

  it("does not guess when a request has no run identity", () => {
    expect(
      selectRunControlForIds(
        [
          control({ id: "one" }),
          control({ id: "two", threadId: "thread-2" }),
        ],
        "account:3",
        null,
        null,
      ),
    ).toBeNull();
  });

  it("routes a new Goal Mode turn to the active thread control", () => {
    const goalControl = control({
      id: "goal",
      turnId: "turn-initial",
      acceptsThreadContinuation: true,
    });

    expect(
      selectRunControlForIds(
        [goalControl],
        "account:3",
        "thread-1",
        "turn-continuation",
      ),
    ).toBe(goalControl);
  });

  it("does not route a mismatched ordinary turn by thread alone", () => {
    expect(
      selectRunControlForIds(
        [control({ turnId: "turn-current" })],
        "account:3",
        "thread-1",
        "turn-other",
      ),
    ).toBeNull();
  });
});
