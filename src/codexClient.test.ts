import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import {
  listDefaultCodexSkills,
  loadPersistedRunActivity,
  readActiveCodexLogin,
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

  it("loads skills through the shared default profile", async () => {
    invokeMock.mockResolvedValue({
      data: [{ id: "review", name: "Code review" }],
    });

    await expect(listDefaultCodexSkills()).resolves.toEqual([
      expect.objectContaining({ id: "review", name: "Code review" }),
    ]);
    expect(invokeMock).toHaveBeenCalledWith("codex_default_profile_rpc", {
      method: "skill/list",
      params: { includeHidden: false },
    });
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
      safeDetails: [
        { label: "Repository", value: "openai/orchestrator" },
      ],
    });
  });
});
