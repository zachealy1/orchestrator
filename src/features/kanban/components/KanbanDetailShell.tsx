import {
  ArrowLeft,
  FileCode2,
  GitBranch,
  Loader2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodePreview } from "../../../components/CodePreview";
import type { ResolvedTheme } from "../../../shared/types";
import { useDismissibleContextMenu } from "../../../shared/useDismissibleContextMenu";
import "../kanban.css";
import {
  KanbanActionIcon,
  STATE_LABELS,
  stateTone,
} from "./KanbanCardTile";
import type {
  KanbanCard,
  KanbanCardAction,
  KanbanChangedFile,
  KanbanReviewData,
} from "./types";

export type KanbanDetailShellProps = {
  card: KanbanCard;
  review: KanbanReviewData;
  resolvedTheme: ResolvedTheme;
  disabled?: boolean;
  onBack: () => void;
  onAction: (action: KanbanCardAction, card: KanbanCard) => void;
  onSelectReviewFile?: (file: KanbanChangedFile) => void;
};

function changedFileKey(file: KanbanChangedFile) {
  return `${file.repositoryId ?? file.repositoryLabel ?? ""}:${file.path}`;
}

const FILE_STATUS_PRESENTATION: Record<
  string,
  { badge: string; label: string; tone: string }
> = {
  added: { badge: "A", label: "added", tone: "added" },
  conflicted: { badge: "U", label: "conflicted", tone: "conflicted" },
  copied: { badge: "C", label: "copied", tone: "copied" },
  deleted: { badge: "D", label: "deleted", tone: "deleted" },
  modified: { badge: "M", label: "modified", tone: "modified" },
  renamed: { badge: "R", label: "renamed", tone: "renamed" },
  untracked: { badge: "U", label: "untracked", tone: "untracked" },
};

function HeaderAction({
  action,
  label,
  card,
  onAction,
  disabled = false,
}: {
  action: KanbanCardAction;
  label: string;
  card: KanbanCard;
  onAction: KanbanDetailShellProps["onAction"];
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="kanban-detail-action"
      disabled={disabled}
      onClick={() => onAction(action, card)}
    >
      <KanbanActionIcon action={action} size={15} />
      <span>{label}</span>
    </button>
  );
}

export function KanbanReviewPanel({
  card,
  review,
  resolvedTheme,
  disabled = false,
  onAction,
  onSelectFile,
}: {
  card: KanbanCard;
  review: KanbanReviewData;
  resolvedTheme: ResolvedTheme;
  disabled?: boolean;
  onAction: KanbanDetailShellProps["onAction"];
  onSelectFile?: (file: KanbanChangedFile) => void;
}) {
  const selectedFile = review.files.find(
    (file) =>
      changedFileKey(file) === review.selectedFilePath ||
      file.path === review.selectedFilePath,
  );

  return (
    <div className="kanban-review-panel">
      <section className="kanban-review-summary" aria-labelledby="kanban-review-summary-title">
        <span className="eyebrow">Agent result</span>
        <h3 id="kanban-review-summary-title">Summary</h3>
        <div className="run-summary markdown-summary kanban-review-summary-copy">
          <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
            {review.summary || "The agent did not provide a summary."}
          </ReactMarkdown>
        </div>
      </section>

      <div className="kanban-review-workspace">
        <aside aria-label="Changed files">
          <header>
            <strong>Changed files</strong>
            <span>{review.files.length}</span>
          </header>
          {review.files.length > 0 ? (
            <ul>
              {review.files.map((file) => {
                const status = file.status
                  ? FILE_STATUS_PRESENTATION[file.status]
                  : undefined;
                const selected =
                  changedFileKey(file) === review.selectedFilePath ||
                  file.path === review.selectedFilePath;
                return (
                  <li key={changedFileKey(file)}>
                    <button
                      type="button"
                      disabled={disabled || review.gitBusy}
                      aria-label={`${file.path}${
                        file.repositoryLabel ? ` in ${file.repositoryLabel}` : ""
                      }${status ? `, ${status.label}` : ""}`}
                      aria-pressed={selected}
                      className={selected ? "is-selected" : undefined}
                      onClick={() => onSelectFile?.(file)}
                    >
                      {status ? (
                        <span
                          className={`workspace-git-badge ${status.tone}`}
                          aria-hidden="true"
                        >
                          {status.badge}
                        </span>
                      ) : (
                        <FileCode2 size={14} aria-hidden="true" />
                      )}
                      <span>
                        <strong>{file.path}</strong>
                        {file.repositoryLabel ? (
                          <small>{file.repositoryLabel}</small>
                        ) : null}
                      </span>
                      {file.additions !== undefined ||
                      file.deletions !== undefined ? (
                        <small className="kanban-diff-counts">
                          <ins>+{file.additions ?? 0}</ins>
                          <del>−{file.deletions ?? 0}</del>
                        </small>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="kanban-review-empty">No changed files were reported.</p>
          )}
        </aside>
        <section
          className="kanban-review-diff"
          aria-label={selectedFile ? `Diff for ${selectedFile.path}` : "File diff"}
        >
          <header>
            <strong>{selectedFile?.path ?? "File diff"}</strong>
            {selectedFile?.repositoryLabel ? <span>{selectedFile.repositoryLabel}</span> : null}
          </header>
          {review.gitBusy ? (
            <div className="kanban-review-loading" role="status">
              <Loader2 className="spin" size={18} aria-hidden="true" />
              <span>Loading file changes…</span>
            </div>
          ) : review.diff ? (
            <CodePreview
              path={selectedFile?.path ?? "changes.diff"}
              content={review.diff}
              resolvedTheme={resolvedTheme}
              truncated={false}
              languageOverride="diff"
            />
          ) : (
            <div className="kanban-review-empty">
              <FileCode2 size={24} aria-hidden="true" />
              <p>
                {selectedFile
                  ? "No diff is available for this file."
                  : "Select a file to inspect its diff."}
              </p>
            </div>
          )}
        </section>
      </div>

      <footer className="kanban-review-actions" aria-label="Review actions">
        <div>
          <button
            type="button"
            className="secondary"
            disabled={disabled || !review.canCommit || review.gitBusy}
            onClick={() => onAction("commit", card)}
          >
            <KanbanActionIcon action="commit" size={15} />
            Commit
          </button>
          <button
            type="button"
            className="secondary"
            disabled={disabled || !review.canPush || review.gitBusy}
            onClick={() => onAction("commit-and-push", card)}
          >
            <KanbanActionIcon action="commit-and-push" size={15} />
            Commit and push
          </button>
          <button
            type="button"
            className="secondary"
            disabled={disabled || !review.canMerge || review.gitBusy}
            onClick={() => onAction("merge", card)}
          >
            <KanbanActionIcon action="merge" size={15} />
            Merge branch
          </button>
        </div>
        <div>
          <button
            type="button"
            className="secondary"
            disabled={disabled || !review.canRequestChanges || review.gitBusy}
            onClick={() => onAction("request-changes", card)}
          >
            <KanbanActionIcon action="request-changes" size={15} />
            Request changes
          </button>
          <button
            type="button"
            disabled={disabled || !review.canApprove || review.gitBusy}
            onClick={() => onAction("approve", card)}
          >
            <KanbanActionIcon action="approve" size={15} />
            Approve result
          </button>
        </div>
        <p>
          Approval moves this card to Done. Git commit, push, and merge actions never do so automatically.
        </p>
      </footer>
    </div>
  );
}

export function KanbanDetailShell({
  card,
  review,
  resolvedTheme,
  disabled = false,
  onBack,
  onAction,
  onSelectReviewFile,
}: KanbanDetailShellProps) {
  const [branchesOpen, setBranchesOpen] = useState(false);
  const branchesId = useId();
  const branchesRef = useRef<HTMLDivElement>(null);
  const branchesTriggerRef = useRef<HTMLButtonElement>(null);
  const dismissBranches = useCallback(() => setBranchesOpen(false), []);
  useDismissibleContextMenu(
    branchesOpen,
    branchesRef,
    dismissBranches,
    branchesTriggerRef,
  );
  const actions = new Set(card.availableActions ?? []);

  useEffect(() => {
    setBranchesOpen(false);
  }, [card.id]);

  return (
    <section className="kanban-detail-shell" aria-labelledby="kanban-detail-title">
      <header className="kanban-detail-header">
        <button type="button" className="kanban-back-button" onClick={onBack}>
          <ArrowLeft size={17} aria-hidden="true" />
          <span>Back to board</span>
        </button>
        <div className="kanban-detail-heading">
          <span className="kanban-state-badge" data-tone={stateTone(card.executionState)}>
            {STATE_LABELS[card.executionState]}
          </span>
          <h1 id="kanban-detail-title">{card.title}</h1>
          <p>Returning to the board does not interrupt this agent.</p>
        </div>
        <div className="kanban-detail-header-actions">
          {actions.has("start") ? (
            <HeaderAction action="start" label="Start" card={card} onAction={onAction} disabled={disabled} />
          ) : null}
          {actions.has("pause") ? (
            <HeaderAction action="pause" label="Pause" card={card} onAction={onAction} disabled={disabled} />
          ) : null}
          {actions.has("resume") ? (
            <HeaderAction action="resume" label="Resume" card={card} onAction={onAction} disabled={disabled} />
          ) : null}
          {actions.has("stop") ? (
            <HeaderAction action="stop" label="Stop" card={card} onAction={onAction} disabled={disabled} />
          ) : null}
          {actions.has("retry") ? (
            <HeaderAction action="retry" label="Retry" card={card} onAction={onAction} disabled={disabled} />
          ) : null}
        </div>
      </header>

      <div className="kanban-detail-context">
        <div>
          <span className="eyebrow">Original task</span>
          <p>{card.description}</p>
        </div>
        <dl>
          <div>
            <dt>Repositories</dt>
            <dd>
              {card.repositoryScope === "all"
                ? "All in workspace"
                : card.repositories.map((repository) => repository.label).join(", ")}
            </dd>
          </div>
          <div>
            <dt>Account</dt>
            <dd>{card.accountLabel}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{card.modelLabel}</dd>
          </div>
          <div>
            <dt>Reasoning</dt>
            <dd>
              {card.reasoningLevelLabel ??
                (card.reasoningLevel || "Model default")}
            </dd>
          </div>
          <div>
            <dt>Mode</dt>
            <dd>
              {card.submissionMode === "goal"
                ? "Goal mode"
                : card.submissionMode === "plan"
                  ? "Plan mode"
                  : "Normal chat"}
            </dd>
          </div>
        </dl>
        {card.branches?.length ? (
          <div className="kanban-detail-branches" ref={branchesRef}>
            <button
              ref={branchesTriggerRef}
              type="button"
              className="kanban-detail-branches-trigger"
              aria-expanded={branchesOpen}
              aria-controls={branchesId}
              onClick={() => setBranchesOpen((current) => !current)}
            >
              <GitBranch size={14} aria-hidden="true" />
              {card.branches.length === 1 ? "Branch" : `${card.branches.length} branches`}
            </button>
            {branchesOpen ? (
              <ul id={branchesId} aria-label="Card branches">
                {card.branches.map((binding) => (
                  <li key={binding.repositoryId}>
                    <span>{binding.repositoryLabel}</span>
                    <code>{binding.branch}</code>
                    {binding.targetBranch ? <small>into {binding.targetBranch}</small> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="kanban-review-tabpanel" aria-label="Review">
        <KanbanReviewPanel
          card={card}
          review={review}
          resolvedTheme={resolvedTheme}
          disabled={disabled}
          onAction={onAction}
          onSelectFile={onSelectReviewFile}
        />
      </div>
    </section>
  );
}
