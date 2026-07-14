import { describe, expect, it } from "vitest";
import { parseApprovalRequest } from "./codexApprovals";

const base = {
  profileKey: "account:7" as const,
  requestToken: "request-token-1",
  interactionMode: "chat" as const,
};

function parse(method: string, params: Record<string, unknown>) {
  return parseApprovalRequest({
    ...base,
    message: { id: 9, method, params },
  })!;
}

describe("native Codex approval protocol", () => {
  it("renders only supplied command decisions and preserves object decisions exactly", () => {
    const rule = {
      acceptWithExecpolicyAmendment: {
        execpolicy_amendment: ["npm", "test"],
      },
    };
    const network = {
      applyNetworkPolicyAmendment: {
        network_policy_amendment: { host: "api.example.com", action: "allow" },
      },
    };
    const request = parse("item/commandExecution/requestApproval", {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      availableDecisions: ["accept", "acceptForSession", rule, network, "decline", "cancel"],
    });

    expect(request.choices.map((choice) => choice.label)).toEqual([
      "Approve once",
      "Approve for session",
      "Approve command rule",
      "Allow host in future",
      "Reject",
      "Cancel operation",
    ]);
    expect(request.choices[2].response).toEqual({ decision: rule });
    expect(request.choices[3].response).toEqual({ decision: network });
  });

  it("does not invent choices when the runtime supplies a restricted set", () => {
    const request = parse("item/commandExecution/requestApproval", {
      availableDecisions: ["decline", "not-a-native-decision"],
    });
    expect(request.choices.map((choice) => choice.label)).toEqual(["Reject"]);
  });

  it("uses the official normal-command fallback when availableDecisions is absent", () => {
    const request = parse("item/commandExecution/requestApproval", {
      proposedExecpolicyAmendment: ["git", "status"],
    });
    expect(request.choices.map((choice) => choice.label)).toEqual([
      "Approve once",
      "Approve command rule",
      "Cancel operation",
    ]);
  });

  it("uses native network and additional-permission fallbacks", () => {
    const network = parse("item/commandExecution/requestApproval", {
      networkApprovalContext: { host: "api.example.com", protocol: "https" },
      proposedNetworkPolicyAmendments: [
        { host: "api.example.com", action: "allow" },
      ],
    });
    expect(network.choices.map((choice) => choice.label)).toEqual([
      "Approve once",
      "Approve for session",
      "Allow host in future",
      "Cancel operation",
    ]);

    const permissions = parse("item/commandExecution/requestApproval", {
      additionalPermissions: { network: { enabled: true }, fileSystem: null },
    });
    expect(permissions.choices.map((choice) => choice.label)).toEqual([
      "Approve once",
      "Cancel operation",
    ]);
  });

  it("supports native file-change once, session, reject, and cancel decisions", () => {
    const request = parse("item/fileChange/requestApproval", {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
    });
    expect(request.choices.map((choice) => choice.response)).toEqual([
      { decision: "accept" },
      { decision: "acceptForSession" },
      { decision: "decline" },
      { decision: "cancel" },
    ]);
  });

  it("grants only the requested permission profile with native turn/session scope", () => {
    const requested = {
      network: { enabled: true },
      fileSystem: { write: ["/repo/shared"], read: null },
    };
    const request = parse("item/permissions/requestApproval", {
      permissions: requested,
    });
    expect(request.choices[0].response).toEqual({
      permissions: requested,
      scope: "turn",
    });
    expect(request.choices[1].response).toEqual({
      permissions: requested,
      scope: "turn",
      strictAutoReview: true,
    });
    expect(request.choices[2].response).toEqual({
      permissions: requested,
      scope: "session",
    });
    expect(request.choices[3].response).toEqual({
      permissions: {},
      scope: "turn",
    });
  });

  it("fails closed for unsupported server requests", () => {
    const request = parse("item/tool/requestUserInput", {
      threadId: "thread-1",
      turnId: "turn-1",
    });
    expect(request.kind).toBe("unsupported");
    expect(request.choices).toEqual([]);
    expect(request.error).toMatch(/not supported/i);
  });

  it("uses the installed legacy response vocabulary without converting denial", () => {
    const request = parse("execCommandApproval", {
      conversationId: "thread-1",
      callId: "call-1",
    });
    expect(request.choices.map((choice) => choice.response)).toEqual([
      { decision: "approved" },
      { decision: "approved_for_session" },
      { decision: "denied" },
      { decision: "abort" },
    ]);
  });
});
