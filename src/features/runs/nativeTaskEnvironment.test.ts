import { describe, expect, it, vi } from "vitest";
import { validateNativeTaskExecutionEnvironment } from "./nativeTaskEnvironment";

const binding = {
  version: 2 as const,
  kind: "kanban" as const,
  sourceWorkspacePath: "/workspace",
  executionDirectory: "/cards/card-1",
  runtimeWorkspaceRoots: ["/cards/card-1", "/cards/card-1/repo"],
  projectId: "project-1",
  pendingContinuationContext: null,
};

describe("native task execution environment", () => {
  it("checks every worktree and probes its terminal", async () => {
    const rpc = vi.fn(async (method: string, params: Record<string, unknown>) =>
      method === "fs/getMetadata"
        ? { isDirectory: true }
        : { exitCode: 0, stdout: `${params.cwd}\n`, stderr: "" },
    );

    await expect(
      validateNativeTaskExecutionEnvironment({
        binding,
        permissionProfile: "orchestrator_workspace_network_v1",
        rpc,
        ensureActive: vi.fn(),
      }),
    ).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("fs/getMetadata", {
      path: "/cards/card-1/repo",
    });
    expect(rpc).toHaveBeenLastCalledWith(
      "command/exec",
      expect.objectContaining({ cwd: "/cards/card-1" }),
    );
  });

  it("fails before execution when a worktree is missing", async () => {
    const rpc = vi.fn(async () => ({ isDirectory: false }));

    await expect(
      validateNativeTaskExecutionEnvironment({
        binding,
        permissionProfile: ":danger-full-access",
        rpc,
        ensureActive: vi.fn(),
      }),
    ).rejects.toThrow("The isolated worktree is unavailable");
    expect(rpc).not.toHaveBeenCalledWith("command/exec", expect.anything());
  });
});
