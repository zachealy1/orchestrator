import type { ChatRecord } from "../conversations/types";
import {
  loadKanbanBoard,
  loadKanbanGitBindings,
  type KanbanCardRecord,
  type KanbanRepositorySelectionRecord,
} from "./api";

export async function prepareCardBranchTitle(
  card: KanbanCardRecord,
  repositories: KanbanRepositorySelectionRecord[],
  signal: AbortSignal,
  ensureTitle: (
    chatId: number,
    prompt: string,
    signal: AbortSignal,
  ) => Promise<ChatRecord>,
  dependencies = {
    loadBindings: loadKanbanGitBindings,
    loadBoard: loadKanbanBoard,
  },
) {
  const bindings = await dependencies.loadBindings(card.id);
  const needsBranch =
    bindings.length === 0 ||
    repositories.some(
      (repository) =>
        !bindings.some(
          (binding) =>
            binding.sourceRepositoryPath === repository.repositoryPath,
        ),
    );
  if (!needsBranch) return card;
  await ensureTitle(card.chatId, card.description, signal);
  if (signal.aborted) throw new Error("Launch cancelled.");
  const board = await dependencies.loadBoard(card.workspaceId);
  const latest = board.cards.find((candidate) => candidate.id === card.id);
  if (!latest || latest.deletedAt || latest.archivedAt) {
    throw new Error("The card is no longer available.");
  }
  if (latest.stateVersion !== card.stateVersion) {
    throw new Error(
      "The card changed while waiting for its title. Start it again with its current settings.",
    );
  }
  return latest;
}
