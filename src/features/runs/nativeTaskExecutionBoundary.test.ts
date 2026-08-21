import { describe, expect, it } from "vitest";
import { verifyNativeTaskCommandEvent } from "./nativeTaskExecutionBoundary";

const binding = {
  version: 4 as const,
  kind: "kanban" as const,
  sourceWorkspacePath: "/workspace",
  executionDirectory: "/cards/card-1",
  runtimeWorkspaceRoots: ["/cards/card-1", "/cards/card-1/repo"],
  pendingContinuationContext: null,
  sourceRootAssociation: "source-root" as const,
};

function command(cwd?: string) {
  return {
    method: "item/started",
    params: {
      item: {
        id: "command-1",
        type: "commandExecution",
        ...(cwd === undefined ? {} : { cwd }),
      },
    },
  };
}

describe("native task command execution boundaries", () => {
  it("accepts commands in the execution root and repository worktrees", () => {
    expect(verifyNativeTaskCommandEvent(binding, command("/cards/card-1"))).toEqual({
      commandObserved: true,
      error: null,
    });
    expect(
      verifyNativeTaskCommandEvent(binding, command("/cards/card-1/repo/src")),
    ).toEqual({ commandObserved: true, error: null });
  });

  it("rejects source-workspace and unverifiable command directories", () => {
    expect(
      verifyNativeTaskCommandEvent(binding, command("/workspace")),
    ).toEqual({
      commandObserved: true,
      error: expect.stringContaining("outside the isolated card worktree"),
    });
    expect(verifyNativeTaskCommandEvent(binding, command())).toEqual({
      commandObserved: true,
      error: expect.stringContaining("without a verifiable"),
    });
  });

  it("ignores non-command activity", () => {
    expect(
      verifyNativeTaskCommandEvent(binding, {
        method: "item/started",
        params: { item: { type: "agentMessage" } },
      }),
    ).toEqual({ commandObserved: false, error: null });
  });
});
