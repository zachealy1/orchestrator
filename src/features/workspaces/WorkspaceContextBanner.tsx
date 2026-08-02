import {
  AlertCircle,
  Folder,
  FolderOpen,
  GitBranch,
  GitBranchPlus,
  GitCommitHorizontal,
  Loader2,
  Monitor,
  PanelRight,
  SquarePen,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ComposerSelect } from "../../components/ComposerSelect";
import { getContextUsageDisplay } from "../../lib/contextUsage";
import type { RunViewState } from "../../lib/codexEventReducer";
import { windowDragRegionValue } from "../../lib/windowDragging";
import type { BrowserSessionState } from "../browser/types";
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
  browserSession,
  onFocusBrowser,
  onStopBrowser,
  windowDragRegionsEnabled,
}: {
  workspace: Workspace | null;
  surfaceMode: "chat" | "kanban";
  onSurfaceModeChange: (mode: "chat" | "kanban") => void;
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
  onCreateBranch: () => void;
  newChatDisabled: boolean;
  onNewChat: () => void;
  historyOpen: boolean;
  historyNotificationCount: number;
  onToggleHistory: () => void;
  browserSession: BrowserSessionState | null;
  onFocusBrowser: () => void;
  onStopBrowser: () => void;
  windowDragRegionsEnabled: boolean;
}) {
  const [browserMenuOpen, setBrowserMenuOpen] = useState(false);
  const browserMenuRef = useRef<HTMLDivElement>(null);
  const deepWindowDragRegion = windowDragRegionValue(
    windowDragRegionsEnabled,
    "deep",
  );
  const browserVisible =
    browserSession !== null &&
    ["starting", "running", "awaiting-approval", "error"].includes(
      browserSession.status,
    );

  useEffect(() => {
    if (!browserMenuOpen) return;
    const closeForPointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !browserMenuRef.current?.contains(event.target)
      ) {
        setBrowserMenuOpen(false);
      }
    };
    const closeForEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBrowserMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeForPointer);
    window.addEventListener("keydown", closeForEscape);
    return () => {
      window.removeEventListener("pointerdown", closeForPointer);
      window.removeEventListener("keydown", closeForEscape);
    };
  }, [browserMenuOpen]);

  useEffect(() => {
    if (!browserVisible) setBrowserMenuOpen(false);
  }, [browserVisible]);

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
            title="Start a new chat"
          >
            <SquarePen size={15} />
          </button>
          <button
            className="workspace-header-button icon-only history-panel-button"
            type="button"
            disabled
            aria-label="Open chat history"
            title="History"
          >
            <PanelRight size={15} />
          </button>
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

  return (
    <section
      className="workspace-context-banner"
      aria-label="Selected folder"
      data-tauri-drag-region={deepWindowDragRegion}
    >
      <div className="workspace-context-left">
        <div className="workspace-context-main">
          <span className="workspace-context-icon" aria-hidden="true">
            <Folder size={17} />
          </span>
          <div data-tauri-drag-region="false">
            <strong>{workspace.label}</strong>
            <span title={workspace.path}>{workspace.path}</span>
          </div>
        </div>
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
      </div>

      <div className="workspace-context-actions" data-tauri-drag-region="false">
        <div
          className="workspace-surface-toggle"
          role="radiogroup"
          aria-label="Workspace mode"
        >
          <button
            type="button"
            role="radio"
            aria-checked={surfaceMode === "chat"}
            className={surfaceMode === "chat" ? "active" : ""}
            onClick={() => onSurfaceModeChange("chat")}
          >
            Chat
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={surfaceMode === "kanban"}
            className={surfaceMode === "kanban" ? "active" : ""}
            onClick={() => onSurfaceModeChange("kanban")}
          >
            Kanban
          </button>
        </div>
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
                {
                  id: "create-branch",
                  value: "",
                  label: "Create branch...",
                  action: true,
                  icon: <GitBranchPlus size={14} />,
                },
              ]}
              placeholder="No branch"
              icon={<GitBranch size={14} />}
              className="workspace-branch-select"
              disabled={branchSelectorDisabled}
              onChange={onBranchChange}
              onAction={(actionId) => {
                if (actionId === "create-branch") onCreateBranch();
              }}
            />
            {browserVisible ? (
              <div className="workspace-browser-action" ref={browserMenuRef}>
                <button
                  className={`workspace-header-button icon-only browser-session-button browser-${browserSession.status}`}
                  type="button"
                  aria-label="Browser session"
                  title={
                    browserSession.status === "awaiting-approval"
                      ? "Browser needs approval"
                      : browserSession.status === "starting"
                        ? "Browser is starting"
                        : browserSession.status === "error"
                          ? "Browser session failed"
                          : "Focus browser"
                  }
                  aria-expanded={browserMenuOpen}
                  onClick={() => {
                    if (
                      browserSession.status === "running" ||
                      browserSession.status === "awaiting-approval"
                    ) {
                      onFocusBrowser();
                    }
                    setBrowserMenuOpen((current) => !current);
                  }}
                >
                  {browserSession.status === "starting" ? (
                    <Loader2 className="spin" size={15} aria-hidden="true" />
                  ) : browserSession.status === "awaiting-approval" ||
                    browserSession.status === "error" ? (
                    <AlertCircle size={15} aria-hidden="true" />
                  ) : (
                    <Monitor size={15} aria-hidden="true" />
                  )}
                </button>
                {browserMenuOpen ? (
                  <div
                    className="workspace-browser-popover"
                    role="group"
                    aria-label="Browser session controls"
                  >
                    <button
                      className="native-plan-icon-action"
                      type="button"
                      aria-label="Focus browser"
                      data-tooltip="Focus browser"
                      disabled={
                        browserSession.status !== "running" &&
                        browserSession.status !== "awaiting-approval"
                      }
                      onClick={() => {
                        onFocusBrowser();
                        setBrowserMenuOpen(false);
                      }}
                    >
                      <Monitor size={15} aria-hidden="true" />
                    </button>
                    <button
                      className="native-plan-icon-action cancel"
                      type="button"
                      aria-label="Stop browser"
                      data-tooltip="Stop browser"
                      onClick={() => {
                        onStopBrowser();
                        setBrowserMenuOpen(false);
                      }}
                    >
                      <X size={15} aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="workspace-git-action">
              <button
                className="workspace-header-button icon-only primary"
                type="button"
                onClick={onGitAction}
                disabled={gitAction.disabled || gitActionStatus !== "idle"}
                title={
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
              title="Start a new chat"
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
              title={historyOpen ? "Close history" : "Open history"}
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
        ) : (
          <span className="workspace-kanban-scope-note">
            Card agents run in isolated worktrees
          </span>
        )}
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
