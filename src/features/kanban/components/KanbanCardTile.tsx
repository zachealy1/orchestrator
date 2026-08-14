import {
  Archive,
  BrainCircuit,
  Check,
  CircleStop,
  Copy,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GripVertical,
  Flag,
  MessageSquare,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Trash2,
  UploadCloud,
  ExternalLink,
  Eye,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useDismissibleContextMenu } from "../../../shared/useDismissibleContextMenu";
import type {
  KanbanCard,
  KanbanCardAction,
  KanbanExecutionState,
} from "./types";

export type KanbanCardTileProps = {
  card: KanbanCard;
  style?: CSSProperties;
  dragging?: boolean;
  overlay?: boolean;
  actionsDisabled?: boolean;
  dragHandleProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  onAction?: (action: KanbanCardAction, card: KanbanCard) => void;
  onOpenConversation?: (card: KanbanCard) => void;
  primaryAction?: {
    label: string;
    icon: ReactNode;
    onClick: () => void;
  };
};

type KanbanMenuAction = KanbanCardAction;

const STATE_LABELS: Record<KanbanExecutionState, string> = {
  idle: "Ready",
  starting: "Starting",
  running: "Running",
  "pause-requested": "Pausing",
  paused: "Paused",
  "waiting-for-input": "Waiting for input",
  "waiting-for-approval": "Waiting for approval",
  blocked: "Blocked",
  failed: "Failed",
  stopping: "Stopping",
  stopped: "Stopped",
  interrupted: "Interrupted",
  completed: "Completed",
  "completed-awaiting-review": "Awaiting review",
};

const ACTION_LABELS: Record<KanbanCardAction, string> = {
  start: "Start agent",
  pause: "Pause agent",
  resume: "Resume agent",
  stop: "Stop agent",
  retry: "Retry work",
  edit: "Edit card",
  duplicate: "Duplicate card",
  archive: "Archive card",
  delete: "Delete card",
  commit: "Commit changes",
  "commit-and-push": "Commit and push",
  merge: "Merge branch",
  "request-changes": "Request changes",
  approve: "Approve result",
  "open-pull-request": "Open pull request",
  "retry-publication": "Retry publication",
  "complete-without-pr": "Complete without pull request",
  "review-changes": "Review changes",
};

const SUBMISSION_MODE_LABELS = {
  normal: "Chat",
  plan: "Plan",
  goal: "Goal",
} as const;

function SubmissionModeIcon({ mode }: { mode: "normal" | "plan" | "goal" }) {
  if (mode === "plan") return <BrainCircuit size={12} aria-hidden="true" />;
  if (mode === "goal") return <Flag size={12} aria-hidden="true" />;
  return <MessageSquare size={12} aria-hidden="true" />;
}

export function KanbanActionIcon({
  action,
  size = 14,
}: {
  action: KanbanCardAction;
  size?: number;
}) {
  switch (action) {
    case "start":
    case "resume":
      return <Play size={size} aria-hidden="true" />;
    case "pause":
      return <Pause size={size} aria-hidden="true" />;
    case "stop":
      return <CircleStop size={size} aria-hidden="true" />;
    case "retry":
      return <RefreshCw size={size} aria-hidden="true" />;
    case "edit":
      return <Pencil size={size} aria-hidden="true" />;
    case "duplicate":
      return <Copy size={size} aria-hidden="true" />;
    case "archive":
      return <Archive size={size} aria-hidden="true" />;
    case "delete":
      return <Trash2 size={size} aria-hidden="true" />;
    case "commit":
      return <GitCommitHorizontal size={size} aria-hidden="true" />;
    case "commit-and-push":
      return <UploadCloud size={size} aria-hidden="true" />;
    case "merge":
      return <GitMerge size={size} aria-hidden="true" />;
    case "request-changes":
      return <RefreshCw size={size} aria-hidden="true" />;
    case "approve":
      return <Check size={size} aria-hidden="true" />;
    case "open-pull-request":
      return <ExternalLink size={size} aria-hidden="true" />;
    case "retry-publication":
      return <RefreshCw size={size} aria-hidden="true" />;
    case "complete-without-pr":
      return <Check size={size} aria-hidden="true" />;
    case "review-changes":
      return <Eye size={size} aria-hidden="true" />;
  }
}

function repositoryLabel(card: KanbanCard) {
  if (card.repositoryScope === "all") return "All repositories";
  const labels = card.repositories.map((repository) => repository.label);
  if (labels.length === 0) return "No repositories selected";
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
}

export function stateTone(state: KanbanExecutionState) {
  if (state === "failed" || state === "blocked") return "danger";
  if (state === "waiting-for-approval" || state === "waiting-for-input") {
    return "attention";
  }
  if (
    state === "running" ||
    state === "starting" ||
    state === "pause-requested" ||
    state === "stopping"
  ) {
    return "active";
  }
  if (state === "completed") return "success";
  if (state === "completed-awaiting-review") return "review";
  if (state === "paused" || state === "interrupted" || state === "stopped") {
    return "muted";
  }
  return "neutral";
}

export function KanbanCardTile({
  card,
  style,
  dragging = false,
  overlay = false,
  actionsDisabled = false,
  dragHandleProps,
  onAction,
  onOpenConversation,
  primaryAction,
}: KanbanCardTileProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuItemRefs = useRef(new Map<KanbanMenuAction, HTMLButtonElement>());
  const dismissMenu = useCallback(() => setMenuOpen(false), []);
  useDismissibleContextMenu(menuOpen, menuRef, dismissMenu, menuTriggerRef);
  const branch = card.branches?.[0];
  const submissionMode = card.submissionMode ?? "normal";
  const menuActions = useMemo<KanbanMenuAction[]>(
    () => card.availableActions ?? [],
    [card.availableActions],
  );
  const conversationAvailable =
    card.hasStartedTurn && !overlay && Boolean(onOpenConversation);

  useLayoutEffect(() => {
    if (!menuOpen) return;
    const trigger = menuTriggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 8;
    const menuGap = 6;
    const width = 190;
    const estimatedHeight = Math.min(menuActions.length * 34 + 10, 420);
    const left = Math.max(
      viewportPadding,
      Math.min(rect.right - width, window.innerWidth - width - viewportPadding),
    );
    const below = rect.bottom + menuGap;
    const top =
      below + estimatedHeight <= window.innerHeight - viewportPadding
        ? below
        : Math.max(viewportPadding, rect.top - menuGap - estimatedHeight);
    setMenuStyle({ left, top, width });
  }, [menuActions.length, menuOpen]);

  useEffect(() => {
    if (actionsDisabled) setMenuOpen(false);
  }, [actionsDisabled]);

  useEffect(() => {
    if (!menuOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const firstAction = menuActions[0];
      if (firstAction) menuItemRefs.current.get(firstAction)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [menuActions, menuOpen]);

  function runAction(event: MouseEvent, action: KanbanCardAction) {
    event.stopPropagation();
    if (actionsDisabled) return;
    setMenuOpen(false);
    menuTriggerRef.current?.focus({ preventScroll: true });
    onAction?.(action, card);
  }

  function handleMenuKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    action: KanbanMenuAction,
  ) {
    if (event.key === "Tab") {
      setMenuOpen(false);
      return;
    }
    const index = menuActions.indexOf(action);
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") {
      nextIndex = (index + 1) % menuActions.length;
    } else if (event.key === "ArrowUp") {
      nextIndex = (index - 1 + menuActions.length) % menuActions.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = menuActions.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    const nextAction = menuActions[nextIndex];
    if (nextAction) menuItemRefs.current.get(nextAction)?.focus();
  }

  return (
    <article
      className={`kanban-card-tile${dragging ? " is-dragging" : ""}${
        overlay ? " is-overlay" : ""
      }`}
      data-state={card.executionState}
      data-card-id={card.id}
      style={style}
      aria-label={`${card.title}, ${STATE_LABELS[card.executionState]}`}
    >
      <div className="kanban-card-topline">
        <div className="kanban-card-badges">
          <span
            className="kanban-state-badge"
            data-tone={stateTone(card.executionState)}
          >
            <span className="kanban-state-dot" aria-hidden="true" />
            {STATE_LABELS[card.executionState]}
          </span>
          <span className="kanban-mode-badge">
            <SubmissionModeIcon mode={submissionMode} />
            {SUBMISSION_MODE_LABELS[submissionMode]}
          </span>
        </div>
        <div className="kanban-card-top-actions">
          {card.hasUnreadActivity ? (
            <span className="kanban-unread-dot" aria-label="Unread activity" />
          ) : null}
          {primaryAction && !overlay ? (
            <button
              type="button"
              className="kanban-icon-button"
              aria-label={primaryAction.label}
              title={primaryAction.label}
              disabled={actionsDisabled}
              onClick={(event) => {
                event.stopPropagation();
                if (!actionsDisabled) primaryAction.onClick();
              }}
            >
              {primaryAction.icon}
            </button>
          ) : null}
          {menuActions.length > 0 ? (
            <div className="kanban-card-menu">
              <button
                ref={menuTriggerRef}
                type="button"
                className="kanban-card-menu-trigger"
                aria-label={`Actions for ${card.title}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? menuId : undefined}
                disabled={actionsDisabled}
                onClick={(event) => {
                  event.stopPropagation();
                  if (actionsDisabled) return;
                  setMenuOpen((current) => !current);
                }}
              >
                <MoreHorizontal size={16} aria-hidden="true" />
              </button>
              {menuOpen
                ? createPortal(
                    <div
                      ref={menuRef}
                      className="kanban-card-menu-popover"
                      id={menuId}
                      role="menu"
                      style={menuStyle}
                    >
                      {menuActions.map((action) => (
                        <button
                          ref={(element) => {
                            if (element) menuItemRefs.current.set(action, element);
                            else menuItemRefs.current.delete(action);
                          }}
                          key={action}
                          type="button"
                          role="menuitem"
                          className={action === "delete" ? "danger" : undefined}
                          onClick={(event) => runAction(event, action)}
                          onKeyDown={(event) => handleMenuKeyDown(event, action)}
                        >
                          <KanbanActionIcon action={action} />
                          <span>{ACTION_LABELS[action]}</span>
                        </button>
                      ))}
                    </div>,
                    document.body,
                  )
                : null}
            </div>
          ) : null}
          {dragHandleProps ? (
            <button
              type="button"
              className="kanban-drag-handle"
              aria-label={`Move ${card.title}`}
              {...dragHandleProps}
            >
              <GripVertical size={14} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {conversationAvailable ? (
        <button
          type="button"
          className="kanban-card-content is-conversation-link"
          aria-label={`Open conversation for ${card.title}`}
          disabled={actionsDisabled}
          onClick={() => onOpenConversation?.(card)}
        >
          <KanbanCardContent card={card} branch={branch} />
        </button>
      ) : (
        <div className="kanban-card-content">
          <KanbanCardContent card={card} branch={branch} />
        </div>
      )}
    </article>
  );
}

function KanbanCardContent({
  card,
  branch,
}: {
  card: KanbanCard;
  branch: NonNullable<KanbanCard["branches"]>[number] | undefined;
}) {
  return (
    <>
        <strong>{card.title}</strong>
        {card.description ? (
          <span className="kanban-card-description">{card.description}</span>
        ) : null}
        <span className="kanban-card-metadata">
          <span title={card.repositories.map((repository) => repository.path).join("\n")}>
            {repositoryLabel(card)}
          </span>
          <span>{card.accountLabel}</span>
          <span>{card.modelLabel}</span>
          <span>
            {card.reasoningLevelLabel ??
              (card.reasoningLevel || "Model default")}
          </span>
        </span>

        {branch || card.changedFileCount ? (
          <span className="kanban-card-footer">
            {branch ? (
              <span className="kanban-branch-label" title={branch.branch}>
                <GitBranch size={13} aria-hidden="true" />
                {branch.branch}
                {(card.branches?.length ?? 0) > 1
                  ? ` +${(card.branches?.length ?? 1) - 1}`
                  : ""}
              </span>
            ) : (
              <span />
            )}
            {card.changedFileCount ? (
              <span>
                {card.changedFileCount} changed {card.changedFileCount === 1 ? "file" : "files"}
              </span>
            ) : null}
          </span>
        ) : null}
        {card.pullRequests?.length ? (
          <span className="kanban-pr-status-list" aria-label="Pull request publication status">
            {card.pullRequests.map((pullRequest) => (
              <span
                key={pullRequest.sourceRepositoryPath}
                data-status={pullRequest.publicationStatus}
                title={pullRequest.error ?? pullRequest.url ?? undefined}
              >
                {pullRequest.relativePath === "."
                  ? "Pull request"
                  : pullRequest.relativePath}
                {": "}
                {pullRequest.publicationStatus === "queued" ||
                pullRequest.publicationStatus === "publishing"
                  ? "Publishing"
                  : pullRequest.publicationStatus === "draft"
                    ? "Draft PR"
                    : pullRequest.publicationStatus === "ready"
                      ? "Ready for review"
                      : pullRequest.publicationStatus === "nothing_to_publish"
                        ? "Nothing to publish"
                        : pullRequest.publicationStatus === "failed"
                          ? "Publication failed"
                          : pullRequest.publicationStatus === "merged"
                            ? "Merged"
                            : "Closed"}
              </span>
            ))}
          </span>
        ) : null}
        {card.reviewChannel === "local" &&
        card.executionState === "completed-awaiting-review" ? (
          <span className="kanban-local-review-status">Local review</span>
        ) : null}
    </>
  );
}

export { ACTION_LABELS, STATE_LABELS };
