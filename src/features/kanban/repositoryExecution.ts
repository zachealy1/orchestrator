import {
  cleanupKanbanGit,
  expandKanbanGit,
  loadKanbanBoard,
  loadKanbanGitBindings,
  provisionKanbanGit,
  reconcileKanbanGit,
  saveKanbanGitBindings,
  type KanbanCardRecord,
  type KanbanGitBinding,
  type KanbanRepositoryConfiguration,
  type KanbanRepositorySelectionRecord,
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
  expand: typeof expandKanbanGit;
  loadBoard: typeof loadKanbanBoard;
  cleanupBinding: typeof cleanupKanbanGit;
};

const nativeDependencies: KanbanRepositoryExecutionDependencies = {
  loadBindings: loadKanbanGitBindings,
  reconcileBinding: reconcileKanbanGit,
  saveBindings: saveKanbanGitBindings,
  provision: provisionKanbanGit,
  expand: expandKanbanGit,
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
  newlyCreatedBindings: KanbanGitBinding[],
  repositoryConfiguration: KanbanRepositoryConfiguration | null,
  dependencies: KanbanRepositoryExecutionDependencies,
) {
  const save = (
    targetCard: Pick<KanbanCardRecord, "id" | "stateVersion">,
  ) =>
    repositoryConfiguration
      ? dependencies.saveBindings(
          targetCard,
          bindings,
          undefined,
          repositoryConfiguration,
        )
      : dependencies.saveBindings(targetCard, bindings);
  try {
    await save(claimedCard);
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
      await save(latestCard);
      retryError = null;
    } catch (error) {
      retryError = error;
    }

    if (!retryError) return;

    const cleanup = await Promise.allSettled(
      newlyCreatedBindings.map((binding) =>
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
    repositories?: KanbanRepositorySelectionRecord[];
    repositoryConfiguration?: KanbanRepositoryConfiguration | null;
    onExecutionRoot?: (executionRoot: string | null) => void;
  }): Promise<KanbanRepositoryExecutionResult> {
    const {
      card,
      claimedCard,
      onExecutionRoot,
      repositories = card.repositories,
      repositoryConfiguration = null,
    } = input;
    let bindings = await dependencies.loadBindings(card.id);
    let bindingsChanged = false;

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
        bindingsChanged = true;
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
    let newlyCreatedBindings: KanbanGitBinding[] = [];
    if (bindings.length === 0) {
      const provisioned = await dependencies.provision({
        cardId: card.id,
        cardSlug: card.title,
        repositories: repositories.map((repository) => ({
          repositoryPath: repository.repositoryPath,
          relativePath: repository.relativePath,
          includeDirtyChanges: repository.includeDirtyChanges,
        })),
      });
      bindings = provisioned.repositories;
      newlyCreatedBindings = provisioned.repositories;
      executionRoot = provisioned.executionRoot;
      onExecutionRoot?.(executionRoot);

      if (!provisioned.complete) {
        const details = provisioned.errors
          .map((error) => error.message)
          .filter(Boolean)
          .join(" ");
        throw new Error(
          details || "The card worktrees could not be provisioned safely.",
        );
      }
      bindingsChanged = bindings.length > 0;
    } else {
      const boundRepositoryPaths = new Set(
        bindings.map((binding) => binding.sourceRepositoryPath),
      );
      const missingRepositories = repositories.filter(
        (repository) => !boundRepositoryPaths.has(repository.repositoryPath),
      );
      if (missingRepositories.length > 0) {
        const expanded = await dependencies.expand({
          cardId: card.id,
          cardSlug: card.title,
          existingBindings: bindings,
          repositories: missingRepositories.map((repository) => ({
            repositoryPath: repository.repositoryPath,
            relativePath: repository.relativePath,
            includeDirtyChanges: repository.includeDirtyChanges,
          })),
        });
        if (!expanded.complete) {
          const details = expanded.errors
            .map((error) => error.message)
            .filter(Boolean)
            .join(" ");
          throw new Error(
            details || "The card worktrees could not be expanded safely.",
          );
        }
        newlyCreatedBindings = expanded.repositories;
        bindings = [...bindings, ...expanded.repositories];
        bindingsChanged = expanded.repositories.length > 0;
      }
    }

    if (bindingsChanged || repositoryConfiguration) {
      await persistNewBindings(
        card,
        claimedCard,
        bindings,
        newlyCreatedBindings,
        repositoryConfiguration,
        dependencies,
      );
    }

    if (!executionRoot) {
      throw new Error("The card's isolated execution root is unavailable.");
    }
    return { executionRoot, bindings };
  };
}

export const prepareKanbanRepositoryExecution =
  createKanbanRepositoryExecutionPreparer(nativeDependencies);
