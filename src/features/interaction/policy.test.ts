import { describe, expect, it } from "vitest";
import { confirmationMatchesAction, evaluateInteractionAction } from "./policy";
import type { InteractionAction } from "./types";

const action: InteractionAction = {
  id: "action-1",
  sessionId: "session-1",
  observationId: "observation-1",
  surfaceId: "browser-1",
  generation: 3,
  kind: "click",
  argumentHash: "args-none",
  target: {
    kind: "semantic",
    grounding: "accessibility",
    elementRef: "ax-2",
  },
  expectedEffect: "Open account settings",
  consequence: "reversible",
  idempotent: true,
  grounding: "accessibility",
  retryCount: 0,
};

describe("interaction policy", () => {
  it("blocks desktop control of terminal applications", () => {
    expect(
      evaluateInteractionAction(action, {
        origin: null,
        bundleId: "com.apple.Terminal",
        permission: "allow-always",
        developerModeEnabled: false,
      }).outcome,
    ).toBe("block");
  });

  it("requires takeover for credentials and payments", () => {
    expect(
      evaluateInteractionAction(
        { ...action, expectedEffect: "Enter the one-time verification code" },
        {
          origin: "https://accounts.example",
          bundleId: null,
          permission: "allow-always",
          developerModeEnabled: false,
        },
      ).outcome,
    ).toBe("takeover");
  });

  it("binds confirmations to action, observation, generation, and origin", () => {
    const context = {
      origin: "https://example.com",
      bundleId: null,
      permission: "allow-always" as const,
      developerModeEnabled: false,
    };
    const decision = evaluateInteractionAction(
      { ...action, expectedEffect: "Submit the form", consequence: "external-side-effect" },
      context,
    );
    expect(decision.outcome).toBe("confirm");
    expect(
      confirmationMatchesAction(decision.confirmationKey!, {
        ...action,
        expectedEffect: "Submit the form",
        consequence: "external-side-effect",
      }, context),
    ).toBe(true);
    expect(
      confirmationMatchesAction(decision.confirmationKey!, {
        ...action,
        generation: 4,
        expectedEffect: "Submit the form",
        consequence: "external-side-effect",
      }, context),
    ).toBe(false);
  });
});
