export type WorkspaceSurfaceMode = "chat" | "kanban";

export const WORKSPACE_SURFACE_MODE_KEY = "orchestrator.workspace-surface.v1";

export function readWorkspaceSurfaceMode(
  storage: Pick<Storage, "getItem"> = window.localStorage,
): WorkspaceSurfaceMode {
  try {
    return storage.getItem(WORKSPACE_SURFACE_MODE_KEY) === "kanban"
      ? "kanban"
      : "chat";
  } catch {
    return "chat";
  }
}

export function persistWorkspaceSurfaceMode(
  mode: WorkspaceSurfaceMode,
  storage: Pick<Storage, "setItem"> = window.localStorage,
) {
  try {
    storage.setItem(WORKSPACE_SURFACE_MODE_KEY, mode);
  } catch {
    // The selection still applies to this application session.
  }
}
