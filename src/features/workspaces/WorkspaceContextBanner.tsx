import {
  Columns3,
  Folder,
  FolderOpen,
  GitBranch,
  GitBranchPlus,
  GitCommitHorizontal,
  Loader2,
  MessageSquare,
  PanelRight,
  SquarePen,
} from "lucide-react";
import { useRef } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  RefCallback,
} from "react";
import { ComposerSelect } from "../../components/ComposerSelect";
import { getContextUsageDisplay } from "../../lib/contextUsage";
import type { RunViewState } from "../../lib/codexEventReducer";
import { windowDragRegionValue } from "../../lib/windowDragging";
import {
  applicationCommandAriaShortcut,
  formatApplicationCommandShortcut,
} from "../shortcuts/applicationShortcuts";
import {
  formatGitSummaryForStatus,
  workspaceGitRepositoryDisplayPath,
  type HeaderGitAction,
  type WorkspaceGitStatusState,
  type WorkspaceGitSummary,
} from "./gitModel";
import type { Workspace, WorkspaceGitRepositoryStatus } from "./types";

const DEFAULT_CONTEXT_WINDOW = 258_400;

export function WorkspaceContextBanner({
  workspace,
  surfaceMode,
  onSurfaceModeChange,
  kanbanToolbarHostRef,
  repositories,
  repositoryPath,
  branch,
  branches,
  gitState,
  gitSummary,
  gitAction,
  gitActionStatus,
  commitDialogOpen,
  contextUsage,
  contextWindow,
  onGitAction,
  onRepositoryChange,
  onBranchChange,
  branchCreationBusy,
  onCreateBranch,
  newChatDisabled,
  onNewChat,
  historyOpen,
  historyNotificationCount,
  onToggleHistory,
  windowDragRegionsEnabled,
}: {
  workspace: Workspace | null;
  surfaceMode: "chat" | "kanban";
  onSurfaceModeChange: (mode: "chat" | "kanban") => void;
  kanbanToolbarHostRef?: RefCallback<HTMLDivElement>;
  repositories: WorkspaceGitRepositoryStatus[];
  repositoryPath: string | null;
  branch: string | null;
  branches: string[];
  gitState: WorkspaceGitStatusState | null;
  gitSummary: WorkspaceGitSummary;
  gitAction: HeaderGitAction;
  gitActionStatus: "idle" | "generating" | "committing" | "pushing";
  commitDialogOpen: boolean;
  contextUsage: RunViewState["tokenUsage"];
  contextWindow: number;
  onGitAction: () => void;
  onRepositoryChange: (repositoryPath: string) => void;
  onBranchChange: (branch: string) => void;
  branchCreationBusy: boolean;
  onCreateBranch?: () => void;
  newChatDisabled: boolean;
  onNewChat: () => void;
  historyOpen: boolean;
  historyNotificationCount: number;
  onToggleHistory: () => void;
  windowDragRegionsEnabled: boolean;
}) {
  const chatSurfaceButtonRef = useRef<HTMLButtonElement>(null);
  const kanbanSurfaceButtonRef = useRef<HTMLButtonElement>(null);
  const deepWindowDragRegion = windowDragRegionValue(
    windowDragRegionsEnabled,
    "deep",
  );
  if (!workspace) {
    return (
      <section
        className="workspace-context-banner empty"
        aria-label="Selected folder"
        data-tauri-drag-region={deepWindowDragRegion}
      >
        <div className="workspace-context-left">
          <div className="workspace-context-main">
            <span className="workspace-context-icon" aria-hidden="true">
              <Folder size={17} />
            </span>
            <div data-tauri-drag-region="false">
              <strong>No folder selected</strong>
              <span>Add or choose a workspace to start a task.</span>
            </div>
          </div>
          <WorkspaceContextMeter tokenUsage={null} contextWindow={contextWindow} />
        </div>
        <div className="workspace-header-control-rail">
          <div className="workspace-context-actions" data-tauri-drag-region="false">
            <button className="workspace-header-button" type="button" disabled>
              <GitCommitHorizontal size={15} />
              Git
            </button>
            <button
              className="workspace-header-button icon-only"
              type="button"
              disabled
              aria-label="New chat"
              aria-keyshortcuts={applicationCommandAriaShortcut("new-chat")}
              data-tooltip={`Start a new chat (${formatApplicationCommandShortcut("new-chat")})`}
            >
              <SquarePen size={15} />
            </button>
            <button
              className="workspace-header-button icon-only history-panel-button"
              type="button"
              disabled
              aria-label="Open chat history"
              data-tooltip="History"
            >
              <PanelRight size={15} />
            </button>
          </div>
        </div>
      </section>
    );
  }

  const gitLoading =
    !gitState || gitState.status === "loading" || gitState.status === "idle";
  const gitError = gitState?.status === "error";
  const gitClean = !gitLoading && !gitError && gitSummary.total === 0;
  const gitOperationRunning =
    gitActionStatus === "committing" || gitActionStatus === "pushing";
  const branchSelectorDisabled =
    repositoryPath === null ||
    gitLoading ||
    gitError ||
    gitActionStatus !== "idle" ||
    branchCreationBusy;
  const gitBusyLabel =
    gitActionStatus === "generating"
      ? "Generating commit message"
      : gitActionStatus === "committing"
        ? "Committing changes"
        : gitActionStatus === "pushing"
          ? "Pushing branch"
          : null;

  function handleSurfaceModeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    let nextMode: "chat" | "kanban" | null = null;
    if (
      event.key === "ArrowLeft" ||
      event.key === "ArrowUp" ||
      event.key === "Home"
    ) {
      nextMode = "chat";
    } else if (
      event.key === "ArrowRight" ||
      event.key === "ArrowDown" ||
      event.key === "End"
    ) {
      nextMode = "kanban";
    }
    if (!nextMode) return;
    event.preventDefault();
    if (nextMode !== surfaceMode) onSurfaceModeChange(nextMode);
    const targetRef =
      nextMode === "chat" ? chatSurfaceButtonRef : kanbanSurfaceButtonRef;
    window.requestAnimationFrame(() => targetRef.current?.focus());
  }

  return (
    <section
      className={`workspace-context-banner mode-${surfaceMode}`}
      aria-label="Selected folder"
      data-tauri-drag-region={deepWindowDragRegion}
    >
      <div className="workspace-header-leading">
        <div
          className="workspace-context-main workspace-context-main-compact"
          title={workspace.path}
        >
          <span className="workspace-context-icon" aria-hidden="true">
            <Folder size={17} />
          </span>
          <div data-tauri-drag-region="false">
            <strong>{workspace.label}</strong>
          </div>
        </div>
        <div
          className={`segmented-mode-toggle workspace-surface-toggle mode-${surfaceMode}`}
          role="radiogroup"
          aria-label="Workspace mode"
          onKeyDown={handleSurfaceModeKeyDown}
        >
          <button
            ref={chatSurfaceButtonRef}
            type="button"
            role="radio"
            aria-checked={surfaceMode === "chat"}
            aria-label="Chat"
            aria-keyshortcuts={applicationCommandAriaShortcut("open-chat")}
            data-tooltip={`Chat (${formatApplicationCommandShortcut("open-chat")})`}
            className={surfaceMode === "chat" ? "active" : ""}
            tabIndex={surfaceMode === "chat" ? 0 : -1}
            onClick={() => onSurfaceModeChange("chat")}
          >
            <MessageSquare size={16} aria-hidden="true" />
          </button>
          <button
            ref={kanbanSurfaceButtonRef}
            type="button"
            role="radio"
            aria-checked={surfaceMode === "kanban"}
            aria-label="Kanban"
            aria-keyshortcuts={applicationCommandAriaShortcut("open-kanban")}
            data-tooltip={`Kanban (${formatApplicationCommandShortcut("open-kanban")})`}
            className={surfaceMode === "kanban" ? "active" : ""}
            tabIndex={surfaceMode === "kanban" ? 0 : -1}
            onClick={() => onSurfaceModeChange("kanban")}
          >
            <Columns3 size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="workspace-header-control-rail">
        <div className="workspace-mode-controls">
        {surfaceMode === "kanban" ? (
          <div
            className="workspace-kanban-header-controls"
            ref={kanbanToolbarHostRef}
          />
        ) : null}
        {surfaceMode === "chat" ? (
          <div
            className="workspace-context-chips"
            aria-label="Selected folder status"
            data-tauri-drag-region="false"
          >
            {gitOperationRunning ? (
              <span
                className="workspace-context-chip git-operation-running"
                role="status"
                aria-label={gitBusyLabel ?? "Git operation in progress"}
              >
                <Loader2 className="spin" size={14} aria-hidden="true" />
                <span className="sr-only">
                  {gitActionStatus === "committing" ? "Committing" : "Pushing"}
                </span>
              </span>
            ) : null}
            {!gitOperationRunning && gitLoading ? (
              <span className="workspace-context-chip">Checking git</span>
            ) : null}
            {!gitOperationRunning && gitError ? (
              <span className="workspace-context-chip warning">Git unavailable</span>
            ) : null}
            {!gitOperationRunning && gitClean ? (
              <span className="workspace-context-chip clean">Clean</span>
            ) : null}
            {!gitOperationRunning &&
            !gitLoading &&
            !gitError &&
            gitSummary.total > 0 ? (
              <WorkspaceContextGitSummaryChip gitSummary={gitSummary} />
            ) : null}
            <WorkspaceContextMeter
              tokenUsage={contextUsage}
              contextWindow={contextWindow}
            />
          </div>
        ) : null}

        <div className="workspace-context-actions" data-tauri-drag-region="false">
        {surfaceMode === "chat" ? (
          <>
            {repositories.length > 1 ? (
              <ComposerSelect
                ariaLabel="Git repository"
                value={repositoryPath ?? ""}
                options={repositories.map((repository) => ({
                  value: repository.repository.rootPath,
                  label: `${workspaceGitRepositoryDisplayPath(repository.repository)} · ${
                    repository.currentBranch ?? "No branch"
                  }`,
                }))}
                placeholder="Repository"
                icon={<FolderOpen size={14} />}
                className="workspace-branch-select workspace-repository-select"
                disabled={branchSelectorDisabled}
                onChange={onRepositoryChange}
              />
            ) : null}
            <ComposerSelect
              ariaLabel="Branch"
              value={branch ?? ""}
              options={[
                ...branches.map((candidate) => ({
                  value: candidate,
                  label: candidate,
                })),
                ...(onCreateBranch
                  ? [
                      {
                        id: "create-branch",
                        value: "",
                        label: "Create branch...",
                        action: true,
                        icon: <GitBranchPlus size={14} />,
                      },
                    ]
                  : []),
              ]}
              placeholder="No branch"
              icon={<GitBranch size={14} />}
              className="workspace-branch-select"
              disabled={branchSelectorDisabled}
              onChange={onBranchChange}
              onAction={(actionId) => {
                if (actionId === "create-branch") onCreateBranch?.();
              }}
            />
            <div className="workspace-git-action">
              <button
                className="workspace-header-button icon-only primary"
                type="button"
                onClick={onGitAction}
                disabled={gitAction.disabled || gitActionStatus !== "idle"}
                data-tooltip={
                  gitBusyLabel ??
                  (gitAction.disabled ? gitAction.reason : gitAction.label)
                }
                aria-label={gitAction.label}
                aria-expanded={commitDialogOpen}
                aria-busy={gitActionStatus !== "idle"}
              >
                {gitActionStatus === "generating" ? (
                  <Loader2 className="spin" size={15} aria-hidden="true" />
                ) : (
                  <GitCommitHorizontal size={15} aria-hidden="true" />
                )}
              </button>
            </div>
            <button
              className="workspace-header-button icon-only"
              type="button"
              onClick={onNewChat}
              disabled={newChatDisabled}
              aria-label="New chat"
              aria-keyshortcuts={applicationCommandAriaShortcut("new-chat")}
              data-tooltip={`Start a new chat (${formatApplicationCommandShortcut("new-chat")})`}
            >
              <SquarePen size={15} />
            </button>
            <button
              className={`workspace-header-button icon-only history-panel-button ${
                historyOpen ? "active" : ""
              }`}
              type="button"
              onClick={onToggleHistory}
              aria-label={historyOpen ? "Close chat history" : "Open chat history"}
              data-tooltip={historyOpen ? "Close history" : "Open history"}
              aria-pressed={historyOpen}
            >
              <PanelRight size={15} />
              {historyNotificationCount > 0 ? (
                <span
                  className="history-notification-badge"
                  aria-label={`${historyNotificationCount} completed chat${
                    historyNotificationCount === 1 ? "" : "s"
                  }`}
                >
                  {historyNotificationCount > 9
                    ? "9+"
                    : historyNotificationCount}
                </span>
              ) : null}
            </button>
          </>
        ) : null}
        </div>
        </div>
      </div>
    </section>
  );
}

function WorkspaceContextGitSummaryChip({
  gitSummary,
}: {
  gitSummary: WorkspaceGitSummary;
}) {
  const statusLabel = formatGitSummaryForStatus(gitSummary);
  const label = `${statusLabel}; ${formatChangeStatLabel(
    gitSummary.additions,
    "addition",
    "additions",
  )}, ${formatChangeStatLabel(gitSummary.deletions, "deletion", "deletions")}`;

  return (
    <span
      className="workspace-context-chip changed git-summary"
      title={label}
      aria-label={label}
    >
      <span className="workspace-context-change-stat additions">
        +{gitSummary.additions.toLocaleString()}
      </span>
      <span className="workspace-context-change-stat deletions">
        -{gitSummary.deletions.toLocaleString()}
      </span>
    </span>
  );
}

function formatChangeStatLabel(count: number, singular: string, plural: string) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

function WorkspaceContextMeter({
  tokenUsage,
  contextWindow,
}: {
  tokenUsage: RunViewState["tokenUsage"];
  contextWindow: number;
}) {
  const usage = getContextUsageDisplay(
    tokenUsage,
    contextWindow,
    DEFAULT_CONTEXT_WINDOW,
  );
  const meterStyle =
    usage.percentage === null
      ? undefined
      : ({ "--context-meter-fill": `${usage.percentage}%` } as CSSProperties);

  return (
    <span
      className={`workspace-context-meter ${usage.percentage === null ? "unknown" : ""}`}
      data-tauri-drag-region="false"
      role={usage.percentage === null ? "status" : "meter"}
      aria-label="Context usage"
      aria-valuemin={usage.percentage === null ? undefined : 0}
      aria-valuemax={usage.percentage === null ? undefined : 100}
      aria-valuenow={usage.percentage === null ? undefined : usage.percentage}
      aria-valuetext={usage.label}
      title={usage.title}
      style={meterStyle}
    >
      <span className="context-meter-copy">
        {usage.percentage === null || usage.windowLabel === null ? (
          usage.label
        ) : (
          <>
            <span className="context-meter-value">
              {usage.usedLabel} / {usage.windowLabel}
            </span>
            <span className="context-meter-percent">{usage.percentage}%</span>
          </>
        )}
      </span>
    </span>
  );
}
