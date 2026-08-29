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

  it("validates process lifecycle payloads", () => {
    expect(
      codexEventValidation.parseProcessEvent({
        accountId: 4,
        profileKey: "default",
        status: "connected",
        message: "Connected",
      }),
    ).toMatchObject({ profileKey: "default", status: "connected" });
  });
});
