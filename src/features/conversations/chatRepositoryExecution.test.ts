import { describe, expect, it, vi } from "vitest";
import type { KanbanGitBinding } from "../kanban/api";
import type { WorkspaceGitRepositoryStatus } from "../workspaces/types";
import { reconcileChatRepositoriesForWorkspace } from "./chatRepositoryExecution";

function binding(overrides: Partial<KanbanGitBinding> = {}): KanbanGitBinding {
  return {
    sourceRepositoryPath: "/workspace/app",
    relativePath: "app",
    executionRoot: "/cards/chat-7",
    sourceBranch: "main",
    baseBranch: "main",
    baseCommit: "app-head",
    cardBranch: "codex/chat-app",
    worktreePath: "/cards/chat-7/app",
    status: "ready",
    error: null,
    ...overrides,
  };
}

function repository(path: string): WorkspaceGitRepositoryStatus {
  const segments = path.split("/");
  const label = segments[segments.length - 1] ?? path;
  return {
    workspacePath: "/workspace",
    gitRoot: path,
    currentBranch: "main",
    files: [],
    repository: {
      rootPath: path,
      relativePath: label,
      label,
    },
  };
}

function dependencies() {
  return {
    ensureTitle: vi.fn().mockResolvedValue("Update app and docs"),
    expand: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue({
      status: "cleaned",
      worktreeRemoved: true,
    }),
  };
}

describe("chat repository execution", () => {
  it("awaits the persisted title before expanding and uses that title", async () => {
    const native = dependencies();
    let settle!: (title: string) => void;
    native.ensureTitle.mockImplementation(() => new Promise((resolve) => { settle = resolve; }));
    native.expand.mockResolvedValue({ complete: true, repositories: [], errors: [] });
    const expansion = reconcileChatRepositoriesForWorkspace({
      chatId: 7,
      repositories: [repository("/workspace/app"), repository("/workspace/docs")],
      bindings: [binding()],
      dependencies: native,
    });
    expect(native.expand).not.toHaveBeenCalled();
    settle("Fix readable branch names");
    await expansion;
    expect(native.expand).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ cardSlug: "Fix readable branch names" }));
  });

  it("does not expand if the title cannot be saved", async () => {
    const native = dependencies();
    native.ensureTitle.mockRejectedValue(new Error("Title persistence failed"));
    await expect(reconcileChatRepositoriesForWorkspace({
      chatId: 7,
      repositories: [repository("/workspace/app"), repository("/workspace/docs")],
      bindings: [binding()],
      dependencies: native,
    })).rejects.toThrow("Title persistence failed");
    expect(native.expand).not.toHaveBeenCalled();
  });

  it("adds newly discovered repositories without replacing existing worktrees", async () => {
    const existing = binding();
    const added = binding({
      sourceRepositoryPath: "/workspace/docs",
      relativePath: "docs",
      cardBranch: "codex/chat-docs",
      worktreePath: "/cards/chat-7/docs",
    });
    const native = dependencies();
    native.expand.mockResolvedValue({
      complete: true,
      repositories: [added],
      errors: [],
    });

    await expect(
      reconcileChatRepositoriesForWorkspace({
        chatId: 7,
        repositories: [repository("/workspace/app"), repository("/workspace/docs")],
        bindings: [existing],
        dependencies: native,
      }),
    ).resolves.toEqual([existing, added]);
    expect(native.expand).toHaveBeenCalledWith({
      cardId: "chat-7",
      cardSlug: "Update app and docs",
      existingBindings: [existing],
      repositories: [
        {
          repositoryPath: "/workspace/docs",
          relativePath: "docs",
          includeDirtyChanges: false,
        },
      ],
    });
    expect(native.save).toHaveBeenCalledWith(7, [existing, added]);
  });

  it("does not alter a single-repository continuation", async () => {
    const existing = binding();
    const native = dependencies();
    await expect(
      reconcileChatRepositoriesForWorkspace({
        chatId: 7,
        repositories: [repository("/workspace/app")],
        bindings: [existing],
        dependencies: native,
      }),
    ).resolves.toEqual([existing]);
    expect(native.expand).not.toHaveBeenCalled();
  });

  it("rolls back only new worktrees when binding persistence fails", async () => {
    const existing = binding();
    const added = binding({
      sourceRepositoryPath: "/workspace/docs",
      relativePath: "docs",
      worktreePath: "/cards/chat-7/docs",
    });
    const native = dependencies();
    native.expand.mockResolvedValue({
      complete: true,
      repositories: [added],
      errors: [],
    });
    native.save.mockRejectedValue(new Error("database unavailable"));

    await expect(
      reconcileChatRepositoriesForWorkspace({
        chatId: 7,
        repositories: [repository("/workspace/app"), repository("/workspace/docs")],
        bindings: [existing],
        dependencies: native,
      }),
    ).rejects.toThrow("database unavailable");
    expect(native.cleanup).toHaveBeenCalledTimes(1);
    expect(native.cleanup).toHaveBeenCalledWith({
      binding: added,
      deleteBranch: true,
      force: true,
    });
  });
});
