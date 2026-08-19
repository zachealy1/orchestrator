import type {
  KanbanBoardSnapshotRecord,
  KanbanGitBinding,
} from "./api";

export type KanbanWorkspaceCacheEntry = {
  snapshot: KanbanBoardSnapshotRecord;
  bindingsByCard: Record<string, KanbanGitBinding[] | undefined>;
  includesArchived: boolean;
  scrollTop: number;
};

type ReconciledBindingCacheEntry = {
  fingerprint: string;
  binding: KanbanGitBinding;
  checkedAt: number;
};

const MAX_WORKSPACE_ENTRIES = 4;
const MAX_RECONCILED_BINDINGS = 256;
export const BINDING_RECONCILE_TTL_MS = 10_000;

const workspaceCache = new Map<number, KanbanWorkspaceCacheEntry>();
const reconciledBindingCache = new Map<string, ReconciledBindingCacheEntry>();

function touchEntry<Key, Value>(cache: Map<Key, Value>, key: Key, value: Value) {
  cache.delete(key);
  cache.set(key, value);
}

function trimOldest<Key, Value>(cache: Map<Key, Value>, limit: number) {
  while (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) return;
    cache.delete(oldest);
  }
}

export function readKanbanWorkspaceCache(workspaceId: number) {
  const entry = workspaceCache.get(workspaceId) ?? null;
  if (entry) touchEntry(workspaceCache, workspaceId, entry);
  return entry;
}

export function writeKanbanWorkspaceCache(
  workspaceId: number,
  entry: KanbanWorkspaceCacheEntry,
) {
  touchEntry(workspaceCache, workspaceId, entry);
  trimOldest(workspaceCache, MAX_WORKSPACE_ENTRIES);
}

export function writeKanbanWorkspaceScroll(
  workspaceId: number,
  scrollTop: number,
) {
  const entry = workspaceCache.get(workspaceId);
  if (!entry) return;
  writeKanbanWorkspaceCache(workspaceId, { ...entry, scrollTop });
}

function bindingCacheKey(binding: KanbanGitBinding) {
  return `${binding.sourceRepositoryPath}\u0000${binding.worktreePath}`;
}

export function readReconciledKanbanBinding(
  binding: KanbanGitBinding,
  now = Date.now(),
) {
  const key = bindingCacheKey(binding);
  const cached = reconciledBindingCache.get(key);
  if (
    !cached ||
    cached.fingerprint !== JSON.stringify(binding) ||
    now - cached.checkedAt >= BINDING_RECONCILE_TTL_MS
  ) {
    return null;
  }
  touchEntry(reconciledBindingCache, key, cached);
  return cached.binding;
}

export function writeReconciledKanbanBinding(
  original: KanbanGitBinding,
  reconciled: KanbanGitBinding,
  checkedAt = Date.now(),
) {
  const key = bindingCacheKey(original);
  touchEntry(reconciledBindingCache, key, {
    fingerprint: JSON.stringify(original),
    binding: reconciled,
    checkedAt,
  });
  trimOldest(reconciledBindingCache, MAX_RECONCILED_BINDINGS);
}

export function clearKanbanWorkspaceCaches() {
  workspaceCache.clear();
  reconciledBindingCache.clear();
}
