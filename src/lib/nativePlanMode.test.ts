import { describe, expect, it } from "vitest";
import {
  composeOrchestratorDeveloperInstructions,
  GENERATED_IMAGE_HANDLING_POLICY,
  isNativeUserInputRequest,
  isNativePlanItem,
  isServerRequestResolvedMessage,
  readThreadStatus,
  messageMatchesRun,
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
        developer_instructions: GENERATED_IMAGE_HANDLING_POLICY,
      },
    });
    expect(modes.default.settings.reasoning_effort).toBe("high");
  });

  it("composes the generated-image policy exactly once with upstream instructions", () => {
    const upstream = "Preserve the existing application architecture.";
    const composed = composeOrchestratorDeveloperInstructions(upstream);

    expect(composed).toBe(`${upstream}\n\n${GENERATED_IMAGE_HANDLING_POLICY}`);
    expect(composeOrchestratorDeveloperInstructions(composed)).toBe(composed);
    expect(composeOrchestratorDeveloperInstructions(null)).toBe(
      GENERATED_IMAGE_HANDLING_POLICY,
    );
  });

  it("fails closed when native Plan support is incomplete", () => {
    expect(() =>
      selectNativePlanModes([{ name: "Default", mode: "default" }], null, null),
    ).toThrow(/both Plan and Default/);
  });

  it("recognizes structured user-input requests and rejects stale routing ids", () => {
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
    expect(messageMatchesRun(request, "thread-1", "turn-1")).toBe(true);
    expect(messageMatchesRun(request, "thread-2", "turn-1")).toBe(false);
    expect(messageMatchesRun(request, "thread-1", "turn-2")).toBe(false);
  });

  it("guards native plan items, resolution notifications, and active thread flags", () => {
    expect(isNativePlanItem({ type: "plan", id: "plan-1", text: "Do it" })).toBe(true);
    expect(isNativePlanItem({ type: "plan", text: "Missing id" })).toBe(false);
    expect(
      isServerRequestResolvedMessage({
        method: "serverRequest/resolved",
        params: { requestId: 9 },
      }),
    ).toBe(true);
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
