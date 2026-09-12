import {
  loadKanbanBoard,
  saveKanbanPreferences,
  type KanbanBoardSnapshotRecord,
} from "./api";

export type KanbanTargetBranch = { repositoryPath: string; branch: string };

export function parseKanbanTargetBranch(value: unknown): KanbanTargetBranch | undefined {
  if (!value || typeof value !== "object") return undefined;
  const target = value as Partial<KanbanTargetBranch>;
  return typeof target.repositoryPath === "string" && target.repositoryPath.length > 0
    && typeof target.branch === "string" && target.branch.length > 0
    ? { repositoryPath: target.repositoryPath, branch: target.branch }
    : undefined;
}

export function readKanbanTargetBranch(preferencesJson: string): KanbanTargetBranch | undefined {
  try {
    return parseKanbanTargetBranch(JSON.parse(preferencesJson)?.targetBranch);
  } catch {
    return undefined;
  }
}

const saves = new Map<number, Promise<KanbanBoardSnapshotRecord>>();
const targetSaves = new Map<number, number>();

export function assertKanbanTargetReady(workspaceId: number) {
  if (targetSaves.has(workspaceId)) {
    throw new Error("The Kanban target branch is being saved. Try starting the card again when it finishes.");
  }
}

// Serialize board preference writes, including unmount flushes. Ordinary filter
// writes must never restore an old target after another selection has committed.
export function persistKanbanBoardPreferences(
  input: Parameters<typeof saveKanbanPreferences>[0],
  targetBranch?: KanbanTargetBranch,
  initializeTarget = false,
): Promise<KanbanBoardSnapshotRecord> {
  const { workspaceId } = input;
  if (targetBranch) targetSaves.set(workspaceId, (targetSaves.get(workspaceId) ?? 0) + 1);
  const previous = saves.get(workspaceId);
  const operation = (async () => {
    await previous?.catch(() => undefined);
    for (let attempt = 0; ; attempt += 1) {
      const latest = await loadKanbanBoard(workspaceId, { includeArchived: true });
      const { targetBranch: _oldTarget, ...preferences } = input.preferences as Record<string, unknown>;
      const existingTarget = readKanbanTargetBranch(latest.preferencesJson);
      const target = targetBranch && (!initializeTarget || existingTarget?.repositoryPath !== targetBranch.repositoryPath)
        ? targetBranch
        : existingTarget;
      try {
        return await saveKanbanPreferences({
          ...input,
          expectedRevision: latest.revision,
          preferences: { ...preferences, ...(target ? { targetBranch: target } : {}) },
        });
      } catch (error) {
        if (attempt > 0) throw error;
      }
    }
  })();
  saves.set(workspaceId, operation);
  const settled = () => {
    if (saves.get(workspaceId) === operation) saves.delete(workspaceId);
    if (targetBranch) {
      const remaining = (targetSaves.get(workspaceId) ?? 1) - 1;
      if (remaining) targetSaves.set(workspaceId, remaining);
      else targetSaves.delete(workspaceId);
    }
  };
  // Register cleanup before callers can launch following a successful save.
  void operation.then(settled, settled);
  return operation;
}
