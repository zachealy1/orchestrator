import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRunController } from "./useRunController";

describe("useRunController", () => {
  it("keeps the current run view available to event callbacks", () => {
    const { result } = renderHook(useRunController);

    act(() => {
      result.current.setRunView((current) => ({
        ...current,
        status: "running",
      }));
    });

    expect(result.current.runView.status).toBe("running");
    expect(result.current.runViewRef.current.status).toBe("running");
  });

  it("owns action locks per app instance", () => {
    const first = renderHook(useRunController);
    const second = renderHook(useRunController);
    first.result.current.planActionLocksRef.current.add("plan-1");

    expect(second.result.current.planActionLocksRef.current.has("plan-1")).toBe(
      false,
    );
  });
});
