import { describe, expect, it } from "vitest";
import { codexEventValidation } from "./CodexEventRouter";

describe("CodexEventRouter validation", () => {
  it("normalizes message routes with an account profile fallback", () => {
    expect(
      codexEventValidation.parseMessageRoute({
        accountId: 7,
        message: { method: "turn/completed", params: { turnId: "turn-1" } },
        requestToken: "request-1",
      }),
    ).toEqual({
      accountId: 7,
      profileKey: "account:7",
      message: {
        method: "turn/completed",
        params: { turnId: "turn-1" },
      },
      requestToken: "request-1",
    });
  });

  it("rejects malformed messages before they reach reducers", () => {
    expect(
      codexEventValidation.parseMessageRoute({
        accountId: 7,
        message: { method: 42 },
      }),
    ).toBeNull();
    expect(
      codexEventValidation.parseMessageRoute({
        accountId: "7",
        message: { method: "turn/completed" },
      }),
    ).toBeNull();
  });

  it("validates process and browser lifecycle payloads", () => {
    expect(
      codexEventValidation.parseProcessEvent({
        accountId: 4,
        profileKey: "default",
        status: "connected",
        message: "Connected",
      }),
    ).toMatchObject({ profileKey: "default", status: "connected" });
    expect(
      codexEventValidation.parseBrowserSession({
        token: "browser-1",
        status: "running",
        target: {
          profileKey: "account:4",
          workspaceId: 1,
          chatId: 2,
          runId: 3,
          entryId: "entry-1",
          threadId: "thread-1",
          turnId: "turn-1",
          accessMode: "ask-for-approval",
        },
        browserPid: 42,
        error: null,
      }),
    ).toMatchObject({ token: "browser-1", status: "running" });
    expect(
      codexEventValidation.parseBrowserSession({ status: "running" }),
    ).toBeNull();
    expect(
      codexEventValidation.parseBrowserSession({
        token: "browser-1",
        status: "running",
        target: {},
        browserPid: null,
        error: null,
      }),
    ).toBeNull();
  });
});
