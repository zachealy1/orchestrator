import {
  cleanupKanbanGit,
  loadKanbanBoard,
  loadKanbanGitBindings,
  provisionKanbanGit,
  reconcileKanbanGit,
  saveKanbanGitBindings,
  type KanbanCardRecord,
  type KanbanGitBinding,
} from "./api";

const SAFE_RECONCILED_BINDING_STATUSES = new Set([
  "ready",
  "conflicted",
  "targetMoved",
]);

export type KanbanRepositoryExecutionResult = {
  executionRoot: string;
  bindings: KanbanGitBinding[];
};

export type KanbanRepositoryExecutionDependencies = {
  loadBindings: typeof loadKanbanGitBindings;
  reconcileBinding: typeof reconcileKanbanGit;
  saveBindings: typeof saveKanbanGitBindings;
  provision: typeof provisionKanbanGit;
  loadBoard: typeof loadKanbanBoard;
  cleanupBinding: typeof cleanupKanbanGit;
};

const nativeDependencies: KanbanRepositoryExecutionDependencies = {
  loadBindings: loadKanbanGitBindings,
  reconcileBinding: reconcileKanbanGit,
  saveBindings: saveKanbanGitBindings,
  provision: provisionKanbanGit,
  loadBoard: loadKanbanBoard,
  cleanupBinding: cleanupKanbanGit,
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function bindingChanged(
  current: KanbanGitBinding,
  reconciled: KanbanGitBinding,
) {
  return JSON.stringify(current) !== JSON.stringify(reconciled);
}

async function persistNewBindings(
  card: KanbanCardRecord,
  claimedCard: KanbanCardRecord,
  bindings: KanbanGitBinding[],
  dependencies: KanbanRepositoryExecutionDependencies,
) {
  try {
    await dependencies.saveBindings(claimedCard, bindings);
    return;
  } catch (initialSaveError) {
    let retryError: unknown = initialSaveError;
    try {
      const latestBoard = await dependencies.loadBoard(card.workspaceId, {
        includeArchived: true,
      });
      const latestCard = latestBoard.cards.find(
        (candidate) => candidate.id === card.id,
      );
      if (!latestCard) {
        throw new Error(
          "The card disappeared while its worktrees were being saved.",
        );
      }
      await dependencies.saveBindings(latestCard, bindings);
      retryError = null;
    } catch (error) {
      retryError = error;
    }

    if (!retryError) return;

    const cleanup = await Promise.allSettled(
      bindings.map((binding) =>
        dependencies.cleanupBinding({
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
    const persistenceMessage = errorMessage(retryError);
    throw new Error(
      cleanupFailed
        ? `The card worktrees could not be saved, and some newly created artifacts require cleanup: ${persistenceMessage}`
        : `The card worktrees could not be saved: ${persistenceMessage}`,
    );
  }
}

export function createKanbanRepositoryExecutionPreparer(
  dependencies: KanbanRepositoryExecutionDependencies,
) {
  return async function prepareKanbanRepositoryExecution(input: {
    card: KanbanCardRecord;
    claimedCard: KanbanCardRecord;
    onExecutionRoot?: (executionRoot: string | null) => void;
  }): Promise<KanbanRepositoryExecutionResult> {
    const { card, claimedCard, onExecutionRoot } = input;
    let bindings = await dependencies.loadBindings(card.id);

    if (bindings.length > 0) {
      const reconciled = await Promise.all(
        bindings.map((binding) => dependencies.reconcileBinding(binding)),
      );
      const reconciledBindings = reconciled.map((result) => result.binding);
      if (
        reconciledBindings.some((binding, index) =>
          bindingChanged(bindings[index], binding),
        )
      ) {
        await dependencies.saveBindings(claimedCard, reconciledBindings);
      }
      bindings = reconciledBindings;
    }

    const unsafeBindings = bindings.filter(
      (binding) => !SAFE_RECONCILED_BINDING_STATUSES.has(binding.status),
    );
    if (unsafeBindings.length > 0) {
      const details = unsafeBindings
        .map((binding) => binding.error?.message)
        .filter(Boolean)
        .join(" ");
      throw new Error(
        details ||
          "This card has repository cleanup or reconciliation work pending. Repair the preserved worktree or clean up its artifacts before retrying.",
      );
    }

    let executionRoot = bindings[0]?.executionRoot ?? null;
    onExecutionRoot?.(executionRoot);
    if (bindings.length === 0) {
      const provisioned = await dependencies.provision({
        cardId: card.id,
        cardSlug: card.title,
        repositories: card.repositories.map((repository) => ({
          repositoryPath: repository.repositoryPath,
          relativePath: repository.relativePath,
          includeDirtyChanges: repository.includeDirtyChanges,
        })),
      });
      bindings = provisioned.repositories;
      executionRoot = provisioned.executionRoot;
      onExecutionRoot?.(executionRoot);

      if (bindings.length > 0) {
        await persistNewBindings(card, claimedCard, bindings, dependencies);
      }
      if (!provisioned.complete) {
        const details = provisioned.errors
          .map((error) => error.message)
          .filter(Boolean)
          .join(" ");
        throw new Error(
          details || "The card worktrees could not be provisioned safely.",
        );
      }
    }

    if (!executionRoot) {
      throw new Error("The card's isolated execution root is unavailable.");
    }
    return { executionRoot, bindings };
  };
}

export const prepareKanbanRepositoryExecution =
  createKanbanRepositoryExecutionPreparer(nativeDependencies);
