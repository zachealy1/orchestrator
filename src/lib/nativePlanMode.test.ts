import { describe, expect, it } from "vitest";
import {
  withNativeModeDefaults,
  isNativeUserInputRequest,
  isNativePlanItem,
  readThreadStatus,
  selectNativePlanModes,
} from "./nativePlanMode";

describe("nativePlanMode", () => {
  it("selects exact Plan and Default presets while filling unset model settings", () => {
    const modes = selectNativePlanModes(
      [
        { name: "Plan", mode: "plan", reasoning_effort: "medium" },
        { name: "Default", mode: "default" },
      ],
      "gpt-5.4",
      "high",
    );

    expect(modes.plan).toEqual({
      mode: "plan",
      settings: {
        model: "gpt-5.4",
        reasoning_effort: "medium",
        developer_instructions: null,
      },
    });
    expect(modes.default.settings.reasoning_effort).toBe("high");
  });

  it("discards persisted app instructions without changing model or effort", () => {
    const saved = { mode: "default" as const, settings: {
      model: "gpt-5.5", reasoning_effort: "high", developer_instructions: "Implement everything.",
    } };
    expect(withNativeModeDefaults(saved)).toEqual({ ...saved, settings: {
      ...saved.settings, developer_instructions: null,
    } });
    expect(saved.settings.developer_instructions).toBe("Implement everything.");
  });

  it("fails closed when native Plan support is incomplete", () => {
    expect(() =>
      selectNativePlanModes([{ name: "Default", mode: "default" }], null, null),
    ).toThrow(/both Plan and Default/);
  });

  it("recognizes structured user-input requests", () => {
    const request = {
      id: 7,
      method: "item/tool/requestUserInput",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
        questions: [],
        autoResolutionMs: null,
      },
    };

    expect(isNativeUserInputRequest(request)).toBe(true);
  });

  it("guards native plan items and active thread flags", () => {
    expect(isNativePlanItem({ type: "plan", id: "plan-1", text: "Do it" })).toBe(true);
    expect(isNativePlanItem({ type: "plan", text: "Missing id" })).toBe(false);
    expect(
      readThreadStatus({
        method: "thread/status/changed",
        params: {
          status: {
            type: "active",
            activeFlags: ["waitingOnUserInput", "unknown"],
          },
        },
      }),
    ).toEqual({ type: "active", activeFlags: ["waitingOnUserInput"] });
  });
});
