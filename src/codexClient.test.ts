import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import {
  codexDefaultProfileRpc,
  consumeCodexRateLimitResetCredit,
  connectDefaultCodexProfile,
  listDefaultCodexSkills,
  loadPersistedRunActivity,
  readActiveCodexLogin,
  readBrowserRuntimeStatus,
  startCodexLogin,
} from "./codexClient";

describe("Codex account login client", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("starts hosted browser OAuth with Codex branding", async () => {
    invokeMock.mockResolvedValue({
      type: "chatgpt",
      loginId: "login-1",
      authUrl: "https://chatgpt.com/auth",
    });

    await startCodexLogin(8);

    expect(invokeMock).toHaveBeenCalledWith("codex_rpc", {
      accountId: 8,
      method: "account/login/start",
      params: {
        type: "chatgpt",
        useHostedLoginSuccessPage: true,
        appBrand: "codex",
      },
    });
  });

  it("reads the recoverable native login attempt", async () => {
    invokeMock.mockResolvedValue(null);

    await readActiveCodexLogin();

    expect(invokeMock).toHaveBeenCalledWith("codex_active_login");
  });

  it.each([["default", 0, "codex_default_profile_rpc"], ["account:8", 8, "codex_rpc"]] as const)("reads browser runtime inventory for %s without starting a task", async (profileKey, accountId, command) => {
    invokeMock.mockResolvedValue({ data: [{ name: "cua_repl", tools: { js: {} } }], nextCursor: null });
    await expect(readBrowserRuntimeStatus(profileKey, accountId)).resolves.toMatchObject({ status: "available" });
    expect(invokeMock).toHaveBeenCalledExactlyOnceWith(command, {
      ...(accountId === 0 ? {} : { accountId }),
      method: "mcpServerStatus/list", params: { cursor: null, detail: "toolsAndAuthOnly" },
    });
  });

  it("loads skills through the shared default profile", async () => {
    invokeMock.mockResolvedValue({
      data: [
        {
          cwd: "/tmp/project",
          errors: [],
          skills: [
            {
              name: "browser:control-in-app-browser",
              description: "Control the in-app Browser",
              enabled: true,
              path: "/tmp/browser/SKILL.md",
              scope: "system",
            },
          ],
        },
      ],
    });

    await expect(listDefaultCodexSkills()).resolves.toEqual([
      expect.objectContaining({
        id: "browser:control-in-app-browser",
        path: "/tmp/browser/SKILL.md",
        name: "browser:control-in-app-browser",
      }),
    ]);
    expect(invokeMock).toHaveBeenCalledWith("codex_default_profile_rpc", {
      method: "skills/list",
      params: { cwds: [], forceReload: false },
    });
  });

  it("falls back to the legacy skill endpoint", async () => {
    invokeMock.mockImplementation(async (_command, input) => {
      if (input.method === "skills/list") {
        throw new Error("Method not found");
      }
      return { data: [{ id: "review", name: "Code review" }] };
    });

    await expect(listDefaultCodexSkills()).resolves.toEqual([
      expect.objectContaining({ id: "review", name: "Code review" }),
    ]);
    expect(invokeMock).toHaveBeenNthCalledWith(2, "codex_default_profile_rpc", {
      method: "skill/list",
      params: { includeHidden: false },
    });
  });

  it("connects and retries when a shared-profile request wins the startup race", async () => {
    let rpcAttempts = 0;
    invokeMock.mockImplementation(async (command) => {
      if (command === "codex_default_profile_connect") {
        return { pid: 42, alreadyConnected: false, initialize: {} };
      }
      if (command === "codex_default_profile_rpc") {
        rpcAttempts += 1;
        if (rpcAttempts === 1) {
          throw new Error("Codex account 0 is not connected");
        }
        return { marketplaces: [] };
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    await expect(codexDefaultProfileRpc("plugin/list", { cwds: [] })).resolves.toEqual(
      { marketplaces: [] },
    );

    expect(invokeMock).toHaveBeenNthCalledWith(1, "codex_default_profile_rpc", {
      method: "plugin/list",
      params: { cwds: [] },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(
      2,
      "codex_default_profile_connect",
    );
    expect(invokeMock).toHaveBeenNthCalledWith(3, "codex_default_profile_rpc", {
      method: "plugin/list",
      params: { cwds: [] },
    });
  });

  it("coalesces concurrent shared-profile connection attempts", async () => {
    let finishConnection: (value: unknown) => void = () => {
      throw new Error("Connection resolver was not initialized");
    };
    invokeMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishConnection = resolve;
        }),
    );

    const first = connectDefaultCodexProfile();
    const second = connectDefaultCodexProfile();

    expect(first).toBe(second);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    finishConnection({ pid: 42, alreadyConnected: false, initialize: {} });
    await Promise.all([first, second]);
  });

  it("projects persisted run tools without exposing raw payloads", async () => {
    invokeMock.mockResolvedValue({
      commands: [],
      editedFiles: [],
      toolActivities: [
        {
          id: "tool-1",
          itemType: "mcpToolCall",
          server: "codex_apps",
          tool: "github.get_pr_info",
          title: "Read pull request details",
          status: "completed",
          durationMs: 750,
          sequence: 42,
          safeDetails: [
            { label: "Repository", value: "openai/orchestrator" },
          ],
        },
      ],
      nextCursor: null,
    });

    const result = await loadPersistedRunActivity({ runId: 19 });

    expect(invokeMock).toHaveBeenCalledWith("codex_persisted_run_activity", {
      runId: 19,
      cursor: null,
      limit: 100,
    });
    expect(result.toolActivities[0]).toMatchObject({
      id: "tool-1",
      category: "github",
      label: "Read pull request details",
      status: "completed",
      sequence: 42,
      safeDetails: [
        { label: "Repository", value: "openai/orchestrator" },
      ],
    });
  });
});

describe("Codex earned reset client", () => {
  beforeEach(() => invokeMock.mockReset());
  it.each([["default", 0, "codex_default_profile_rpc"], ["account:8", 8, "codex_rpc"]] as const)("redeems through %s with only an idempotency key", async (profileKey, accountId, command) => {
    invokeMock.mockResolvedValue({ outcome: "reset" });
    await expect(consumeCodexRateLimitResetCredit(profileKey, accountId, "logical-attempt")).resolves.toEqual({ outcome: "reset" });
    expect(invokeMock).toHaveBeenCalledExactlyOnceWith(command, {
      ...(accountId === 0 ? {} : { accountId }),
      method: "account/rateLimitResetCredit/consume", params: { idempotencyKey: "logical-attempt" },
    });
  });
  it("rejects unknown responses so an uncertain redemption can be retried", async () => {
    invokeMock.mockResolvedValue({ outcome: "unexpected" });
    await expect(consumeCodexRateLimitResetCredit("account:8", 8, "same-key")).rejects.toThrow("invalid usage-reset response");
  });
  it("does not send an empty request ID", async () => {
    await expect(consumeCodexRateLimitResetCredit("default", 0, " ")).rejects.toThrow("request ID is required");
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
