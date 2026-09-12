import type { KanbanGitBinding } from "../kanban/api";
import type { WorkspaceGitRepositoryStatus } from "../workspaces/types";

type ExpansionResult = {
  complete: boolean;
  repositories: KanbanGitBinding[];
  errors: Array<{ message: string }>;
};

export type ChatRepositoryExecutionDependencies = {
  ensureTitle: () => Promise<string>;
  expand: (input: {
    cardId: string;
    cardSlug: string;
    existingBindings: KanbanGitBinding[];
    repositories: Array<{
      repositoryPath: string;
      relativePath: string;
      includeDirtyChanges: false;
    }>;
  }) => Promise<ExpansionResult>;
  save: (chatId: number, bindings: KanbanGitBinding[]) => Promise<unknown>;
  cleanup: (input: {
    binding: KanbanGitBinding;
    deleteBranch: true;
    force: true;
  }) => Promise<{ status: string; worktreeRemoved: boolean }>;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function reconcileChatRepositoriesForWorkspace(input: {
  chatId: number;
  repositories: WorkspaceGitRepositoryStatus[];
  bindings: KanbanGitBinding[];
  dependencies: ChatRepositoryExecutionDependencies;
}) {
  if (input.repositories.length <= 1 || input.bindings.length === 0) {
    return input.bindings;
  }
  const boundPaths = new Set(
    input.bindings.map((binding) => binding.sourceRepositoryPath),
  );
  const missing = input.repositories.filter(
    (repository) => !boundPaths.has(repository.repository.rootPath),
  );
  if (missing.length === 0) return input.bindings;

  const title = await input.dependencies.ensureTitle();
  const expanded = await input.dependencies.expand({
    cardId: `chat-${input.chatId}`,
    cardSlug: title,
    existingBindings: input.bindings,
    repositories: missing.map((repository) => ({
      repositoryPath: repository.repository.rootPath,
      relativePath: repository.repository.relativePath,
      includeDirtyChanges: false,
    })),
  });
  if (!expanded.complete) {
    throw new Error(
      expanded.errors.map((error) => error.message).filter(Boolean).join(" ") ||
        "The chat worktrees could not be expanded safely.",
    );
  }

  const bindings = [...input.bindings, ...expanded.repositories];
  try {
    await input.dependencies.save(input.chatId, bindings);
  } catch (error) {
    const cleanup = await Promise.allSettled(
      expanded.repositories.map((binding) =>
        input.dependencies.cleanup({
          binding,
          deleteBranch: true,
          force: true,
        }),
      ),
    );
    const cleanupFailed = cleanup.some(
      (result) =>
        result.status === "rejected" ||
        result.value.status !== "cleaned" ||
        !result.value.worktreeRemoved,
    );
    throw new Error(
      cleanupFailed
        ? `The expanded chat worktrees could not be saved, and some new worktrees require cleanup: ${errorMessage(error)}`
        : `The expanded chat worktrees could not be saved: ${errorMessage(error)}`,
    );
  }
  return bindings;
}
