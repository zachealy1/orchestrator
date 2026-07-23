import { describe, expect, it } from "vitest";
import {
  AGENT_NOTIFICATION_LEDGER_KEY,
  AGENT_NOTIFICATION_PREFERENCES_KEY,
  AGENT_NOTIFICATION_LEDGER_TTL_MS,
  buildSafeAgentNotificationCopy,
  createAgentNotificationEventKey,
  isAgentNotificationTargetNavigable,
  readAgentNotificationPreferences,
  recordAgentNotificationDelivered,
  shouldSendAgentNotification,
  validateAgentNotificationPreferences,
  wasAgentNotificationDelivered,
} from "./agentNotifications";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("agent notifications", () => {
  it("defaults missing and malformed preferences to enabled", () => {
    expect(validateAgentNotificationPreferences(null)).toEqual({
      responseCompleted: true,
      approvalRequired: true,
      userInputRequired: true,
      planReady: true,
      externalAction: true,
    });
    expect(
      readAgentNotificationPreferences(
        memoryStorage({ [AGENT_NOTIFICATION_PREFERENCES_KEY]: "not-json" }),
      ),
    ).toEqual({
      responseCompleted: true,
      approvalRequired: true,
      userInputRequired: true,
      planReady: true,
      externalAction: true,
    });
  });

  it("preserves valid category preferences independently", () => {
    expect(
      validateAgentNotificationPreferences({
        responseCompleted: false,
        approvalRequired: true,
        userInputRequired: false,
        planReady: false,
        externalAction: true,
      }),
    ).toEqual({
      responseCompleted: false,
      approvalRequired: true,
      userInputRequired: false,
      planReady: false,
      externalAction: true,
    });
  });

  it("suppresses completion in a focused app and action events only at a visible target", () => {
    const base = {
      preferences: validateAgentNotificationPreferences(null),
      permissionStatus: "allowed" as const,
      appVisible: true,
    };
    expect(
      shouldSendAgentNotification({
        ...base,
        kind: "response-completed",
        appFocused: true,
        targetVisible: false,
      }),
    ).toBe(false);
    expect(
      shouldSendAgentNotification({
        ...base,
        kind: "response-completed",
        appFocused: false,
        targetVisible: true,
      }),
    ).toBe(true);
    expect(
      shouldSendAgentNotification({
        ...base,
        kind: "approval-required",
        appFocused: true,
        targetVisible: true,
      }),
    ).toBe(false);
    expect(
      shouldSendAgentNotification({
        ...base,
        kind: "user-input-required",
        appFocused: true,
        targetVisible: true,
      }),
    ).toBe(false);
    expect(
      shouldSendAgentNotification({
        ...base,
        kind: "user-input-required",
        appFocused: true,
        targetVisible: false,
      }),
    ).toBe(true);
    expect(
      shouldSendAgentNotification({
        ...base,
        kind: "user-input-required",
        appFocused: true,
        appVisible: false,
        targetVisible: true,
      }),
    ).toBe(true);
    expect(
      shouldSendAgentNotification({
        ...base,
        kind: "plan-ready",
        appFocused: true,
        targetVisible: false,
      }),
    ).toBe(true);
  });

  it("requires permission and the matching category preference", () => {
    expect(
      shouldSendAgentNotification({
        kind: "external-action",
        preferences: {
          responseCompleted: true,
          approvalRequired: true,
          userInputRequired: true,
          planReady: true,
          externalAction: false,
        },
        permissionStatus: "allowed",
        appFocused: false,
        appVisible: false,
        targetVisible: false,
      }),
    ).toBe(false);
    expect(
      shouldSendAgentNotification({
        kind: "plan-ready",
        preferences: validateAgentNotificationPreferences(null),
        permissionStatus: "denied",
        appFocused: false,
        appVisible: false,
        targetVisible: false,
      }),
    ).toBe(false);
    expect(
      shouldSendAgentNotification({
        kind: "user-input-required",
        preferences: {
          ...validateAgentNotificationPreferences(null),
          userInputRequired: false,
        },
        permissionStatus: "allowed",
        appFocused: false,
        appVisible: false,
        targetVisible: false,
      }),
    ).toBe(false);
  });

  it("builds action copy without accepting command, URL, code, or token content", () => {
    expect(
      buildSafeAgentNotificationCopy({
        kind: "approval-required",
        chatTitle: "Update the header",
        workspaceLabel: "orchestrator",
      }),
    ).toEqual({
      title: "Approval required",
      body: "Update the header needs approval before Codex can continue.",
    });
    expect(
      buildSafeAgentNotificationCopy({
        kind: "external-action",
        accountLabel: "Work",
      }).body,
    ).toBe("Finish signing in to Codex for Work. Open Orchestrator to continue.");
    expect(
      buildSafeAgentNotificationCopy({
        kind: "user-input-required",
        chatTitle: "Choose the Snake game shape",
      }),
    ).toEqual({
      title: "Input required",
      body: "Choose the Snake game shape needs your answer before Codex can continue.",
    });
  });

  it("records only delivered event keys and expires old ledger entries", () => {
    const now = 10_000_000_000;
    const storage = memoryStorage({
      [AGENT_NOTIFICATION_LEDGER_KEY]: JSON.stringify([
        {
          eventKey: "old",
          deliveredAt: now - AGENT_NOTIFICATION_LEDGER_TTL_MS - 1,
        },
      ]),
    });
    expect(wasAgentNotificationDelivered("old", storage, now)).toBe(false);
    recordAgentNotificationDelivered("new", storage, now);
    expect(wasAgentNotificationDelivered("new", storage, now)).toBe(true);
  });

  it("creates stable keys and validates navigation targets", () => {
    expect(createAgentNotificationEventKey("plan-ready", "default", 12)).toBe(
      "plan-ready:default:12",
    );
    expect(
      isAgentNotificationTargetNavigable({
        eventKey: "approval:1",
        kind: "approval-required",
        workspaceId: 1,
        chatId: 2,
      }),
    ).toBe(true);
    expect(
      isAgentNotificationTargetNavigable({
        eventKey: "external:1",
        kind: "external-action",
        accountId: 4,
      }),
    ).toBe(true);
    expect(
      isAgentNotificationTargetNavigable({
        eventKey: "question:1",
        kind: "user-input-required",
        workspaceId: 1,
        chatId: 2,
        requestId: "question-1",
      }),
    ).toBe(true);
  });
});
