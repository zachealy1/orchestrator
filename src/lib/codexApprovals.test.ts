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

  it("grants only validated exact filesystem entries for the current turn", () => {
    const requested = {
      fileSystem: {
        entries: [
          {
            access: "write",
            path: { type: "path", path: "/Users/example/.npm" },
            ignoredField: "not echoed",
          },
          {
            access: "read",
            path: {
              type: "path",
              path: "/Users/example/.config/tool/config.json",
            },
          },
        ],
        globScanMaxDepth: 12,
      },
    };
    const request = parse("item/permissions/requestApproval", {
      permissions: requested,
    });
    expect(request.choices[0].response).toEqual({
      permissions: {
        fileSystem: {
          entries: [
            {
              access: "write",
              path: { type: "path", path: "/Users/example/.npm" },
            },
            {
              access: "read",
              path: {
                type: "path",
                path: "/Users/example/.config/tool/config.json",
              },
            },
          ],
        },
      },
      scope: "turn",
    });
    expect(request.choices[1].response).toEqual({
      permissions: {},
      scope: "turn",
    });
    expect(request.choices.map((choice) => choice.label)).toEqual([
      "Allow for this turn",
      "Deny access",
    ]);
    expect(
      request.choices.some((choice) => choice.broadScope),
    ).toBe(false);
  });

  it.each([
    {
      label: "a filesystem root",
      entry: { access: "write", path: { type: "path", path: "/" } },
    },
    {
      label: "a path with parent traversal",
      entry: {
        access: "write",
        path: { type: "path", path: "/Users/example/../shared" },
      },
    },
    {
      label: "a glob pattern",
      entry: {
        access: "write",
        path: { type: "glob_pattern", pattern: "/Users/example/**" },
      },
    },
    {
      label: "a special root",
      entry: {
        access: "write",
        path: { type: "special", value: "root" },
      },
    },
  ])("fails closed for $label", ({ entry }) => {
    const request = parse("item/permissions/requestApproval", {
      permissions: {
        fileSystem: { entries: [entry] },
      },
    });

    expect(request.error).toMatch(/exact|malformed/i);
    expect(request.choices.map((choice) => choice.label)).toEqual([
      "Deny access",
    ]);
    expect(request.choices[0].response).toEqual({
      permissions: {},
      scope: "turn",
    });
  });

  it("removes persistent command decisions when exact extra filesystem access is requested", () => {
    const request = parse("item/commandExecution/requestApproval", {
      command: "npm install",
      additionalPermissions: {
        fileSystem: {
          entries: [
            {
              access: "write",
              path: { type: "path", path: "/Users/example/.npm" },
            },
          ],
        },
      },
      availableDecisions: [
        "accept",
        "acceptForSession",
        {
          acceptWithExecpolicyAmendment: {
            execpolicy_amendment: ["npm", "install"],
          },
        },
        "decline",
        "cancel",
      ],
    });

    expect(request.error).toBeNull();
    expect(request.choices.map((choice) => choice.label)).toEqual([
      "Approve once",
      "Reject",
      "Cancel operation",
    ]);
  });

  it("does not offer command approval for malformed extra filesystem access", () => {
    const request = parse("item/commandExecution/requestApproval", {
      command: "npm install",
      additionalPermissions: {
        fileSystem: {
          entries: [
            {
              access: "write",
              path: { type: "glob_pattern", pattern: "/Users/example/**" },
            },
          ],
        },
      },
      availableDecisions: ["accept", "acceptForSession", "cancel"],
    });

    expect(request.error).toMatch(/broad|malformed/i);
    expect(request.choices.map((choice) => choice.label)).toEqual([
      "Cancel operation",
    ]);
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
