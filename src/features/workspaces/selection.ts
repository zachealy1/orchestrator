import type { Workspace } from "./types";

const SELECTED_WORKSPACE_KEY = "orchestrator.selected-workspace.v1";

export function restoreSelectedWorkspace(workspaces: Workspace[]) {
  try {
    const id = Number(localStorage.getItem(SELECTED_WORKSPACE_KEY));
    return workspaces.find((workspace) => workspace.id === id) ?? workspaces[0] ?? null;
  } catch {
    return workspaces[0] ?? null;
  }
}

export function persistSelectedWorkspace(id: number) {
  try {
    localStorage.setItem(SELECTED_WORKSPACE_KEY, String(id));
  } catch {
    // Navigation remains available when browser storage is unavailable.
  }
}
