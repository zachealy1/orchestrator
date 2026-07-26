import { describe, expect, it } from "vitest";
import {
  findSafeApprovalDenialChoice,
  parseApprovalRequest,
  type ActivePlaywrightToolCall,
} from "./codexApprovals";

const base = {
  profileKey: "account:7" as const,
  requestToken: "request-token-1",
  interactionMode: "chat" as const,
};

function parse(
  method: string,
  params: Record<string, unknown>,
  activePlaywrightToolCalls: ActivePlaywrightToolCall[] = [],
) {
  return parseApprovalRequest({
    ...base,
    message: { id: 9, method, params },
    activePlaywrightToolCalls,
  })!;
}

describe("native Codex approval protocol", () => {
  it("selects the narrow native denial response for orphan recovery", () => {
    const request = parse("item/commandExecution/requestApproval", {
      availableDecisions: ["accept", "cancel"],
    });

    expect(findSafeApprovalDenialChoice(request)?.response).toEqual({
      decision: "cancel",
    });
  });

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

  it("accepts signed Orchestrator Playwright policy elicitations", () => {
    const request = parse("mcpServer/elicitation/request", {
      serverName: "playwright",
      mode: "form",
      _meta: {
        "orchestrator/browser-approval": {
          version: 1,
          nonce: "nonce",
          sessionToken: "0123456789abcdef0123456789abcdef",
          kind: "origin",
          origin: "https://example.com",
          action: "navigate",
        },
      },
    });

    expect(request.kind).toBe("browser");
    expect(request.browserRequest).toEqual({
      sessionToken: "0123456789abcdef0123456789abcdef",
      kind: "origin",
      origin: "https://example.com",
      action: "navigate",
    });
    expect(request.choices.map((choice) => choice.response)).toEqual([
      {
        action: "accept",
        content: { decision: "allow" },
        _meta: null,
      },
      {
        action: "decline",
        content: null,
        _meta: null,
      },
    ]);
  });

  it("accepts external WebSocket origins from the Playwright policy wrapper", () => {
    const request = parse("mcpServer/elicitation/request", {
      serverName: "playwright",
      mode: "form",
      _meta: {
        "orchestrator/browser-approval": {
          version: 1,
          nonce: "nonce",
          sessionToken: "0123456789abcdef0123456789abcdef",
          kind: "origin",
          origin: "wss://example.com",
          action: "open a WebSocket to this origin",
        },
      },
    });

    expect(request.kind).toBe("browser");
    expect(request.browserRequest?.origin).toBe("wss://example.com");
  });

  it("accepts a native Playwright tool approval only for its active correlated call", () => {
    const toolCall = {
      itemId: "browser-call-1",
      threadId: "thread-1",
      turnId: "turn-1",
      tool: "browser_tabs",
      arguments: {
        url: "http://127.0.0.1:3001/",
        action: "new",
      },
    };
    const request = parse(
      "mcpServer/elicitation/request",
      {
        threadId: "thread-1",
        turnId: "turn-1",
        serverName: "playwright",
        mode: "form",
        requestedSchema: { type: "object", properties: {} },
        _meta: {
          codex_approval_kind: "mcp_tool_call",
          persist: ["session", "always"],
          tool_description: "List, create, close, or select a browser tab.",
          tool_params: {
            action: "new",
            url: "http://127.0.0.1:3001/",
          },
          tool_params_display: [
            { display_name: "Action", name: "action", value: "new" },
            {
              display_name: "URL",
              name: "url",
              value: "http://127.0.0.1:3001/",
            },
          ],
        },
      },
      [toolCall],
    );

    expect(request.kind).toBe("browser-tool");
    expect(request.itemId).toBe("browser-call-1");
    expect(request.browserToolRequest).toEqual({
      itemId: "browser-call-1",
      tool: "browser_tabs",
      displayName: "Browser Tabs",
      description: "List, create, close, or select a browser tab.",
      parameters: [
        { name: "action", label: "Action", value: "new" },
        {
          name: "url",
          label: "URL",
          value: "http://127.0.0.1:3001/",
        },
      ],
    });
    expect(request.choices.map((choice) => choice.response)).toEqual([
      { action: "accept", content: {}, _meta: null },
      { action: "decline", content: null, _meta: null },
    ]);
  });

  it("redacts sensitive native Playwright tool parameters", () => {
    const toolCall = {
      itemId: "browser-call-2",
      threadId: "thread-1",
      turnId: "turn-1",
      tool: "browser_type",
      arguments: {
        action: "type",
        text: "top secret",
        password: "hunter2",
        url: "https://user:password@example.com/login?token=secret#form",
      },
    };
    const request = parse(
      "mcpServer/elicitation/request",
      {
        threadId: "thread-1",
        turnId: "turn-1",
        serverName: "playwright",
        mode: "form",
        requestedSchema: { type: "object", properties: {} },
        _meta: {
          codex_approval_kind: "mcp_tool_call",
          tool_description: "Type text into an editable element.",
          tool_params: toolCall.arguments,
          tool_params_display: [
            { display_name: "Action", name: "action", value: "type" },
            { display_name: "Text", name: "text", value: "top secret" },
            {
              display_name: "Password",
              name: "password",
              value: "hunter2",
            },
            {
              display_name: "URL",
              name: "url",
              value:
                "https://user:password@example.com/login?token=secret#form",
            },
          ],
        },
      },
      [toolCall],
    );

    expect(request.kind).toBe("browser-tool");
    expect(request.browserToolRequest?.parameters).toEqual([
      { name: "action", label: "Action", value: "type" },
      { name: "url", label: "URL", value: "https://example.com/login" },
    ]);
    expect(JSON.stringify(request.browserToolRequest)).not.toContain(
      "top secret",
    );
    expect(JSON.stringify(request.browserToolRequest)).not.toContain("hunter2");
    expect(JSON.stringify(request.browserToolRequest)).not.toContain(
      "token=secret",
    );
  });

  it.each([
    {
      label: "no active Playwright call",
      calls: [],
      toolParams: { action: "new", url: "http://127.0.0.1:3001/" },
    },
    {
      label: "mismatched tool arguments",
      calls: [
        {
          itemId: "browser-call-1",
          threadId: "thread-1",
          turnId: "turn-1",
          tool: "browser_tabs",
          arguments: { action: "select", index: 1 },
        },
      ],
      toolParams: { action: "new", url: "http://127.0.0.1:3001/" },
    },
    {
      label: "ambiguous active calls",
      calls: [
        {
          itemId: "browser-call-1",
          threadId: "thread-1",
          turnId: "turn-1",
          tool: "browser_tabs",
          arguments: { action: "new" },
        },
        {
          itemId: "browser-call-2",
          threadId: "thread-1",
          turnId: "turn-1",
          tool: "browser_tabs",
          arguments: { action: "new" },
        },
      ],
      toolParams: { action: "new" },
    },
  ])("rejects a native Playwright request with $label", ({ calls, toolParams }) => {
    const request = parse(
      "mcpServer/elicitation/request",
      {
        threadId: "thread-1",
        turnId: "turn-1",
        serverName: "playwright",
        mode: "form",
        requestedSchema: { type: "object", properties: {} },
        _meta: {
          codex_approval_kind: "mcp_tool_call",
          tool_description: "Manage browser tabs.",
          tool_params: toolParams,
          tool_params_display: [],
        },
      },
      calls,
    );

    expect(request.kind).toBe("unsupported");
    expect(request.choices).toEqual([]);
    expect(request.error).toMatch(/validated active Playwright/i);
  });

  it.each([
    {
      label: "another MCP server",
      params: {
        serverName: "other",
        mode: "form",
        _meta: {},
      },
    },
    {
      label: "credentials in an origin",
      params: {
        serverName: "playwright",
        mode: "form",
        _meta: {
          "orchestrator/browser-approval": {
            version: 1,
            sessionToken: "0123456789abcdef0123456789abcdef",
            kind: "origin",
            origin: "https://user:secret@example.com",
            action: "navigate",
          },
        },
      },
    },
    {
      label: "a malformed session token",
      params: {
        serverName: "playwright",
        mode: "form",
        _meta: {
          "orchestrator/browser-approval": {
            version: 1,
            sessionToken: "not-a-session",
            kind: "sensitive-action",
            origin: "https://example.com",
            action: "type into the requested field",
          },
        },
      },
    },
  ])("rejects $label", ({ params }) => {
    const request = parse("mcpServer/elicitation/request", params);
    expect(request.kind).toBe("unsupported");
    expect(request.choices).toEqual([]);
    expect(request.error).toMatch(/validated active Playwright approval/i);
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
