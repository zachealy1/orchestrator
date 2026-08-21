import { describe, expect, it } from "vitest";
import type { KanbanGitBinding } from "../features/kanban/api";
import {
  clearNativeTaskPendingContext,
  createContinuationNativeTaskWorkspaceBinding,
  createKanbanNativeTaskWorkspaceBinding,
  markNativeTaskSourceRootAssociated,
  markNativeTaskEnvironmentVerified,
  nativeTaskEnvironmentIsVerified,
  nativeTaskExecutionOverrides,
  nativeTaskThreadStartOverrides,
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
      version: 6,
      kind: "kanban",
      sourceWorkspacePath: "/workspace",
      executionDirectory: "/app/cards/card-1",
      runtimeWorkspaceRoots: [
        "/app/cards/card-1",
        "/app/cards/card-1/repo",
      ],
      pendingContinuationContext: null,
      sourceRootAssociation: "pending",
      verifiedEnvironmentThreadId: null,
    });
    expect(nativeTaskExecutionOverrides(result)).toEqual({
      cwd: "/app/cards/card-1",
      runtimeWorkspaceRoots: [
        "/app/cards/card-1",
        "/app/cards/card-1/repo",
      ],
      environments: [
        {
          environmentId: "local",
          cwd: "/app/cards/card-1",
          runtimeWorkspaceRoots: [
            "/app/cards/card-1",
            "/app/cards/card-1/repo",
          ],
        },
      ],
    });
    expect(nativeTaskThreadStartOverrides(result)).toEqual({
      cwd: "/workspace",
      runtimeWorkspaceRoots: [
        "/app/cards/card-1",
        "/app/cards/card-1/repo",
      ],
      environments: [
        {
          environmentId: "local",
          cwd: "/app/cards/card-1",
          runtimeWorkspaceRoots: [
            "/app/cards/card-1",
            "/app/cards/card-1/repo",
          ],
        },
      ],
    });
    const verified = markNativeTaskEnvironmentVerified(result, "thread-1");
    expect(nativeTaskEnvironmentIsVerified(verified, "thread-1")).toBe(true);
    expect(nativeTaskEnvironmentIsVerified(verified, "thread-2")).toBe(false);
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
    expect(clearNativeTaskPendingContext(result)).toEqual({
      ...result,
      pendingContinuationContext: null,
    });
    expect(markNativeTaskSourceRootAssociated(result)).toEqual({
      ...result,
      sourceRootAssociation: "source-root",
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
        JSON.stringify({ ...valid, version: 7 }),
      ),
    ).toBeNull();
    expect(
      parseNativeTaskWorkspaceBinding(
        JSON.stringify({ ...valid, runtimeWorkspaceRoots: [null] }),
      ),
    ).toBeNull();
  });

  it("upgrades version-one synthetic environment bindings", () => {
    const parsed = parseNativeTaskWorkspaceBinding(
      JSON.stringify({
        version: 1,
        kind: "kanban",
        sourceWorkspacePath: "/workspace",
        executionDirectory: "/app/cards/card-1",
        runtimeWorkspaceRoots: ["/app/cards/card-1"],
        environmentId: "orchestrator:kanban:card-1",
        pendingContinuationContext: null,
      }),
    );

    expect(parsed).toEqual({
      version: 6,
      kind: "kanban",
      sourceWorkspacePath: "/workspace",
      executionDirectory: "/app/cards/card-1",
      runtimeWorkspaceRoots: ["/app/cards/card-1"],
      pendingContinuationContext: null,
      sourceRootAssociation: "pending",
      verifiedEnvironmentThreadId: null,
    });
  });

  it("forces legacy bindings through source-workspace registration", () => {
    const parsed = parseNativeTaskWorkspaceBinding(
      JSON.stringify({
        version: 2,
        kind: "continuation",
        sourceWorkspacePath: "/workspace",
        executionDirectory: "/workspace",
        runtimeWorkspaceRoots: ["/workspace"],
        projectId: "project-1",
        pendingContinuationContext: null,
      }),
    );

    expect(parsed?.sourceRootAssociation).toBe("pending");
  });

  it("forces version-three project bindings through source-root association", () => {
    const parsed = parseNativeTaskWorkspaceBinding(
      JSON.stringify({
        version: 3,
        kind: "continuation",
        sourceWorkspacePath: "/workspace",
        executionDirectory: "/workspace",
        runtimeWorkspaceRoots: ["/workspace"],
        projectId: "project-1",
        pendingContinuationContext: null,
        catalogRegistration: "source-workspace",
      }),
    );

    expect(parsed?.sourceRootAssociation).toBe("pending");
  });

  it("preserves version-five source association but invalidates its environment proof", () => {
    const parsed = parseNativeTaskWorkspaceBinding(
      JSON.stringify({
        version: 5,
        kind: "kanban",
        sourceWorkspacePath: "/workspace",
        executionDirectory: "/app/cards/card-1",
        runtimeWorkspaceRoots: [
          "/app/cards/card-1",
          "/app/cards/card-1/repo",
        ],
        pendingContinuationContext: null,
        sourceRootAssociation: "source-root",
        verifiedEnvironmentThreadId: "thread-legacy-proof",
      }),
    );

    expect(parsed).toEqual({
      version: 6,
      kind: "kanban",
      sourceWorkspacePath: "/workspace",
      executionDirectory: "/app/cards/card-1",
      runtimeWorkspaceRoots: [
        "/app/cards/card-1",
        "/app/cards/card-1/repo",
      ],
      pendingContinuationContext: null,
      sourceRootAssociation: "source-root",
      verifiedEnvironmentThreadId: null,
    });
  });
});
