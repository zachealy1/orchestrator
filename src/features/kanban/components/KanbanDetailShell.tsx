import {
  ArrowLeft,
  Check,
  FileCode2,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  MessageSquare,
  Pause,
  Play,
  RefreshCw,
  Rocket,
  Square,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import "../kanban.css";
import { STATE_LABELS } from "./KanbanCardTile";
import type {
  KanbanCard,
  KanbanCardAction,
  KanbanChangedFile,
  KanbanReviewData,
} from "./types";

export type KanbanDetailTab = "conversation" | "review";

export type KanbanDetailShellProps = {
  card: KanbanCard;
  conversation: ReactNode;
  review: KanbanReviewData;
  initialTab?: KanbanDetailTab;
  onBack: () => void;
  onAction: (action: KanbanCardAction, card: KanbanCard) => void;
  onSelectReviewFile?: (file: KanbanChangedFile) => void;
};

function changedFileKey(file: KanbanChangedFile) {
  return `${file.repositoryId ?? file.repositoryLabel ?? ""}:${file.path}`;
}

function HeaderAction({
  action,
  label,
  card,
  onAction,
}: {
  action: KanbanCardAction;
  label: string;
  card: KanbanCard;
  onAction: KanbanDetailShellProps["onAction"];
}) {
  const icon =
    action === "pause" ? (
      <Pause size={15} aria-hidden="true" />
    ) : action === "stop" ? (
      <Square size={14} aria-hidden="true" />
    ) : action === "retry" ? (
      <RefreshCw size={15} aria-hidden="true" />
    ) : (
      <Play size={15} aria-hidden="true" />
    );
  return (
    <button type="button" className="kanban-detail-action" onClick={() => onAction(action, card)}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function KanbanReviewPanel({
  card,
  review,
  onAction,
  onSelectFile,
}: {
  card: KanbanCard;
  review: KanbanReviewData;
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
        <span className="kanban-eyebrow">Agent result</span>
        <h3 id="kanban-review-summary-title">Summary</h3>
        <p>{review.summary || "The agent did not provide a summary."}</p>
      </section>

      <div className="kanban-review-workspace">
        <aside aria-label="Changed files">
          <header>
            <strong>Changed files</strong>
            <span>{review.files.length}</span>
          </header>
          {review.files.length > 0 ? (
            <ul>
              {review.files.map((file) => (
                <li key={changedFileKey(file)}>
                  <button
                    type="button"
                    className={
                      changedFileKey(file) === review.selectedFilePath ||
                      file.path === review.selectedFilePath
                        ? "is-selected"
                        : undefined
                    }
                    onClick={() => onSelectFile?.(file)}
                  >
                    <FileCode2 size={14} aria-hidden="true" />
                    <span>
                      <strong>{file.path}</strong>
                      {file.repositoryLabel ? <small>{file.repositoryLabel}</small> : null}
                    </span>
                    {file.additions !== undefined || file.deletions !== undefined ? (
                      <small className="kanban-diff-counts">
                        <ins>+{file.additions ?? 0}</ins>
                        <del>−{file.deletions ?? 0}</del>
                      </small>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="kanban-review-empty">No changed files were reported.</p>
          )}
        </aside>
        <section className="kanban-review-diff" aria-label="Complete diff">
          <header>
            <strong>{selectedFile?.path ?? "Complete diff"}</strong>
            {selectedFile?.repositoryLabel ? <span>{selectedFile.repositoryLabel}</span> : null}
          </header>
          {review.diff ? (
            <pre tabIndex={0}>{review.diff}</pre>
          ) : (
            <div className="kanban-review-empty">
              <FileCode2 size={24} aria-hidden="true" />
              <p>Select a file to inspect its complete diff.</p>
            </div>
          )}
        </section>
      </div>

      <footer className="kanban-review-actions" aria-label="Review actions">
        <div>
          <button
            type="button"
            className="secondary"
            disabled={!review.canCommit || review.gitBusy}
            onClick={() => onAction("commit", card)}
          >
            <GitCommitHorizontal size={15} aria-hidden="true" />
            Commit
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!review.canPush || review.gitBusy}
            onClick={() => onAction("commit-and-push", card)}
          >
            <Rocket size={15} aria-hidden="true" />
            Commit and push
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!review.canMerge || review.gitBusy}
            onClick={() => onAction("merge", card)}
          >
            <GitMerge size={15} aria-hidden="true" />
            Merge branch
          </button>
        </div>
        <div>
          <button
            type="button"
            className="secondary"
            disabled={review.canRequestChanges === false || review.gitBusy}
            onClick={() => onAction("request-changes", card)}
          >
            <RefreshCw size={15} aria-hidden="true" />
            Request changes
          </button>
          <button
            type="button"
            className="kanban-primary-button"
            disabled={!review.canApprove}
            onClick={() => onAction("approve", card)}
          >
            <Check size={15} aria-hidden="true" />
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
  conversation,
  review,
  initialTab = "conversation",
  onBack,
  onAction,
  onSelectReviewFile,
}: KanbanDetailShellProps) {
  const [tab, setTab] = useState<KanbanDetailTab>(initialTab);
  const actions = new Set(card.availableActions ?? []);

  useEffect(() => setTab(initialTab), [card.id, initialTab]);

  return (
    <section className="kanban-detail-shell" aria-labelledby="kanban-detail-title">
      <header className="kanban-detail-header">
        <button type="button" className="kanban-back-button" onClick={onBack}>
          <ArrowLeft size={17} aria-hidden="true" />
          <span>Back to board</span>
        </button>
        <div className="kanban-detail-heading">
          <span className="kanban-state-badge" data-tone={card.executionState}>
            {STATE_LABELS[card.executionState]}
          </span>
          <h1 id="kanban-detail-title">{card.title}</h1>
          <p>Returning to the board does not interrupt this agent.</p>
        </div>
        <div className="kanban-detail-header-actions">
          {actions.has("start") ? (
            <HeaderAction action="start" label="Start" card={card} onAction={onAction} />
          ) : null}
          {actions.has("pause") ? (
            <HeaderAction action="pause" label="Pause" card={card} onAction={onAction} />
          ) : null}
          {actions.has("resume") ? (
            <HeaderAction action="resume" label="Resume" card={card} onAction={onAction} />
          ) : null}
          {actions.has("stop") ? (
            <HeaderAction action="stop" label="Stop" card={card} onAction={onAction} />
          ) : null}
          {actions.has("retry") ? (
            <HeaderAction action="retry" label="Retry" card={card} onAction={onAction} />
          ) : null}
        </div>
      </header>

      <div className="kanban-detail-context">
        <div>
          <span className="kanban-eyebrow">Original task</span>
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
            <dd>{card.reasoningLevel}</dd>
          </div>
        </dl>
        {card.branches?.length ? (
          <details className="kanban-detail-branches">
            <summary>
              <GitBranch size={14} aria-hidden="true" />
              {card.branches.length === 1 ? "Branch" : `${card.branches.length} branches`}
            </summary>
            <ul>
              {card.branches.map((binding) => (
                <li key={binding.repositoryId}>
                  <span>{binding.repositoryLabel}</span>
                  <code>{binding.branch}</code>
                  {binding.targetBranch ? <small>into {binding.targetBranch}</small> : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <div className="kanban-detail-tabs" role="tablist" aria-label="Card detail">
        <button
          type="button"
          role="tab"
          id="kanban-conversation-tab"
          aria-controls="kanban-conversation-panel"
          aria-selected={tab === "conversation"}
          onClick={() => setTab("conversation")}
        >
          <MessageSquare size={15} aria-hidden="true" />
          Conversation
        </button>
        <button
          type="button"
          role="tab"
          id="kanban-review-tab"
          aria-controls="kanban-review-panel"
          aria-selected={tab === "review"}
          onClick={() => setTab("review")}
        >
          <FileCode2 size={15} aria-hidden="true" />
          Review
          {review.files.length > 0 ? <span>{review.files.length}</span> : null}
        </button>
      </div>

      <div
        id="kanban-conversation-panel"
        role="tabpanel"
        aria-labelledby="kanban-conversation-tab"
        hidden={tab !== "conversation"}
        className="kanban-conversation-panel"
      >
        {conversation}
      </div>
      <div
        id="kanban-review-panel"
        role="tabpanel"
        aria-labelledby="kanban-review-tab"
        hidden={tab !== "review"}
      >
        <KanbanReviewPanel
          card={card}
          review={review}
          onAction={onAction}
          onSelectFile={onSelectReviewFile}
        />
      </div>
    </section>
  );
}
