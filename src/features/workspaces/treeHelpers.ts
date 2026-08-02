import type { WorkspaceTreeEntry } from "./types";

export function workspaceTreeEntriesEqual(
  left: WorkspaceTreeEntry[] | undefined,
  right: WorkspaceTreeEntry[],
) {
  if (!left || left.length !== right.length) return false;
  return left.every((entry, index) => {
    const candidate = right[index];
    return (
      candidate !== undefined &&
      entry.name === candidate.name &&
      entry.path === candidate.path &&
      entry.relativePath === candidate.relativePath &&
      entry.kind === candidate.kind
    );
  });
}
