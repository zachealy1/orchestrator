import { describe, expect, it } from "vitest";
import type { KanbanGitBinding } from "../features/kanban/api";
import {
  clearNativeTaskPendingContext,
  createContinuationNativeTaskWorkspaceBinding,
  createKanbanNativeTaskWorkspaceBinding,
  nativeTaskTurnEnvironment,
  parseNativeTaskWorkspaceBinding,
} from "./nativeTaskWorkspaceBinding";

const binding: KanbanGitBinding = {
  sourceRepositoryPath: "/workspace/repo",
  relativePath: "repo",
  executionRoot: "/app/cards/card-1",
  sourceBranch: "main",
  baseBranch: "main",
  baseCommit: "0123456789abcdef",
  cardBranch: "codex/card-one",
  worktreePath: "/app/cards/card-1/repo",
  status: "ready",
  error: null,
};

describe("native task workspace bindings", () => {
  it("keeps the source project separate from the Kanban execution environment", () => {
    const result = createKanbanNativeTaskWorkspaceBinding({
      cardId: "card-1",
      sourceWorkspacePath: "/workspace",
      executionDirectory: binding.executionRoot,
      bindings: [binding],
    });

    expect(result).toEqual({
      version: 1,
      kind: "kanban",
      sourceWorkspacePath: "/workspace",
      executionDirectory: "/app/cards/card-1",
      runtimeWorkspaceRoots: [
        "/app/cards/card-1",
        "/app/cards/card-1/repo",
      ],
      environmentId: "orchestrator:kanban:card-1",
      pendingContinuationContext: null,
    });
    expect(nativeTaskTurnEnvironment(result)).toEqual({
      environmentId: "orchestrator:kanban:card-1",
      cwd: "/app/cards/card-1",
      runtimeWorkspaceRoots: [
        "/app/cards/card-1",
        "/app/cards/card-1/repo",
      ],
    });
  });

  it("deduplicates continuation roots and retains pending sanitized context", () => {
    const result = createContinuationNativeTaskWorkspaceBinding({
      chatId: 42,
      sourceWorkspacePath: "/workspace",
      executionDirectory: "/app/continuations/42",
      runtimeWorkspaceRoots: [
        "/app/continuations/42",
        "/app/continuations/42/repo",
        "/app/continuations/42/repo",
      ],
      pendingContinuationContext: "Visible completed turns",
    });

    expect(result.runtimeWorkspaceRoots).toEqual([
      "/app/continuations/42",
      "/app/continuations/42/repo",
    ]);
    expect(result.environmentId).toBe("orchestrator:continuation:42");
    expect(clearNativeTaskPendingContext(result)).toEqual({
      ...result,
      pendingContinuationContext: null,
    });
  });

  it("validates persisted bindings without accepting malformed metadata", () => {
    const valid = createKanbanNativeTaskWorkspaceBinding({
      cardId: "card-1",
      sourceWorkspacePath: "/workspace",
      executionDirectory: binding.executionRoot,
      bindings: [binding],
    });

    expect(parseNativeTaskWorkspaceBinding(JSON.stringify(valid))).toEqual(valid);
    expect(parseNativeTaskWorkspaceBinding("not-json")).toBeNull();
    expect(
      parseNativeTaskWorkspaceBinding(
        JSON.stringify({ ...valid, version: 2 }),
      ),
    ).toBeNull();
    expect(
      parseNativeTaskWorkspaceBinding(
        JSON.stringify({ ...valid, runtimeWorkspaceRoots: [null] }),
      ),
    ).toBeNull();
  });
});
