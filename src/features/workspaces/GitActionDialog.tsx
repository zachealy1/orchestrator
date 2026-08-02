import {
  AlertCircle,
  Check,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  Loader2,
  UploadCloud,
} from "lucide-react";
import { ComposerSelect } from "../../components/ComposerSelect";
import type { GitOperationPhase } from "../../lib/gitOperations";
import type { HeaderGitAction, WorkspaceGitSummary } from "./gitModel";
import type {
  WorkspaceGitOverview,
  WorkspaceGitRepositoryStatus,
} from "./types";

export type GitActionDialogModel = {
  actionStatus: GitOperationPhase | "idle";
  branch: string | null;
  overview: WorkspaceGitOverview | null;
  repository: WorkspaceGitRepositoryStatus | null;
  summary: WorkspaceGitSummary;
  headerAction: HeaderGitAction;
  commitMessage: string;
  feedback: string;
  feedbackIsError: boolean;
  includeUnstagedChanges: boolean;
  canCommit: boolean;
};

export type GitActionDialogActions = {
  onClose: () => void;
  onRepositoryChange: (repositoryPath: string) => void;
  onCommitMessageChange: (message: string) => void;
  onIncludeUnstagedChange: (include: boolean) => void;
  onCommit: () => void;
  onCommitAndPush: () => void;
  onPush: () => void;
};

type GitActionDialogProps = {
  model: GitActionDialogModel;
  actions: GitActionDialogActions;
};

export function GitActionDialog({ model, actions }: GitActionDialogProps) {
  const isIdle = model.actionStatus === "idle";

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && isIdle) actions.onClose();
      }}
    >
      <section
        className="confirmation-dialog git-action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="git-action-title"
      >
        <h2 className="sr-only" id="git-action-title">
          Commit or push
        </h2>
        <div className="git-action-status-row">
          <div className="git-action-branch-context">
            <span className="git-action-branch">
              <GitBranch size={15} aria-hidden="true" />
              <span>{model.branch ?? "No branch"}</span>
            </span>
            {model.overview && model.overview.repositories.length > 1 ? (
              <ComposerSelect
                ariaLabel="Commit repository"
                value={model.repository?.repository.rootPath ?? ""}
                options={model.overview.repositories.map((repository) => ({
                  value: repository.repository.rootPath,
                  label: repository.repository.label,
                }))}
                placeholder="Choose repository"
                icon={<FolderOpen size={15} />}
                className="git-action-repository-select"
                disabled={!isIdle}
                onChange={actions.onRepositoryChange}
              />
            ) : null}
          </div>
          {model.summary.total > 0 ? (
            <span
              className="git-action-diff-summary"
              aria-label={`${model.summary.additions} additions, ${model.summary.deletions} deletions`}
            >
              <span className="added">+{model.summary.additions}</span>
              <span className="deleted">-{model.summary.deletions}</span>
            </span>
          ) : (
            <span className={`git-action-state ${model.headerAction.statusKind}`}>
              {model.headerAction.statusLabel}
            </span>
          )}
        </div>

        <label className="git-action-message">
          <textarea
            aria-label="Commit message"
            placeholder="Commit message (leave blank to generate)..."
            value={model.commitMessage}
            onChange={(event) =>
              actions.onCommitMessageChange(event.currentTarget.value)
            }
            disabled={!isIdle}
          />
        </label>

        <div className="git-action-feedback-slot">
          {model.feedback ? (
            <p
              className={`git-action-feedback ${model.feedbackIsError ? "error" : ""}`}
              role={model.feedbackIsError ? "alert" : "status"}
            >
              {model.feedbackIsError ? (
                <AlertCircle
                  className="git-action-feedback-icon"
                  size={16}
                  aria-hidden="true"
                />
              ) : null}
              <span>{model.feedback}</span>
            </p>
          ) : null}
        </div>

        <label
          className={`git-action-include-row ${
            model.includeUnstagedChanges ? "checked" : ""
          }`}
        >
          <input
            className="git-action-include-input"
            type="checkbox"
            checked={model.includeUnstagedChanges}
            onChange={(event) =>
              actions.onIncludeUnstagedChange(event.currentTarget.checked)
            }
            disabled={!isIdle}
          />
          <span className="git-action-checkbox" aria-hidden="true">
            {model.includeUnstagedChanges ? (
              <Check size={14} strokeWidth={3} />
            ) : null}
          </span>
          <span>Include unstaged changes</span>
        </label>

        <div className="git-action-actions" role="group" aria-label="Git actions">
          <button
            className="git-action-row primary"
            type="button"
            aria-label="Commit"
            onClick={actions.onCommit}
            disabled={!model.canCommit || !isIdle}
          >
            <span>
              {model.actionStatus === "committing" ||
              model.actionStatus === "generating" ? (
                <Loader2 className="spin" size={16} aria-hidden="true" />
              ) : (
                <GitCommitHorizontal size={16} aria-hidden="true" />
              )}
              {model.actionStatus === "generating" ? "Generating" : "Commit"}
            </span>
            <kbd>Cmd Return</kbd>
          </button>
          <button
            className="git-action-row"
            type="button"
            aria-label="Commit and push"
            onClick={actions.onCommitAndPush}
            disabled={!model.canCommit || !isIdle}
          >
            <span>
              {model.actionStatus === "generating" ? (
                <Loader2 className="spin" size={16} aria-hidden="true" />
              ) : (
                <UploadCloud size={16} aria-hidden="true" />
              )}
              {model.actionStatus === "generating"
                ? "Generating"
                : "Commit and push"}
            </span>
          </button>
          <button
            className="git-action-row"
            type="button"
            aria-label="Push"
            onClick={actions.onPush}
            disabled={!model.headerAction.canPush || !isIdle}
          >
            <span>
              {model.actionStatus === "pushing" ? (
                <Loader2 className="spin" size={16} aria-hidden="true" />
              ) : (
                <UploadCloud size={16} aria-hidden="true" />
              )}
              Push
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}
