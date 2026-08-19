import { describe, expect, it } from "vitest";
import {
  emptyRunView,
  type RunViewState,
} from "../../lib/codexEventReducer";
import { isActiveRunControl, isNavigableRunControl } from "./runtimeTypes";

describe("run control navigation", () => {
  it("keeps a run navigable while user input is unresolved", () => {
    const control = {
      stopped: false,
      runView: {
        ...emptyRunView,
        status: "interrupted" as const,
        serverRequests: [
          {
            id: "request-1",
            method: "item/tool/requestUserInput",
          },
        ],
      } as RunViewState,
    };

    expect(isActiveRunControl(control)).toBe(false);
    expect(isNavigableRunControl(control)).toBe(true);
  });

  it("keeps a run navigable while an approval is unresolved", () => {
    const control = {
      stopped: false,
      runView: {
        ...emptyRunView,
        status: "interrupted" as const,
        approvalRequests: [{ key: "approval-1" }],
      } as RunViewState,
    };

    expect(isNavigableRunControl(control)).toBe(true);
  });

  it("does not expose stopped runs as live navigation targets", () => {
    const control = {
      stopped: true,
      runView: {
        ...emptyRunView,
        status: "running" as const,
      },
    };

    expect(isNavigableRunControl(control)).toBe(false);
  });
});
