import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { memo, type CSSProperties, type RefObject } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import type {
  Workspace,
  WorkspaceContextMenuState,
  WorkspaceDirectoryState,
  WorkspaceGitFileStatus,
  WorkspaceTreeEntry,
} from "./types";

export type WorkspaceSidebarModel = {
  workspaces: Workspace[];
  selectedWorkspaceId: number | null;
  taskViewActive: boolean;
  runIsActive: boolean;
  expandedWorkspaceIds: ReadonlySet<number>;
  expandedDirectoryPaths: ReadonlySet<string>;
  directoryStates: Readonly<Record<string, WorkspaceDirectoryState>>;
  gitStatusByWorkspaceId: ReadonlyMap<
    number,
    ReadonlyMap<string, WorkspaceGitFileStatus>
  >;
  dirtyDirectoryPathsByWorkspaceId: ReadonlyMap<number, ReadonlySet<string>>;
  contextMenu: WorkspaceContextMenuState | null;
  contextMenuRef: RefObject<HTMLDivElement | null>;
  headerDragRegion?: string;
};

export type WorkspaceSidebarActions = {
  addWorkspace: () => void;
  toggleWorkspace: (workspace: Workspace) => void;
  selectWorkspace: (workspaceId: number) => void;
  handleWorkspaceKeyDown: (
    workspace: Workspace,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => void;
  openWorkspaceContextMenu: (
    workspace: Workspace,
    event: ReactMouseEvent<HTMLElement>,
  ) => void;
  requestWorkspaceDelete: (workspace: Workspace) => void;
  toggleDirectory: (
    workspace: Workspace,
    directoryPath: string,
    loadFromDisk: boolean,
  ) => void;
  startFileDrag: (
    event: ReactPointerEvent<HTMLElement>,
    workspace: Workspace,
    entry: WorkspaceTreeEntry,
  ) => void;
  updateFileDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  finishFileDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  cancelFileDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  shouldSuppressFileClick: () => boolean;
  openFile: (workspace: Workspace, entry: WorkspaceTreeEntry) => void;
};

const EMPTY_GIT_STATUS = new Map<string, WorkspaceGitFileStatus>();
const EMPTY_DIRTY_PATHS = new Set<string>();

export const WorkspaceSidebar = memo(function WorkspaceSidebar({
  model,
  actions,
}: {
  model: WorkspaceSidebarModel;
  actions: WorkspaceSidebarActions;
}) {
  function gitStatusMap(workspace: Workspace) {
    return model.gitStatusByWorkspaceId.get(workspace.id) ?? EMPTY_GIT_STATUS;
  }

  function dirtyDirectoryPaths(workspace: Workspace) {
    return (
      model.dirtyDirectoryPathsByWorkspaceId.get(workspace.id) ??
      EMPTY_DIRTY_PATHS
    );
  }

  function directoryEntries(
    workspace: Workspace,
    directoryPath: string,
    entries: WorkspaceTreeEntry[],
  ) {
    const statusByPath = gitStatusMap(workspace);
    const visibleEntries = entries.filter(
      (entry) => statusByPath.get(entry.relativePath)?.statusKind !== "deleted",
    );
    const byRelativePath = new Map(
      visibleEntries.map((entry) => [entry.relativePath, entry]),
    );
    const merged = [...visibleEntries];
    const directoryRelativePath = relativeDirectoryPath(workspace, directoryPath);

    statusByPath.forEach((status) => {
      if (status.statusKind === "deleted") return;
      const entry = gitStatusChildEntry(
        workspace,
        directoryRelativePath,
        status,
      );
      if (entry && !byRelativePath.has(entry.relativePath)) {
        byRelativePath.set(entry.relativePath, entry);
        merged.push(entry);
      }
    });

    return merged.sort((left, right) => {
      const leftIsFile = left.kind === "file";
      const rightIsFile = right.kind === "file";
      return (
        Number(leftIsFile) - Number(rightIsFile) ||
        left.name.toLowerCase().localeCompare(right.name.toLowerCase())
      );
    });
  }

  function renderDirectory(
    workspace: Workspace,
    directoryPath: string,
    depth: number,
  ) {
    const state = model.directoryStates[directoryPath];
    const entries = directoryEntries(
      workspace,
      directoryPath,
      state?.entries ?? [],
    );

    if ((!state || state.status === "loading") && entries.length === 0) {
      return (
        <div
          className="workspace-tree-status"
          style={treeIndentStyle(depth)}
          key={`${directoryPath}-loading`}
        >
          <Loader2 size={14} aria-hidden="true" />
          <span>Loading</span>
        </div>
      );
    }

    if (state?.status === "error" && entries.length === 0) {
      return (
        <div
          className="workspace-tree-status error"
          style={treeIndentStyle(depth)}
          key={`${directoryPath}-error`}
        >
          <AlertCircle size={14} aria-hidden="true" />
          <span>{state.error ?? "Unable to load folder"}</span>
        </div>
      );
    }

    if (entries.length === 0) {
      return (
        <div
          className="workspace-tree-status"
          style={treeIndentStyle(depth)}
          key={`${directoryPath}-empty`}
        >
          <span>Empty folder</span>
        </div>
      );
    }

    return entries.map((entry) => renderTreeEntry(workspace, entry, depth));
  }

  function renderTreeEntry(
    workspace: Workspace,
    entry: WorkspaceTreeEntry,
    depth: number,
  ) {
    const directory = entry.kind === "directory";
    const expanded = model.expandedDirectoryPaths.has(entry.path);
    const gitStatus = gitStatusMap(workspace).get(entry.relativePath) ?? null;
    const dirtyDirectory =
      directory && dirtyDirectoryPaths(workspace).has(entry.relativePath);
    const gitStateClass = gitStatus
      ? ` git-${gitStatus.statusKind}`
      : dirtyDirectory
        ? " git-dirty"
        : "";
    const draggable =
      !directory && !entry.gitGhost && gitStatus?.statusKind !== "deleted";

    return (
      <div className="workspace-tree-branch" key={entry.path}>
        <div
          className={`workspace-tree-row ${directory ? "directory" : "file"}${draggable ? " draggable" : ""}${gitStateClass}`}
          style={treeIndentStyle(depth)}
          onPointerDown={
            !draggable
              ? undefined
              : (event) => actions.startFileDrag(event, workspace, entry)
          }
          onPointerMove={!draggable ? undefined : actions.updateFileDrag}
          onPointerUp={!draggable ? undefined : actions.finishFileDrag}
          onPointerCancel={!draggable ? undefined : actions.cancelFileDrag}
        >
          {directory ? (
            <button
              className="workspace-tree-chevron"
              type="button"
              aria-label={`${expanded ? "Collapse" : "Expand"} ${entry.name}`}
              data-tooltip={`${expanded ? "Collapse" : "Expand"} ${entry.name}`}
              aria-expanded={expanded}
              onClick={() =>
                actions.toggleDirectory(workspace, entry.path, !entry.gitGhost)
              }
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="workspace-tree-chevron-placeholder" aria-hidden="true" />
          )}

          <button
            className="workspace-tree-label"
            type="button"
            title={entry.relativePath}
            onClick={(event) => {
              if (!directory && actions.shouldSuppressFileClick()) {
                event.preventDefault();
                event.stopPropagation();
                return;
              }
              if (directory) {
                actions.toggleDirectory(workspace, entry.path, !entry.gitGhost);
              } else {
                actions.openFile(workspace, entry);
              }
            }}
          >
            {directory ? (
              expanded ? (
                <FolderOpen size={15} aria-hidden="true" />
              ) : (
                <Folder size={15} aria-hidden="true" />
              )
            ) : (
              <FileText size={15} aria-hidden="true" />
            )}
            <span className="workspace-entry-name">{entry.name}</span>
            {dirtyDirectory ? (
              <span className="workspace-git-dot" aria-label="Contains changes" />
            ) : null}
            {gitStatus ? (
              <span
                className={`workspace-git-badge ${gitStatus.statusKind}`}
                aria-label={`${gitStatus.statusKind} file`}
              >
                {gitStatus.badge}
              </span>
            ) : null}
          </button>
        </div>
        {directory && expanded
          ? renderDirectory(workspace, entry.path, depth + 1)
          : null}
      </div>
    );
  }

  return (
    <div className="rail-section">
      <div
        className="rail-section-header"
        data-tauri-drag-region={model.headerDragRegion}
      >
        <span id="workspaces-heading">Workspaces</span>
        <button
          className="workspace-add"
          type="button"
          onClick={actions.addWorkspace}
          aria-label="Add workspace"
          data-tooltip="Add workspace"
        >
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>

      <nav
        className="workspace-list"
        aria-labelledby="workspaces-heading"
        data-tauri-drag-region="false"
      >
        {model.workspaces.length === 0 ? (
          <p className="muted">No workspaces yet.</p>
        ) : (
          model.workspaces.map((workspace) => {
            const expanded = model.expandedWorkspaceIds.has(workspace.id);
            const selected = workspace.id === model.selectedWorkspaceId;
            const active = selected && model.taskViewActive;
            const workspaceDirty = dirtyDirectoryPaths(workspace).has("");

            return (
              <div className="workspace-tree-branch" key={workspace.id}>
                <div
                  className={`workspace-root-row ${active ? "active" : ""}${
                    workspaceDirty ? " git-dirty" : ""
                  }`}
                  onContextMenu={(event) =>
                    actions.openWorkspaceContextMenu(workspace, event)
                  }
                >
                  <button
                    className="workspace-tree-chevron"
                    type="button"
                    aria-label={`${expanded ? "Collapse" : "Expand"} ${workspace.label}`}
                    data-tooltip={`${expanded ? "Collapse" : "Expand"} ${workspace.label}`}
                    aria-expanded={expanded}
                    onClick={() => actions.toggleWorkspace(workspace)}
                  >
                    {expanded ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                  </button>
                  <button
                    className="workspace-root-label"
                    type="button"
                    onClick={() => {
                      if (active) actions.toggleWorkspace(workspace);
                      else actions.selectWorkspace(workspace.id);
                    }}
                    onKeyDown={(event) =>
                      actions.handleWorkspaceKeyDown(workspace, event)
                    }
                    onContextMenu={(event) =>
                      actions.openWorkspaceContextMenu(workspace, event)
                    }
                    aria-current={active ? "page" : undefined}
                    title={workspace.label}
                  >
                    <span className="workspace-icon" aria-hidden="true">
                      {expanded ? <FolderOpen size={16} /> : <Folder size={16} />}
                    </span>
                    <span className="workspace-name">{workspace.label}</span>
                    {workspaceDirty ? (
                      <span className="workspace-git-dot" aria-label="Contains changes" />
                    ) : null}
                  </button>
                </div>
                {expanded ? renderDirectory(workspace, workspace.path, 1) : null}
              </div>
            );
          })
        )}
      </nav>

      {model.contextMenu ? (
        <div
          className="workspace-context-menu"
          data-tauri-drag-region="false"
          ref={model.contextMenuRef}
          role="menu"
          aria-label={`${model.contextMenu.workspace.label} workspace actions`}
          style={{ left: model.contextMenu.x, top: model.contextMenu.y }}
        >
          <button
            className="workspace-context-menu-item danger"
            type="button"
            role="menuitem"
            onClick={() =>
              actions.requestWorkspaceDelete(model.contextMenu!.workspace)
            }
            disabled={
              model.runIsActive &&
              model.contextMenu.workspace.id === model.selectedWorkspaceId
            }
          >
            <Trash2 size={15} aria-hidden="true" />
            <span>Remove from Orchestrator</span>
          </button>
        </div>
      ) : null}
    </div>
  );
});

function treeIndentStyle(depth: number) {
  return { "--depth": depth } as CSSProperties;
}

function normalizeWorkspacePath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function relativeDirectoryPath(workspace: Workspace, directoryPath: string) {
  const workspacePath = normalizeWorkspacePath(workspace.path);
  const normalizedDirectory = normalizeWorkspacePath(directoryPath);
  if (normalizedDirectory === workspacePath) return "";
  const prefix = `${workspacePath}/`;
  return normalizedDirectory.startsWith(prefix)
    ? normalizedDirectory.slice(prefix.length)
    : "";
}

function joinWorkspacePath(workspacePath: string, relativePath: string) {
  return `${normalizeWorkspacePath(workspacePath)}/${relativePath.replace(/^\/+/, "")}`;
}

function gitStatusChildEntry(
  workspace: Workspace,
  directoryRelativePath: string,
  gitStatus: WorkspaceGitFileStatus,
): WorkspaceTreeEntry | null {
  const changedRelativePath = gitStatus.relativePath;
  const directoryPrefix = directoryRelativePath
    ? `${directoryRelativePath.replace(/\/+$/, "")}/`
    : "";
  if (!changedRelativePath.startsWith(directoryPrefix)) return null;

  const remainder = changedRelativePath.slice(directoryPrefix.length);
  const [name] = remainder.split("/");
  if (!name) return null;

  const relativePath = directoryPrefix ? `${directoryPrefix}${name}` : name;
  const finalPath = relativePath === changedRelativePath;
  return {
    name,
    path: finalPath
      ? gitStatus.path
      : joinWorkspacePath(workspace.path, relativePath),
    relativePath,
    kind: finalPath ? "file" : "directory",
    gitGhost: gitStatus.statusKind === "deleted",
  };
}
