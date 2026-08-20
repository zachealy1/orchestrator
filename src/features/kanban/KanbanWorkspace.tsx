import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ExternalLink,
  FilterX,
  GitPullRequest,
  LogIn,
  Loader2,
  X,
} from "lucide-react";
import type { CodexAccountProfile } from "../accounts/types";
import {
  type CodexAccessMode,
  type CodexModel,
  type CodexProfileKey,
} from "../codex/types";
import type { ComposerContextFile } from "../composer/types";
import {
  completeKanbanWithoutPullRequest,
  openPullRequest,
  publishKanbanCard,
  syncKanbanPullRequests,
  type GithubConnectionStatus,
  type KanbanPullRequestRecord,
} from "../github/api";
import { formatReasoningEffort } from "../composer/promptHelpers";
import type { HistoryRunSummary } from "../conversations/types";
import type {
  Workspace,
  WorkspaceGitRepositoryStatus,
} from "../workspaces/types";
import type { ResolvedTheme } from "../../shared/types";
import { trapDialogFocus } from "../../shared/dialogFocus";
import {
  createRunExecutionSettings,
  parseRunExecutionSettings,
  serializeRunExecutionSettings,
} from "../../lib/runExecutionSettings";
import {
  approveKanbanCard,
  approveKanbanLocalReview,
  archiveKanbanCard,
  cleanupKanbanGit,
  commitKanbanGit,
  createKanbanCard,
  deleteKanbanCard,
  loadKanbanBoard,
  loadKanbanGitBindings,
  loadKanbanLocalReview,
  loadKanbanWorkspaceBootstrap,
  mergeKanbanGit,
  moveKanbanCard,
  pushKanbanGit,
  reconcileKanbanGit,
  reopenKanbanCard,
  saveKanbanGitBindings,
  saveKanbanInheritedContext,
  saveKanbanPreferences,
  updateKanbanCard,
  useKanbanLocalReview,
  completeKanbanLocalReviewWithoutChanges,
  type KanbanAttemptRecord,
  type KanbanBoardSnapshotRecord,
  type KanbanCardDraft as PersistedKanbanCardDraft,
  type KanbanCardRecord,
  type KanbanColumnKey,
  type KanbanGitBinding,
  type KanbanLocalReview,
} from "./api";
import {
  DEFAULT_KANBAN_FILTER_STATE,
  deriveCardCapabilities,
  deriveCardTransition,
  filterKanbanCards,
  groupKanbanCards,
  sortKanbanCards,
  type KanbanCard as DomainKanbanCard,
  type KanbanFilterState,
  type KanbanGrouping,
  type KanbanStage,
} from "./domain";
import {
  KanbanArchivedView,
  KanbanBoard,
  KanbanCardDialog,
  KanbanToolbar,
  KanbanTransitionDialog,
  KanbanLocalReviewDrawer,
  type KanbanCard as ViewKanbanCard,
  type KanbanCardAction,
  type KanbanCardDraft,
  type KanbanCleanupOption,
  type KanbanColumn,
  type KanbanColumnId,
  type KanbanFilterGroup,
  type KanbanFilterSelection,
  type KanbanGroupBy,
  type KanbanMoveRequest,
  type KanbanTransitionKind,
} from "./components";
import {
  KanbanActionIcon,
  STATE_LABELS,
} from "./components/KanbanCardTile";
import {
  readKanbanWorkspaceCache,
  readReconciledKanbanBinding,
  writeKanbanWorkspaceCache,
  writeKanbanWorkspaceScroll,
  writeReconciledKanbanBinding,
} from "./workspaceCache";
import {
  FLOATING_STATUS_NOTICE_TIMEOUT_MS,
  FloatingHeaderStatusBubble,
  type FloatingStatusNotice,
} from "../../components/FloatingHeaderStatusBubble";
import "./kanban.css";

export type KanbanLaunchKind = KanbanAttemptRecord["kind"];

type Props = {
  active?: boolean;
  workspace: Workspace;
  repositories: WorkspaceGitRepositoryStatus[];
  accounts: CodexAccountProfile[];
  sharedProfileAvailable?: boolean;
  models: CodexModel[];
  refreshToken: number;
  listChatTranscript: (chatId: number) => Promise<HistoryRunSummary[]>;
  onLaunch: (
    card: KanbanCardRecord,
    kind: KanbanLaunchKind,
    prompt: string,
  ) => Promise<void>;
  onPause: (card: KanbanCardRecord) => Promise<void>;
  onStop: (card: KanbanCardRecord) => Promise<void>;
  onOpenConversation: (card: KanbanCardRecord) => Promise<void>;
  onPickContextFiles?: () => Promise<ComposerContextFile[]>;
  githubConnection: GithubConnectionStatus | null;
  githubConnectionPending: boolean;
  onConnectGithub: () => void;
  onShowGithubLogin: () => void;
  toolbarHost?: HTMLElement | null;
  resolvedTheme: ResolvedTheme;
};

type StoredPreferences = {
  search: string;
  filters: KanbanFilterSelection;
  groupBy: KanbanGroupBy;
  columnOrder: KanbanColumnKey[];
};

type CardDialogState = {
  mode: "edit" | "duplicate";
  cardId: string | null;
};

type PendingTransition = {
  kind: KanbanTransitionKind;
  cardId: string;
  destination?: KanbanColumnKey;
  move?: KanbanMoveRequest;
};

type GitDialogState = {
  action: "commit" | "commit-and-push" | "merge";
  cardId: string;
  message: string;
};

type PullRequestChooserState = {
  cardTitle: string;
  pullRequests: KanbanPullRequestRecord[];
};

type LocalReviewState = {
  cardId: string;
  review: KanbanLocalReview | null;
  loading: boolean;
  error: string | null;
};

const PENDING_PUBLICATION_SYNC_INTERVAL_MS = 2_000;
const REVIEW_PULL_REQUEST_SYNC_INTERVAL_MS = 10_000;

type KanbanStatusMessage = {
  workspaceId: number;
  message: string;
  revision: number;
};

type GitDialogProps = {
  dialog: GitDialogState;
  busy: boolean;
  onMessageChange: (message: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

const DEFAULT_COLUMN_ORDER: KanbanColumnKey[] = [
  "todo",
  "in_progress",
  "in_review",
  "done",
];

const STAGE_TO_VIEW: Record<KanbanStage, KanbanColumnId> = {
  todo: "todo",
  in_progress: "in-progress",
  in_review: "in-review",
  done: "done",
};

const VIEW_TO_STAGE: Record<string, KanbanColumnKey> = {
  todo: "todo",
  "in-progress": "in_progress",
  "in-review": "in_review",
  done: "done",
};

const COLUMN_COPY: Record<
  KanbanColumnKey,
  { title: string; description: string }
> = {
  todo: { title: "To do", description: "Ready to start" },
  in_progress: { title: "In progress", description: "Agent work and attention" },
  in_review: { title: "In review", description: "Review and merge on GitHub" },
  done: { title: "Done", description: "Merged or explicitly completed work" },
};

const GIT_DIALOG_COPY: Record<
  GitDialogState["action"],
  { title: string; confirm: string; busy: string }
> = {
  commit: {
    title: "Commit changes?",
    confirm: "Commit changes",
    busy: "Committing…",
  },
  "commit-and-push": {
    title: "Commit and push changes?",
    confirm: "Commit and push",
    busy: "Committing and pushing…",
  },
  merge: {
    title: "Merge card branches?",
    confirm: "Merge branches",
    busy: "Merging…",
  },
};

function GitDialogActionIcon({
  action,
  busy,
}: {
  action: GitDialogState["action"];
  busy: boolean;
}) {
  if (busy) return <Loader2 className="spin" size={15} aria-hidden="true" />;
  return <KanbanActionIcon action={action} size={15} />;
}

function KanbanGitDialog({
  dialog,
  busy,
  onMessageChange,
  onCancel,
  onConfirm,
}: GitDialogProps) {
  const dialogRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const copy = GIT_DIALOG_COPY[dialog.action];
  const messageRequired = dialog.action !== "merge";
  const iconOnlyActions = dialog.action === "merge";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const target = messageRequired ? inputRef.current : confirmRef.current;
      target?.focus({ preventScroll: true });
      if (messageRequired) inputRef.current?.select();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      const returnTarget = returnFocusRef.current;
      window.requestAnimationFrame(() => {
        if (returnTarget?.isConnected) {
          returnTarget.focus({ preventScroll: true });
        }
      });
    };
  }, [dialog.action, dialog.cardId, messageRequired]);

  useEffect(() => {
    if (busy) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel]);

  useEffect(() => {
    if (busy) dialogRef.current?.focus({ preventScroll: true });
  }, [busy]);

  const confirmDisabled = busy || (messageRequired && !dialog.message.trim());

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <form
        ref={dialogRef}
        className="confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-busy={busy}
        aria-labelledby="kanban-git-dialog-title"
        aria-describedby="kanban-git-dialog-description"
        tabIndex={-1}
        onKeyDown={trapDialogFocus}
        onSubmit={(event) => {
          event.preventDefault();
          if (!confirmDisabled) onConfirm();
        }}
      >
        <div>
          {!iconOnlyActions ? <p className="eyebrow">Git</p> : null}
          <h2 id="kanban-git-dialog-title">{copy.title}</h2>
          <p id="kanban-git-dialog-description">
            Each repository is handled independently. Partial results are
            reported and never mark the card Done.
          </p>
        </div>
        {messageRequired ? (
          <label className="field kanban-field">
            <span>Commit message</span>
            <input
              ref={inputRef}
              type="text"
              value={dialog.message}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              onChange={(event) => onMessageChange(event.currentTarget.value)}
            />
          </label>
        ) : null}
        <div className="confirmation-actions">
          <button
            type="button"
            className={iconOnlyActions ? "native-plan-icon-action" : "secondary"}
            aria-label={iconOnlyActions ? "Cancel" : undefined}
            data-tooltip={iconOnlyActions ? "Cancel" : undefined}
            disabled={busy}
            onClick={onCancel}
          >
            {iconOnlyActions ? <X size={15} aria-hidden="true" /> : "Cancel"}
          </button>
          <button
            ref={confirmRef}
            type="submit"
            className={iconOnlyActions ? "native-plan-icon-action implement" : undefined}
            aria-label={iconOnlyActions ? (busy ? copy.busy : copy.confirm) : undefined}
            data-tooltip={iconOnlyActions ? (busy ? copy.busy : copy.confirm) : undefined}
            disabled={confirmDisabled}
          >
            <GitDialogActionIcon action={dialog.action} busy={busy} />
            {iconOnlyActions ? null : busy ? copy.busy : copy.confirm}
          </button>
        </div>
      </form>
    </div>
  );
}

function PullRequestChooser({
  chooser,
  onClose,
  onOpen,
}: {
  chooser: PullRequestChooserState;
  onClose: () => void;
  onOpen: (pullRequest: KanbanPullRequestRecord) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLButtonElement>(".kanban-pr-chooser-option")
        ?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      const returnTarget = returnFocusRef.current;
      window.requestAnimationFrame(() => {
        if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
      });
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="confirmation-dialog kanban-pr-chooser"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kanban-pr-chooser-title"
        aria-describedby="kanban-pr-chooser-description"
        tabIndex={-1}
        onKeyDown={trapDialogFocus}
      >
        <header>
          <div>
            <h2 id="kanban-pr-chooser-title">Open pull request</h2>
            <p id="kanban-pr-chooser-description">{chooser.cardTitle}</p>
          </div>
          <button
            type="button"
            className="native-plan-icon-action"
            aria-label="Close pull request chooser"
            data-tooltip="Close"
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="kanban-pr-chooser-options">
          {chooser.pullRequests.map((pullRequest) => (
            <button
              key={pullRequest.sourceRepositoryPath}
              type="button"
              className="kanban-pr-chooser-option"
              onClick={() => onOpen(pullRequest)}
            >
              <span>
                <strong>{pullRequest.relativePath || pullRequest.repository}</strong>
                <small>#{pullRequest.number} · {pullRequest.baseBranch}</small>
              </span>
              <ExternalLink size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function parsePreferences(value: string): StoredPreferences {
  try {
    const parsed = JSON.parse(value) as Partial<StoredPreferences>;
    const order = Array.isArray(parsed.columnOrder)
      ? parsed.columnOrder.filter((stage): stage is KanbanColumnKey =>
          DEFAULT_COLUMN_ORDER.includes(stage as KanbanColumnKey),
        )
      : [];
    return {
      search: typeof parsed.search === "string" ? parsed.search : "",
      filters:
        parsed.filters && typeof parsed.filters === "object"
          ? parsed.filters
          : {},
      groupBy: typeof parsed.groupBy === "string" ? parsed.groupBy : "none",
      columnOrder:
        order.length === DEFAULT_COLUMN_ORDER.length
          ? order
          : [...DEFAULT_COLUMN_ORDER],
    };
  } catch {
    return {
      search: "",
      filters: {},
      groupBy: "none",
      columnOrder: [...DEFAULT_COLUMN_ORDER],
    };
  }
}

function toDomainCard(card: KanbanCardRecord): DomainKanbanCard {
  return {
    id: card.id,
    workspaceId: card.workspaceId,
    chatId: card.chatId,
    title: card.title,
    description: card.description,
    config: {
      accountId: card.accountId,
      accessMode: card.accessMode,
      model: card.model,
      reasoningLevel: card.reasoningLevel,
      executionSettingsJson: card.executionSettingsJson,
      repositoryScope: card.repositoryScope,
      repositories: card.repositories,
    },
    stage: card.stage,
    sortPosition: card.sortPosition,
    executionState: card.executionState,
    reviewState: card.reviewState,
    reviewChannel: card.reviewChannel,
    currentAttemptId: card.currentAttemptId,
    stateVersion: card.stateVersion,
    archivedAt: card.archivedAt,
    deletedAt: card.deletedAt,
    approvedAt: card.approvedAt,
    lastError: card.lastError,
    hasStartedTurn: card.hasStartedTurn,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    pullRequests: card.pullRequests,
  };
}

function submissionMode(card: DomainKanbanCard) {
  const settings = parseRunExecutionSettings(card.config.executionSettingsJson);
  if (!settings) return "normal" as const;
  if (settings.goalMode) return "goal" as const;
  if (settings.mode === "plan") return "plan" as const;
  return "normal" as const;
}

function viewExecutionState(card: DomainKanbanCard): ViewKanbanCard["executionState"] {
  if (card.executionState === "waiting_user") return "waiting-for-input";
  if (card.executionState === "waiting_approval") return "waiting-for-approval";
  if (card.executionState === "completed") {
    return card.stage === "done"
      ? "completed"
      : "completed-awaiting-review";
  }
  return card.executionState;
}

function viewActions(card: DomainKanbanCard): KanbanCardAction[] {
  const capabilities = deriveCardCapabilities(card);
  const pairs: Array<[keyof typeof capabilities, KanbanCardAction]> = [
    ["start", "start"],
    ["pause", "pause"],
    ["resume", "resume"],
    ["stop", "stop"],
    ["retry", "retry"],
    ["edit", "edit"],
    ["duplicate", "duplicate"],
    ["archive", "archive"],
    ["delete", "delete"],
    ["open_pull_request", "open-pull-request"],
    ["retry_publication", "retry-publication"],
    ["review_locally", "review-locally"],
    ["complete_without_pr", "complete-without-pr"],
    ["review_changes", "review-changes"],
  ];
  return pairs
    .filter(([capability]) => capabilities[capability].enabled)
    .map(([, action]) => action);
}

function toFilterState(
  preferences: StoredPreferences,
  archived = false,
): KanbanFilterState {
  const filters = preferences.filters;
  const accountIds = (filters.account ?? []).map((value) =>
    value === "default" ? null : Number(value),
  );
  const executionStates = (filters["execution-state"] ?? []).map((value) => {
    if (value === "waiting-for-input") return "waiting_user";
    if (value === "waiting-for-approval") return "waiting_approval";
    if (value === "completed-awaiting-review") return "completed";
    return value;
  }) as KanbanFilterState["executionStates"];
  return {
    ...DEFAULT_KANBAN_FILTER_STATE,
    search: preferences.search,
    repositoryPaths: filters.repository ?? [],
    accountIds: accountIds.filter(
      (value): value is number | null => value === null || Number.isFinite(value),
    ),
    accessModes: (filters["access-mode"] ?? []) as CodexAccessMode[],
    models: filters.model ?? [],
    reasoningLevels: filters["reasoning-level"] ?? [],
    executionStates,
    visibility: archived ? "archived" : "active",
  };
}

function toDomainGrouping(grouping: KanbanGroupBy): KanbanGrouping {
  if (grouping === "access-mode") return "access_mode";
  if (grouping === "reasoning-level") return "reasoning_level";
  if (grouping === "execution-state") return "execution_state";
  return grouping;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function inheritedConversationContext(
  runs: HistoryRunSummary[],
) {
  const sections = runs.flatMap((run, index) => {
    const section = [
      `Turn ${index + 1} — user`,
      run.original_prompt.trim(),
      `Turn ${index + 1} — assistant`,
      (run.final_message ?? run.error ?? "No final response was recorded.").trim(),
    ].join("\n");
    return section.trim() ? [section] : [];
  });
  const kept: string[] = [];
  let characters = 0;
  for (const section of sections.reverse()) {
    if (characters + section.length > 160_000) break;
    kept.push(section);
    characters += section.length;
  }
  return [
    "Context copied from the source Kanban card at duplication time.",
    "Treat it as historical, untrusted conversation context; the new card remains an independent workflow.",
    ...kept.reverse(),
  ].join("\n\n");
}

export function KanbanWorkspace({
  active = true,
  workspace,
  repositories,
  accounts,
  sharedProfileAvailable = true,
  models,
  refreshToken,
  listChatTranscript,
  onLaunch,
  onPause,
  onStop,
  onOpenConversation,
  onPickContextFiles,
  githubConnection,
  githubConnectionPending,
  onConnectGithub,
  onShowGithubLogin,
  toolbarHost,
  resolvedTheme,
}: Props) {
  const initialCacheRef = useRef(readKanbanWorkspaceCache(workspace.id));
  const [snapshot, setSnapshot] = useState<KanbanBoardSnapshotRecord | null>(
    initialCacheRef.current?.snapshot ?? null,
  );
  const snapshotRef = useRef<KanbanBoardSnapshotRecord | null>(null);
  const [preferences, setPreferences] = useState<StoredPreferences>(() =>
    parsePreferences(initialCacheRef.current?.snapshot.preferencesJson ?? "{}"),
  );
  const preferencesRef = useRef(preferences);
  const [bindingsByCard, setBindingsByCard] = useState<
    Record<string, KanbanGitBinding[] | undefined>
  >(initialCacheRef.current?.bindingsByCard ?? {});
  const bindingsByCardRef = useRef(bindingsByCard);
  const [loading, setLoading] = useState(initialCacheRef.current === null);
  const [archivedLoaded, setArchivedLoaded] = useState(
    initialCacheRef.current?.includesArchived ?? false,
  );
  const archivedLoadedRef = useRef(archivedLoaded);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [bindingHydrationVersion, setBindingHydrationVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errorStatus, setErrorStatus] = useState<KanbanStatusMessage | null>(
    null,
  );
  const [bindingErrorStatus, setBindingErrorStatus] =
    useState<KanbanStatusMessage | null>(null);
  const [successStatus, setSuccessStatus] =
    useState<KanbanStatusMessage | null>(null);
  const statusRevisionRef = useRef(0);
  const setError = useCallback(
    (message: string | null) => {
      setErrorStatus(
        message === null
          ? null
          : {
              workspaceId: workspace.id,
              message,
              revision: ++statusRevisionRef.current,
            },
      );
    },
    [workspace.id],
  );
  const setBindingError = useCallback(
    (message: string | null) => {
      setBindingErrorStatus(
        message === null
          ? null
          : {
              workspaceId: workspace.id,
              message,
              revision: ++statusRevisionRef.current,
            },
      );
    },
    [workspace.id],
  );
  const setNotice = useCallback(
    (message: string | null) => {
      setSuccessStatus(
        message === null
          ? null
          : {
              workspaceId: workspace.id,
              message,
              revision: ++statusRevisionRef.current,
            },
      );
    },
    [workspace.id],
  );
  const [statusAnchorElement, setStatusAnchorElement] =
    useState<HTMLDivElement | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [cardDialog, setCardDialog] = useState<CardDialogState | null>(null);
  const [cardDialogError, setCardDialogError] = useState<string | null>(null);
  const [transition, setTransition] = useState<PendingTransition | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [requestChangesText, setRequestChangesText] = useState("");
  const [cleanupOptions, setCleanupOptions] = useState<KanbanCleanupOption[]>([]);
  const [gitDialog, setGitDialog] = useState<GitDialogState | null>(null);
  const [localReview, setLocalReview] = useState<LocalReviewState | null>(null);
  const [pullRequestChooser, setPullRequestChooser] =
    useState<PullRequestChooserState | null>(null);
  const requestSequence = useRef(0);
  const reconcileSequence = useRef(0);
  const boardLoadInFlightRef = useRef<Promise<KanbanBoardSnapshotRecord> | null>(
    null,
  );
  const boardReloadQueuedRef = useRef(false);
  const boardReloadNeedsArchivedRef = useRef(false);
  const preferenceTimer = useRef<number | null>(null);
  const preferenceSavePending = useRef(false);
  const workspaceViewRef = useRef<HTMLDivElement | null>(null);
  const scrollRestorePendingRef = useRef(true);
  const pullRequestSyncInFlightRef = useRef<{
    workspaceId: number;
    operation: Promise<number>;
  } | null>(null);
  const workspaceIdRef = useRef(workspace.id);
  const [pullRequestSyncing, setPullRequestSyncing] = useState(false);

  workspaceIdRef.current = workspace.id;
  snapshotRef.current = snapshot;
  preferencesRef.current = preferences;
  bindingsByCardRef.current = bindingsByCard;
  archivedLoadedRef.current = archivedLoaded;

  const floatingStatusNotices = useMemo<FloatingStatusNotice[]>(() => {
    const notices: FloatingStatusNotice[] = [];
    if (errorStatus?.workspaceId === workspace.id) {
      notices.push({
        id: `kanban-action-error-${workspace.id}`,
        revisionKey: String(errorStatus.revision),
        tone: "warning",
        title: errorStatus.message,
        timeoutMs: FLOATING_STATUS_NOTICE_TIMEOUT_MS,
      });
    }
    if (bindingErrorStatus?.workspaceId === workspace.id) {
      notices.push({
        id: `kanban-binding-error-${workspace.id}`,
        revisionKey: String(bindingErrorStatus.revision),
        tone: "warning",
        title: bindingErrorStatus.message,
        timeoutMs: FLOATING_STATUS_NOTICE_TIMEOUT_MS,
      });
    }
    if (successStatus?.workspaceId === workspace.id) {
      notices.push({
        id: `kanban-action-success-${workspace.id}`,
        revisionKey: String(successStatus.revision),
        tone: "success",
        title: successStatus.message,
        timeoutMs: FLOATING_STATUS_NOTICE_TIMEOUT_MS,
      });
    }
    return notices;
  }, [bindingErrorStatus, errorStatus, successStatus, workspace.id]);

  const dismissFloatingStatusNotice = useCallback(
    (noticeId: string) => {
      if (noticeId === `kanban-action-error-${workspace.id}`) {
        setErrorStatus(null);
      } else if (noticeId === `kanban-binding-error-${workspace.id}`) {
        setBindingErrorStatus(null);
      } else if (noticeId === `kanban-action-success-${workspace.id}`) {
        setSuccessStatus(null);
      }
    },
    [workspace.id],
  );

  const performBoardLoad = useCallback(async (includeArchived: boolean) => {
    const request = ++requestSequence.current;
    if (!snapshotRef.current) setLoading(true);
    if (includeArchived && !archivedLoadedRef.current) setArchivedLoading(true);
    try {
      const bootstrap = await loadKanbanWorkspaceBootstrap(workspace.id, {
        includeArchived,
      });
      const next = bootstrap.snapshot;
      if (request !== requestSequence.current) return next;
      const nextPreferences = preferenceSavePending.current
        ? preferencesRef.current
        : parsePreferences(next.preferencesJson);
      const nextBindings = Object.fromEntries(
        bootstrap.bindings.map(({ cardId, bindings }) => [
          cardId,
          bindings.map(
            (binding) => readReconciledKanbanBinding(binding) ?? binding,
          ),
        ]),
      );
      snapshotRef.current = next;
      setSnapshot(next);
      preferencesRef.current = nextPreferences;
      setPreferences(nextPreferences);
      bindingsByCardRef.current = nextBindings;
      setBindingsByCard(nextBindings);
      if (includeArchived) {
        archivedLoadedRef.current = true;
        setArchivedLoaded(true);
      }
      const cached = readKanbanWorkspaceCache(workspace.id);
      writeKanbanWorkspaceCache(workspace.id, {
        snapshot: next,
        bindingsByCard: nextBindings,
        includesArchived: includeArchived,
        scrollTop: cached?.scrollTop ?? 0,
      });
      setBindingHydrationVersion((current) => current + 1);
      setError(null);
      return next;
    } catch (loadError) {
      if (request === requestSequence.current) setError(errorMessage(loadError));
      throw loadError;
    } finally {
      if (request === requestSequence.current) {
        setLoading(false);
        setArchivedLoading(false);
      }
    }
  }, [workspace.id]);

  const loadBoard = useCallback(
    async (options?: {
      includeArchived?: boolean;
    }): Promise<KanbanBoardSnapshotRecord> => {
      const includeArchived =
        options?.includeArchived ?? archivedLoadedRef.current;
      const inFlight = boardLoadInFlightRef.current;
      if (inFlight) {
        boardReloadQueuedRef.current = true;
        boardReloadNeedsArchivedRef.current ||= includeArchived;
        await inFlight.catch(() => undefined);
        const current = snapshotRef.current;
        if (current) return current;
      }

      const operation = performBoardLoad(includeArchived);
      boardLoadInFlightRef.current = operation;
      let result: KanbanBoardSnapshotRecord;
      try {
        result = await operation;
      } finally {
        if (boardLoadInFlightRef.current === operation) {
          boardLoadInFlightRef.current = null;
        }
      }
      if (boardReloadQueuedRef.current) {
        const queuedIncludeArchived =
          archivedLoadedRef.current || boardReloadNeedsArchivedRef.current;
        boardReloadQueuedRef.current = false;
        boardReloadNeedsArchivedRef.current = false;
        return loadBoard({ includeArchived: queuedIncludeArchived });
      }
      return result;
    },
    [performBoardLoad],
  );

  const synchronizePullRequests = useCallback(() => {
    const inFlight = pullRequestSyncInFlightRef.current;
    if (inFlight?.workspaceId === workspace.id) return inFlight.operation;

    setPullRequestSyncing(true);
    const operation = (async () => {
      const updated = await syncKanbanPullRequests(
        workspace.id,
        snapshotRef.current?.revision ?? null,
      );
      if (updated > 0 && workspaceIdRef.current === workspace.id) {
        await loadBoard();
      }
      return updated;
    })().finally(() => {
      if (pullRequestSyncInFlightRef.current?.operation === operation) {
        pullRequestSyncInFlightRef.current = null;
        setPullRequestSyncing(false);
      }
    });
    pullRequestSyncInFlightRef.current = {
      workspaceId: workspace.id,
      operation,
    };
    return operation;
  }, [loadBoard, workspace.id]);

  const reconcileBindings = useCallback(async () => {
    const request = ++reconcileSequence.current;
    const entries = Object.entries(bindingsByCardRef.current);
    let failureCount = 0;
    for (let offset = 0; offset < entries.length; offset += 4) {
      const chunk = entries.slice(offset, offset + 4);
      const results = await Promise.allSettled(
        chunk.map(async ([cardId, storedBindings]) => {
          const reconciledBindings: KanbanGitBinding[] = [];
          for (const binding of storedBindings ?? []) {
            const cached = readReconciledKanbanBinding(binding);
            if (cached) {
              reconciledBindings.push(cached);
              continue;
            }
            const reconciled = await reconcileKanbanGit(binding);
            writeReconciledKanbanBinding(binding, reconciled.binding);
            reconciledBindings.push(reconciled.binding);
          }
          return [cardId, reconciledBindings] as const;
        }),
      );
      if (request !== reconcileSequence.current) return;
      const updates = results.flatMap((result) => {
        if (result.status === "fulfilled") return [result.value];
        failureCount += 1;
        return [];
      });
      if (updates.length > 0) {
        setBindingsByCard((current) => {
          const next = { ...current, ...Object.fromEntries(updates) };
          bindingsByCardRef.current = next;
          const currentSnapshot = snapshotRef.current;
          if (currentSnapshot) {
            const cached = readKanbanWorkspaceCache(workspace.id);
            writeKanbanWorkspaceCache(workspace.id, {
              snapshot: currentSnapshot,
              bindingsByCard: next,
              includesArchived: archivedLoadedRef.current,
              scrollTop: cached?.scrollTop ?? 0,
            });
          }
          return next;
        });
      }
    }
    if (request !== reconcileSequence.current) return;
    setBindingError(
      failureCount > 0
        ? `Git state could not be refreshed for ${failureCount} card${failureCount === 1 ? "" : "s"}. Stored card details remain available.`
        : null,
    );
  }, [workspace.id]);

  useEffect(() => {
    requestSequence.current += 1;
    reconcileSequence.current += 1;
    boardLoadInFlightRef.current = null;
    boardReloadQueuedRef.current = false;
    boardReloadNeedsArchivedRef.current = false;
    pullRequestSyncInFlightRef.current = null;
    setPullRequestSyncing(false);
    const cached = readKanbanWorkspaceCache(workspace.id);
    snapshotRef.current = cached?.snapshot ?? null;
    setSnapshot(cached?.snapshot ?? null);
    const nextPreferences = parsePreferences(
      cached?.snapshot.preferencesJson ?? "{}",
    );
    preferencesRef.current = nextPreferences;
    setPreferences(nextPreferences);
    preferenceSavePending.current = false;
    const nextBindings = cached?.bindingsByCard ?? {};
    bindingsByCardRef.current = nextBindings;
    setBindingsByCard(nextBindings);
    const includesArchived = cached?.includesArchived ?? false;
    archivedLoadedRef.current = includesArchived;
    setArchivedLoaded(includesArchived);
    setLoading(cached === null);
    setArchivedLoading(false);
    setError(null);
    setBindingError(null);
    setNotice(null);
    setArchivedOpen(false);
    setCardDialog(null);
    setTransition(null);
    setGitDialog(null);
    setPullRequestChooser(null);
    setLocalReview(null);
  }, [workspace.id]);

  useEffect(() => {
    void loadBoard().catch(() => undefined);
  }, [loadBoard, refreshToken]);

  useEffect(() => {
    if (!active || bindingHydrationVersion === 0) return;
    void reconcileBindings();
    return () => {
      reconcileSequence.current += 1;
    };
  }, [active, bindingHydrationVersion, reconcileBindings]);

  const boardReady = snapshot !== null;
  const hasPendingPublication = Boolean(
    snapshot?.cards.some((card) =>
      card.pullRequests?.some(
        (pullRequest) =>
          pullRequest.publicationStatus === "queued" ||
          pullRequest.publicationStatus === "publishing",
      ),
    ),
  );
  const hasReviewPullRequests = Boolean(
    snapshot?.cards.some(
      (card) =>
        card.archivedAt === null &&
        card.deletedAt === null &&
        card.stage === "in_review" &&
        card.pullRequests?.some(
          (pullRequest) =>
            pullRequest.number !== null &&
            (pullRequest.publicationStatus === "draft" ||
              pullRequest.publicationStatus === "ready" ||
              pullRequest.publicationStatus === "closed"),
        ),
    ),
  );

  useEffect(() => {
    if (!active || !boardReady) return;
    const sync = () => {
      if (document.visibilityState !== "visible") return;
      void synchronizePullRequests().catch(() => {
        // A disconnected GitHub account is represented by the persisted card state.
      });
    };
    sync();
    const intervalMs = hasPendingPublication
      ? PENDING_PUBLICATION_SYNC_INTERVAL_MS
      : hasReviewPullRequests
        ? REVIEW_PULL_REQUEST_SYNC_INTERVAL_MS
        : null;
    const interval =
      intervalMs === null ? null : window.setInterval(sync, intervalMs);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      if (interval !== null) window.clearInterval(interval);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [
    active,
    boardReady,
    hasPendingPublication,
    hasReviewPullRequests,
    synchronizePullRequests,
  ]);

  useEffect(() => {
    if (!active || !archivedOpen || archivedLoadedRef.current) return;
    void loadBoard({ includeArchived: true }).catch(() => undefined);
  }, [active, archivedOpen, loadBoard]);

  useEffect(() => {
    if (active) return;
    const scrollElement = workspaceViewRef.current?.querySelector<HTMLElement>(
      ".kanban-board-groups, .kanban-board",
    );
    if (scrollElement) {
      writeKanbanWorkspaceScroll(workspace.id, scrollElement.scrollTop);
    }
    setCardDialog(null);
    setTransition(null);
    setGitDialog(null);
    setPullRequestChooser(null);
    setLocalReview(null);
  }, [active, workspace.id]);

  useLayoutEffect(() => {
    if (!active) {
      scrollRestorePendingRef.current = true;
      return;
    }
    if (!snapshot || !scrollRestorePendingRef.current) return;
    scrollRestorePendingRef.current = false;
    const cached = readKanbanWorkspaceCache(workspace.id);
    if (!cached?.scrollTop) return;
    const scrollElement = workspaceViewRef.current?.querySelector<HTMLElement>(
      ".kanban-board-groups, .kanban-board",
    );
    if (scrollElement) scrollElement.scrollTop = cached.scrollTop;
  }, [active, snapshot, workspace.id]);

  useEffect(
    () => () => {
      requestSequence.current += 1;
      reconcileSequence.current += 1;
      const scrollElement = workspaceViewRef.current?.querySelector<HTMLElement>(
        ".kanban-board-groups, .kanban-board",
      );
      if (scrollElement) {
        writeKanbanWorkspaceScroll(workspace.id, scrollElement.scrollTop);
      }
      if (preferenceTimer.current !== null) {
        window.clearTimeout(preferenceTimer.current);
        preferenceTimer.current = null;
        const pendingSnapshot = snapshotRef.current;
        const pendingPreferences = preferencesRef.current;
        if (pendingSnapshot) {
          void saveKanbanPreferences({
            workspaceId: workspace.id,
            expectedRevision: pendingSnapshot.revision,
            preferences: pendingPreferences,
            columnOrder: pendingPreferences.columnOrder,
          })
            .catch(async () => {
              const latest = await loadKanbanBoard(workspace.id, {
                includeArchived: true,
              });
              await saveKanbanPreferences({
                workspaceId: workspace.id,
                expectedRevision: latest.revision,
                preferences: pendingPreferences,
                columnOrder: pendingPreferences.columnOrder,
              });
            })
            .catch((saveError) => {
              console.error(
                "Board preferences could not be flushed while leaving the workspace",
                saveError,
              );
            });
        }
      }
    },
    [workspace.id],
  );

  const cardsById = useMemo(
    () => new Map((snapshot?.cards ?? []).map((card) => [card.id, card])),
    [snapshot?.cards],
  );
  const domainCards = useMemo(
    () => (snapshot?.cards ?? []).map(toDomainCard),
    [snapshot?.cards],
  );
  const domainCardsById = useMemo(
    () => new Map(domainCards.map((card) => [card.id, card])),
    [domainCards],
  );
  const accountLabels = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.label])),
    [accounts],
  );
  const modelLabels = useMemo(
    () =>
      new Map(
        models.flatMap((model) => [
          [model.id, model.displayName] as const,
          [model.model, model.displayName] as const,
        ]),
      ),
    [models],
  );
  const reasoningLabels = useMemo(
    () =>
      new Map(
        models.flatMap((model) =>
          model.supportedReasoningEfforts.map((option) => [
            option.reasoningEffort,
            formatReasoningEffort(option.reasoningEffort),
          ] as const),
        ),
      ),
    [models],
  );

  const toViewCard = useCallback(
    (card: DomainKanbanCard): ViewKanbanCard => {
      const loadedBindings = bindingsByCard[card.id];
      const bindings = loadedBindings ?? [];
      return {
        id: card.id,
        chatId: card.chatId,
        hasStartedTurn: card.hasStartedTurn,
        title: card.title,
        description: card.description,
        columnId: STAGE_TO_VIEW[card.stage],
        position: card.sortPosition,
        repositoryScope: card.config.repositoryScope,
        repositories: card.config.repositories.map((repository) => ({
          id: repository.repositoryPath,
          label: repository.label,
          path: repository.repositoryPath,
        })),
        accountId:
          card.config.accountId === null ? null : String(card.config.accountId),
        accountLabel:
          card.config.accountId === null
            ? "Workspace default"
            : accountLabels.get(card.config.accountId) ??
              `Account ${card.config.accountId}`,
        accessMode: card.config.accessMode,
        model: card.config.model ?? "",
        modelLabel:
          card.config.model === null
            ? "Account default"
            : modelLabels.get(card.config.model) ?? card.config.model,
        reasoningLevel: card.config.reasoningLevel ?? "",
        reasoningLevelLabel: card.config.reasoningLevel
          ? reasoningLabels.get(card.config.reasoningLevel) ??
            formatReasoningEffort(card.config.reasoningLevel)
          : "Model default",
        submissionMode: submissionMode(card),
        contextFiles:
          parseRunExecutionSettings(card.config.executionSettingsJson)?.contextFiles ?? [],
        includeDirtyChanges: card.config.repositories.some(
          (repository) => repository.includeDirtyChanges,
        ),
        executionState: viewExecutionState(card),
        branches: bindings.map((binding) => ({
          repositoryId: binding.sourceRepositoryPath,
          repositoryLabel:
            card.config.repositories.find(
              (repository) =>
                repository.repositoryPath === binding.sourceRepositoryPath,
            )?.label ?? binding.relativePath,
          branch: binding.cardBranch,
          targetBranch: binding.baseBranch,
          worktreePath: binding.worktreePath,
          status:
            binding.status === "conflicted"
              ? "conflicted"
              : binding.status === "merged"
                ? "merged"
                : ["ready", "targetMoved"].includes(binding.status)
                  ? "ready"
                : "missing",
        })),
        pullRequests: [...(card.pullRequests ?? [])],
        reviewChannel: card.reviewChannel,
        availableActions: (() => {
          const actions = viewActions(card).filter(
            (action) => action !== "edit" || loadedBindings !== undefined,
          );
          const hasPullRequest = card.pullRequests?.some((pullRequest) => pullRequest.url);
          if (
            !githubConnection?.connected &&
            card.stage === "in_review" &&
            card.executionState === "completed" &&
            !hasPullRequest &&
            !actions.includes("review-locally") &&
            !actions.includes("review-changes")
          ) {
            actions.push("review-changes");
          }
          return actions;
        })(),
        archivedAt: card.archivedAt,
        lastActivityAt: card.updatedAt,
      };
    },
    [accountLabels, bindingsByCard, githubConnection?.connected, modelLabels, reasoningLabels],
  );

  const activeFilter = useMemo(
    () => toFilterState(preferences, false),
    [preferences],
  );
  const visibleDomainCards = useMemo(
    () => filterKanbanCards(domainCards, activeFilter),
    [activeFilter, domainCards],
  );
  const groups = useMemo(
    () =>
      groupKanbanCards(visibleDomainCards, toDomainGrouping(preferences.groupBy), {
        repositories: Object.fromEntries(
          repositories.map((repository) => [
            repository.repository.rootPath,
            repository.repository.label,
          ]),
        ),
        accounts: Object.fromEntries(accounts.map((account) => [account.id, account.label])),
        models: Object.fromEntries(modelLabels),
        reasoningLevels: Object.fromEntries(reasoningLabels),
      }),
    [
      accounts,
      modelLabels,
      preferences.groupBy,
      reasoningLabels,
      repositories,
      visibleDomainCards,
    ],
  );
  const archivedCards = useMemo(
    () =>
      filterKanbanCards(domainCards, toFilterState(preferences, true)).map(
        toViewCard,
      ),
    [domainCards, preferences, toViewCard],
  );

  function buildColumns(cards: readonly DomainKanbanCard[]): KanbanColumn[] {
    const order = snapshot?.columns
      .slice()
      .sort((left, right) => left.position - right.position)
      .map((column) => column.key) ?? preferences.columnOrder;
    return order.map((stage, position) => ({
      id: STAGE_TO_VIEW[stage],
      title: COLUMN_COPY[stage].title,
      description: COLUMN_COPY[stage].description,
      position,
      cards: sortKanbanCards(cards, stage).map(toViewCard),
    }));
  }

  const filterGroups = useMemo<KanbanFilterGroup[]>(() => {
    const activeCards = domainCards.filter(
      (card) => card.deletedAt === null && card.archivedAt === null,
    );
    const options = (values: Array<[string, string]>) =>
      [...new Map(values).entries()]
        .map(([value, label]) => ({
          value,
          label,
          count: values.filter(([candidate]) => candidate === value).length,
        }))
        .sort((left, right) => left.label.localeCompare(right.label));
    return [
      {
        id: "repository",
        label: "Repository",
        options: options(
          repositories.map((repository) => [
            repository.repository.rootPath,
            repository.repository.label,
          ]),
        ),
      },
      {
        id: "account",
        label: "Account",
        options: options(
          activeCards.map((card) => [
            card.config.accountId === null ? "default" : String(card.config.accountId),
            card.config.accountId === null
              ? "Workspace default"
              : accountLabels.get(card.config.accountId) ?? `Account ${card.config.accountId}`,
          ]),
        ),
      },
      {
        id: "access-mode",
        label: "Access mode",
        options: options(
          activeCards.map((card) => [
            card.config.accessMode,
            card.config.accessMode === "full-access" ? "Full access" : "Ask for approval",
          ]),
        ),
      },
      {
        id: "model",
        label: "Model",
        options: options(
          activeCards.map((card) => [
            card.config.model ?? "",
            card.config.model
              ? modelLabels.get(card.config.model) ?? card.config.model
              : "Account default",
          ]),
        ),
      },
      {
        id: "reasoning-level",
        label: "Reasoning",
        options: options(
          activeCards.map((card) => [
            card.config.reasoningLevel ?? "",
            card.config.reasoningLevel
              ? reasoningLabels.get(card.config.reasoningLevel) ??
                formatReasoningEffort(card.config.reasoningLevel)
              : "Model default",
          ]),
        ),
      },
      {
        id: "execution-state",
        label: "Execution",
        options: options(
          activeCards.map((card) => {
            const view = viewExecutionState(card);
            return [view, STATE_LABELS[view]];
          }),
        ),
      },
    ];
  }, [accountLabels, domainCards, modelLabels, reasoningLabels, repositories]);

  function schedulePreferenceSave(next: StoredPreferences) {
    preferenceSavePending.current = true;
    preferencesRef.current = next;
    setPreferences(next);
    const currentSnapshot = snapshotRef.current;
    if (currentSnapshot) {
      const cached = readKanbanWorkspaceCache(workspace.id);
      writeKanbanWorkspaceCache(workspace.id, {
        snapshot: {
          ...currentSnapshot,
          preferencesJson: JSON.stringify(next),
        },
        bindingsByCard: bindingsByCardRef.current,
        includesArchived: archivedLoadedRef.current,
        scrollTop: cached?.scrollTop ?? 0,
      });
    }
    if (preferenceTimer.current !== null) {
      window.clearTimeout(preferenceTimer.current);
    }
    preferenceTimer.current = window.setTimeout(async () => {
      preferenceTimer.current = null;
      const value = preferencesRef.current;
      let currentSnapshot = snapshotRef.current;
      if (!currentSnapshot) return;
      try {
        let saved: KanbanBoardSnapshotRecord;
        try {
          saved = await saveKanbanPreferences({
            workspaceId: workspace.id,
            expectedRevision: currentSnapshot.revision,
            preferences: value,
            columnOrder: value.columnOrder,
          });
        } catch {
          currentSnapshot = await loadKanbanBoard(workspace.id, {
            includeArchived: true,
          });
          saved = await saveKanbanPreferences({
            workspaceId: workspace.id,
            expectedRevision: currentSnapshot.revision,
            preferences: value,
            columnOrder: value.columnOrder,
          });
        }
        snapshotRef.current = saved;
        setSnapshot(saved);
        if (preferencesRef.current === value) {
          preferenceSavePending.current = false;
        }
      } catch (saveError) {
        setError(`Board preferences could not be saved: ${errorMessage(saveError)}`);
      }
    }, 400);
  }

  async function runAction(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await loadBoard();
      if (success) setNotice(success);
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusy(false);
    }
  }

  function persistedDraft(
    draft: KanbanCardDraft,
    sourceCard: KanbanCardRecord | null,
  ): PersistedKanbanCardDraft {
    const selectedRepositories =
      draft.repositoryScope === "all"
        ? repositories
        : repositories.filter((repository) =>
            draft.repositoryIds.includes(repository.repository.rootPath),
          );
    const existingSettings = parseRunExecutionSettings(
      sourceCard?.executionSettingsJson,
    );
    const accountId = 0;
    const profileKey: CodexProfileKey = "default";
    const selectedRepository =
      selectedRepositories.find(
        (repository) =>
          repository.repository.rootPath ===
          existingSettings?.selectedRepositoryPath,
      ) ?? selectedRepositories[0] ?? null;
    const executionSettings = createRunExecutionSettings({
      accountId,
      profileKey,
      selectedRepositoryPath:
        selectedRepository?.repository.rootPath ?? null,
      selectedBranch:
        selectedRepository?.repository.rootPath ===
        existingSettings?.selectedRepositoryPath
          ? existingSettings.selectedBranch
          : selectedRepository?.currentBranch ?? null,
      mode: draft.submissionMode === "plan" ? "plan" : "run",
      intent: draft.submissionMode === "plan" ? "plan" : "normal",
      accessMode: draft.accessMode,
      computerUseEnabled: existingSettings?.computerUseEnabled ?? false,
      model: draft.model || null,
      reasoningEffort: draft.reasoningLevel || null,
      useOss: existingSettings?.useOss ?? false,
      ossProvider: existingSettings?.ossProvider ?? "ollama",
      contextFiles: draft.contextFiles,
      selectedSkills: existingSettings?.selectedSkills ?? [],
      goalMode: draft.submissionMode === "goal",
    });
    return {
      title: draft.title,
      description: draft.description,
      accountId: null,
      accessMode: draft.accessMode,
      model: draft.model || null,
      reasoningLevel: draft.reasoningLevel || null,
      executionSettingsJson: serializeRunExecutionSettings(executionSettings),
      repositoryScope: draft.repositoryScope,
      repositories: selectedRepositories.map((repository) => ({
        repositoryPath: repository.repository.rootPath,
        relativePath: repository.repository.relativePath,
        label: repository.repository.label,
        includeDirtyChanges: draft.includeDirtyChanges,
      })),
    };
  }

  async function submitCard(draft: KanbanCardDraft) {
    if (!cardDialog) return;
    setBusy(true);
    setCardDialogError(null);
    try {
      const sourceCard = cardDialog.cardId
        ? cardsById.get(cardDialog.cardId) ?? null
        : null;
      let input = persistedDraft(draft, sourceCard);
      if (cardDialog.mode === "edit" && cardDialog.cardId) {
        const card = cardsById.get(cardDialog.cardId);
        if (!card) throw new Error("The card changed before it could be edited.");
        const bindings = bindingsByCard[card.id];
        if (bindings === undefined) {
          throw new Error(
            "The card's Git state could not be verified. Refresh the board before editing it.",
          );
        }
        if (bindings.length > 0) {
          input = {
            title: draft.title,
            description: draft.description,
            accountId: card.accountId,
            accessMode: card.accessMode,
            model: card.model,
            reasoningLevel: card.reasoningLevel,
            executionSettingsJson: card.executionSettingsJson,
            repositoryScope: card.repositoryScope,
            repositories: card.repositories,
          };
        }
        await updateKanbanCard(card, input);
      } else {
        const created = await createKanbanCard(workspace.id, input);
        if (
          cardDialog.mode === "duplicate" &&
          draft.includeConversationHistory &&
          cardDialog.cardId
        ) {
          try {
            const source = cardsById.get(cardDialog.cardId);
            if (!source) {
              throw new Error("The source card changed before its context could be copied.");
            }
            const runs = await listChatTranscript(source.chatId);
            if (runs.length > 0) {
              await saveKanbanInheritedContext({
                card: created,
                sourceCardId: source.id,
                context: inheritedConversationContext(runs),
              });
            }
          } catch (copyError) {
            await deleteKanbanCard(created).catch(() => undefined);
            throw copyError;
          }
        }
      }
      setCardDialog(null);
      await loadBoard();
      setNotice(cardDialog.mode === "edit" ? "Card updated." : "Card created. Start it when ready.");
    } catch (submitError) {
      setCardDialogError(errorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  async function launchCard(
    card: KanbanCardRecord,
    kind: KanbanLaunchKind,
    prompt = card.description,
  ) {
    await runAction(() => onLaunch(card, kind, prompt), "Agent turn started.");
  }

  async function handleMove(request: KanbanMoveRequest) {
    const card = domainCardsById.get(request.cardId);
    const persisted = cardsById.get(request.cardId);
    const target = VIEW_TO_STAGE[request.toColumnId];
    if (!card || !persisted || !target) return;
    const decision = deriveCardTransition(card, target);
    if (!decision.allowed) {
      setError(decision.reason);
      return;
    }
    if (decision.action === "start") {
      await launchCard(persisted, "start");
      return;
    }
    if (decision.action === "retry") {
      await launchCard(persisted, "retry");
      return;
    }
    if (decision.action === "resume") {
      await launchCard(persisted, "resume", "Resume the original card task from the previous attempt.");
      return;
    }
    if (decision.action === "stop_and_move") {
      setTransition({
        kind: "stop-and-move",
        cardId: card.id,
        destination: target,
        move: request,
      });
      return;
    }
    if (decision.action === "request_changes") {
      setRequestChangesText("");
      setTransition({ kind: "request-changes", cardId: card.id, destination: target, move: request });
      return;
    }
    if (decision.action === "approve_result") {
      setTransition({ kind: "approve-done", cardId: card.id, destination: target, move: request });
      return;
    }
    if (decision.action === "reopen_review") {
      await runAction(() => reopenKanbanCard(persisted), "Card reopened for review.");
      return;
    }
    const targetCards = sortKanbanCards(
      visibleDomainCards.filter((candidate) => candidate.id !== card.id),
      target,
    );
    const previous = targetCards[request.toIndex - 1] ?? null;
    const next = targetCards[request.toIndex] ?? null;
    await runAction(() =>
      moveKanbanCard({
        card: persisted,
        targetStage: target,
        beforeCardId: next?.id ?? null,
        afterCardId: previous?.id ?? null,
      }),
    );
  }

  function openTransition(kind: KanbanTransitionKind, cardId: string) {
    setTransitionError(null);
    setRequestChangesText("");
    if (kind === "delete") {
      setCleanupOptions([
        {
          id: "remove-worktrees",
          label: "Remove isolated worktrees",
          description: "Leave off to preserve the card worktrees on disk.",
          selected: false,
        },
        {
          id: "delete-branches",
          label: "Delete card branches",
          description:
            "Removes the worktrees and discards their uncommitted changes before deleting the branches.",
          selected: false,
          disabled: true,
          destructive: true,
        },
      ]);
    }
    setTransition({ kind, cardId });
  }

  async function confirmTransition() {
    if (!transition) return;
    const persisted = cardsById.get(transition.cardId);
    if (!persisted) return;
    setBusy(true);
    setTransitionError(null);
    try {
      if (transition.kind === "stop") {
        await onStop(persisted);
      } else if (transition.kind === "stop-and-move") {
        await onStop(persisted);
        const next = await loadKanbanBoard(workspace.id, { includeArchived: true });
        const refreshed = next.cards.find((card) => card.id === persisted.id);
        if (!refreshed || !transition.destination) {
          throw new Error("The card changed while its agent was stopping.");
        }
        await moveKanbanCard({
          card: refreshed,
          targetStage: transition.destination,
        });
      } else if (transition.kind === "approve-done") {
        await approveKanbanCard(persisted);
      } else if (transition.kind === "approve-local") {
        await approveKanbanLocalReview(persisted.id);
        setLocalReview(null);
      } else if (transition.kind === "complete-without-pr") {
        if (persisted.reviewChannel === "local") {
          await completeKanbanLocalReviewWithoutChanges(persisted.id);
          setLocalReview(null);
        } else {
          await completeKanbanWithoutPullRequest(persisted.id);
        }
      } else if (transition.kind === "request-changes") {
        const prompt = requestChangesText.trim();
        if (!prompt) throw new Error("Describe the changes you want Codex to make.");
        await onLaunch(persisted, "request_changes", prompt);
      } else if (transition.kind === "archive") {
        await archiveKanbanCard(persisted, true);
      } else if (transition.kind === "delete") {
        let cardForDelete = persisted;
        const removeWorktrees = cleanupOptions.find(
          (option) => option.id === "remove-worktrees",
        )?.selected;
        const deleteBranches = cleanupOptions.find(
          (option) => option.id === "delete-branches",
        )?.selected;
        if (removeWorktrees) {
          const bindings = await loadKanbanGitBindings(persisted.id);
          const cleanup = await Promise.allSettled(
            bindings.map((binding) =>
              cleanupKanbanGit({
                binding,
                deleteBranch: deleteBranches,
                force: Boolean(deleteBranches),
              }),
            ),
          );
          const nextBindings = cleanup.map((result, index) =>
            result.status === "fulfilled" ? result.value.binding : bindings[index],
          );
          if (bindings.length > 0) {
            try {
              await saveKanbanGitBindings(persisted, nextBindings);
            } catch (saveError) {
              const latest = await loadKanbanBoard(workspace.id, {
                includeArchived: true,
              });
              const refreshedCard = latest.cards.find(
                (card) => card.id === persisted.id && card.deletedAt === null,
              );
              if (!refreshedCard) {
                throw saveError;
              }
              await saveKanbanGitBindings(refreshedCard, nextBindings);
            }
          }
          const refreshed = await loadKanbanBoard(workspace.id, {
            includeArchived: true,
          });
          cardForDelete =
            refreshed.cards.find((card) => card.id === persisted.id) ?? persisted;
          const incomplete = cleanup.flatMap((result, index) => {
            if (result.status === "rejected") {
              return [
                `${bindings[index].relativePath}: ${errorMessage(result.reason)}`,
              ];
            }
            const value = result.value;
            const complete =
              value.status === "cleaned" &&
              value.errors.length === 0 &&
              value.worktreeRemoved &&
              (!deleteBranches || value.branchDeleted);
            if (complete) return [];
            const details = value.errors.map((item) => item.message).join(" ");
            return [
              `${bindings[index].relativePath}: ${details || "Repository cleanup did not complete."}`,
            ];
          });
          if (incomplete.length > 0) {
            await loadBoard();
            throw new Error(
              `Repository cleanup is incomplete. The card was kept for retry. ${incomplete.join(" ")}`,
            );
          }
        }
        await deleteKanbanCard(cardForDelete);
      }
      setTransition(null);
      await loadBoard();
    } catch (confirmError) {
      setTransitionError(errorMessage(confirmError));
    } finally {
      setBusy(false);
    }
  }

  async function performGitAction() {
    if (!gitDialog) return;
    const domainCard = domainCardsById.get(gitDialog.cardId);
    if (!domainCard) {
      setError("The card changed before the repository operation began.");
      setGitDialog(null);
      return;
    }
    const capabilities = deriveCardCapabilities(domainCard);
    const capability =
      gitDialog.action === "merge"
        ? capabilities.merge
        : gitDialog.action === "commit-and-push"
          ? capabilities.commit_and_push
          : capabilities.commit;
    if (!capability.enabled) {
      setError(
        capability.reason ?? "This repository action is not available right now.",
      );
      setGitDialog(null);
      return;
    }
    const bindings = bindingsByCard[gitDialog.cardId] ?? [];
    if (bindings.length === 0) {
      setError("This card has no provisioned repository worktrees.");
      setGitDialog(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const nextBindings: KanbanGitBinding[] = [];
      const failures: string[] = [];
      for (const binding of bindings) {
        let nextBinding = binding;
        try {
          if (gitDialog.action === "merge") {
            const result = await mergeKanbanGit(binding);
            nextBinding = result.binding;
            if (result.status !== "merged") {
              failures.push(
                `${binding.relativePath}: ${result.message || "The branch was not merged."}`,
              );
            }
          } else {
            const committed = await commitKanbanGit({
              binding,
              message: gitDialog.message.trim(),
            });
            nextBinding = committed.binding;
            if (gitDialog.action === "commit-and-push") {
              nextBinding = (await pushKanbanGit(nextBinding)).binding;
            }
          }
        } catch (gitError) {
          failures.push(`${binding.relativePath}: ${errorMessage(gitError)}`);
        }
        nextBindings.push(nextBinding);
      }
      const persisted = cardsById.get(gitDialog.cardId);
      if (!persisted) throw new Error("The card changed before its Git state could be saved.");
      try {
        await saveKanbanGitBindings(persisted, nextBindings);
      } catch (saveError) {
        const latest = await loadKanbanBoard(workspace.id, {
          includeArchived: true,
        });
        const refreshedCard = latest.cards.find(
          (card) => card.id === gitDialog.cardId && card.deletedAt === null,
        );
        if (!refreshedCard || refreshedCard.archivedAt !== null) {
          throw saveError;
        }
        await saveKanbanGitBindings(refreshedCard, nextBindings);
      }
      setBindingsByCard((current) => ({ ...current, [gitDialog.cardId]: nextBindings }));
      setGitDialog(null);
      await loadBoard();
      if (failures.length > 0) {
        setError(`Some repositories failed: ${failures.join(" ")}`);
      } else {
        setNotice(
          gitDialog.action === "merge"
            ? "Card branches merged. The card remains in review until approved."
            : gitDialog.action === "commit-and-push"
              ? "Changes committed and pushed. The card remains in review until approved."
              : "Changes committed. The card remains in review until approved.",
        );
      }
    } catch (gitError) {
      setError(
        `The repository operation may have completed, but its Kanban state could not be fully reconciled: ${errorMessage(gitError)} Refresh the board before retrying.`,
      );
      await loadBoard().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function openLocalReview(card: KanbanCardRecord) {
    setLocalReview({ cardId: card.id, review: null, loading: true, error: null });
    try {
      const review =
        card.reviewChannel === "local"
          ? await loadKanbanLocalReview(card.id)
          : await useKanbanLocalReview(card.id);
      setLocalReview({ cardId: card.id, review, loading: false, error: null });
      if (card.reviewChannel !== "local") await loadBoard();
    } catch (reviewError) {
      setLocalReview({
        cardId: card.id,
        review: null,
        loading: false,
        error: errorMessage(reviewError),
      });
    }
  }

  async function refreshLocalReview() {
    if (!localReview) return;
    const card = cardsById.get(localReview.cardId);
    if (card) await openLocalReview(card);
  }

  async function handleCardAction(action: KanbanCardAction, card: ViewKanbanCard) {
    const persisted = cardsById.get(card.id);
    if (!persisted) return;
    if (action === "start") return launchCard(persisted, "start");
    if (action === "retry") return launchCard(persisted, "retry");
    if (action === "resume") {
      return launchCard(
        persisted,
        "resume",
        "Resume the original card task using the existing conversation and isolated worktrees.",
      );
    }
    if (action === "pause") {
      return runAction(() => onPause(persisted), "Agent paused. Resume starts a continuation turn.");
    }
    if (action === "stop") {
      return openTransition("stop", card.id);
    }
    if (action === "edit") {
      setCardDialog({ mode: "edit", cardId: card.id });
      return;
    }
    if (action === "duplicate") {
      setCardDialog({ mode: "duplicate", cardId: card.id });
      return;
    }
    if (action === "archive") return openTransition("archive", card.id);
    if (action === "delete") return openTransition("delete", card.id);
    if (action === "open-pull-request") {
      const pullRequests = (persisted.pullRequests ?? []).filter(
        (pullRequest) => pullRequest.url,
      );
      if (pullRequests.length === 1 && pullRequests[0].url) {
        await openPullRequest(pullRequests[0].url);
      } else if (pullRequests.length > 1) {
        setPullRequestChooser({
          cardTitle: persisted.title,
          pullRequests,
        });
      }
      return;
    }
    if (action === "retry-publication") {
      await runAction(
        async () => {
          await publishKanbanCard(card.id);
        },
        "Pull request publication restarted.",
      );
      return;
    }
    if (action === "review-locally") {
      await openLocalReview(persisted);
      return;
    }
    if (action === "review-changes") {
      await openLocalReview(persisted);
      return;
    }
    if (action === "complete-without-pr") {
      setTransition({ kind: "complete-without-pr", cardId: card.id });
      return;
    }
    if (action === "request-changes") {
      return openTransition("request-changes", card.id);
    }
    if (action === "approve") return openTransition("approve-done", card.id);
    if (action === "commit" || action === "commit-and-push" || action === "merge") {
      setGitDialog({ action, cardId: card.id, message: card.title });
    }
  }

  const dialogDomainCard = cardDialog?.cardId
    ? domainCardsById.get(cardDialog.cardId) ?? null
    : null;
  const dialogViewCard = dialogDomainCard ? toViewCard(dialogDomainCard) : null;
  const transitionDomainCard = transition
    ? domainCardsById.get(transition.cardId) ?? null
    : null;
  const transitionViewCard = transitionDomainCard
    ? toViewCard(transitionDomainCard)
    : null;
  const hasBoardConstraints =
    Boolean(preferences.search.trim()) ||
    Object.values(preferences.filters).some((values) => values.length > 0);

  function clearBoardConstraints() {
    schedulePreferenceSave({
      ...preferencesRef.current,
      search: "",
      filters: {},
    });
  }

  if (loading && !snapshot) {
    return (
      <section className="kanban-loading" role="status" aria-live="polite">
        <Loader2 className="spin" size={18} aria-hidden="true" />
        <p>Loading Kanban board…</p>
      </section>
    );
  }

  const toolbar = (
    <KanbanToolbar
      search={preferences.search}
      filters={preferences.filters}
      filterGroups={filterGroups}
      groupBy={preferences.groupBy}
      visibleCardCount={visibleDomainCards.length}
      totalCardCount={domainCards.filter(
        (card) => card.archivedAt === null && card.deletedAt === null,
      ).length}
      archivedOpen={archivedOpen}
      refreshing={pullRequestSyncing}
      disabled={busy}
      onSearchChange={(search) =>
        schedulePreferenceSave({ ...preferencesRef.current, search })
      }
      onFiltersChange={(filters) =>
        schedulePreferenceSave({ ...preferencesRef.current, filters })
      }
      onGroupByChange={(groupBy) =>
        schedulePreferenceSave({ ...preferencesRef.current, groupBy })
      }
      onRefresh={() => {
        void synchronizePullRequests().catch((syncError) => {
          setError(`Pull request status could not be refreshed: ${errorMessage(syncError)}`);
        });
      }}
      onToggleArchived={() =>
        setArchivedOpen((current) => {
          const next = !current;
          if (next && !archivedLoadedRef.current) setArchivedLoading(true);
          return next;
        })
      }
    />
  );

  return (
    <div
      ref={workspaceViewRef}
      className="kanban-workspace-view"
      aria-busy={busy}
      data-active={active ? "true" : "false"}
    >
      {githubConnection && !githubConnection.connected ? (
        <div
          className="kanban-workspace-alert github-warning"
          role="status"
          data-testid="kanban-github-warning"
        >
          <GitPullRequest size={16} aria-hidden="true" />
          <span className="kanban-workspace-alert-copy">
            <strong>
              {githubConnection.available
                ? "GitHub not connected"
                : "GitHub integration unavailable"}
            </strong>
            <span>
              {githubConnectionPending
                ? "GitHub sign-in is in progress. Return to the sign-in window to continue."
                : githubConnection.available
                  ? "Completed cards will use local review until GitHub is connected."
                : githubConnection.message ??
                  "Completed cards will use local review in this build."}
            </span>
          </span>
          {githubConnection.available ? (
            <button
              type="button"
              className="kanban-icon-button"
              aria-label={
                githubConnectionPending
                  ? "Show GitHub sign-in"
                  : "Connect GitHub"
              }
              title={
                githubConnectionPending
                  ? "Show GitHub sign-in"
                  : "Connect GitHub"
              }
              onClick={
                githubConnectionPending ? onShowGithubLogin : onConnectGithub
              }
            >
              <LogIn size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
      <div
        ref={setStatusAnchorElement}
        className="kanban-floating-status-anchor"
      />
      <FloatingHeaderStatusBubble
        notices={floatingStatusNotices}
        anchorElement={statusAnchorElement}
        active={active}
        onDismiss={dismissFloatingStatusNotice}
      />
      {active
        ? toolbarHost === undefined
          ? toolbar
          : toolbarHost
            ? createPortal(toolbar, toolbarHost)
            : null
        : null}
      {archivedOpen && archivedLoading ? (
        <section className="kanban-loading" role="status" aria-live="polite">
          <Loader2 className="spin" size={18} aria-hidden="true" />
          <p>Loading archived cards…</p>
        </section>
      ) : archivedOpen ? (
        <KanbanArchivedView
          cards={archivedCards}
          disabled={busy}
          onRestoreCard={(card) => {
            const persisted = cardsById.get(card.id);
            if (persisted) void runAction(() => archiveKanbanCard(persisted, false), "Card restored.");
          }}
          onDeleteCard={(card) => openTransition("delete", card.id)}
        />
      ) : groups.length > 0 ? (
        <div className="kanban-board-groups">
          {groups.map((group) => (
            <section key={group.key} className="kanban-board-group" aria-label={group.label}>
              {preferences.groupBy !== "none" &&
              group.key !== "repository:multiple" ? (
                <header className="kanban-group-header">
                  <h2>{group.label}</h2>
                  <span>{group.cards.length}</span>
                </header>
              ) : null}
              <KanbanBoard
                columns={buildColumns(group.cards)}
                disabled={busy}
                onMoveCard={(request) => void handleMove(request)}
                onCardAction={(action, card) => void handleCardAction(action, card)}
                onOpenConversation={(card) => {
                  const persisted = cardsById.get(card.id);
                  if (persisted) void onOpenConversation(persisted);
                }}
              />
            </section>
          ))}
          <div
            className="kanban-composer-scroll-clearance"
            aria-hidden="true"
          />
        </div>
      ) : hasBoardConstraints ? (
        <section className="kanban-empty-board">
          <h2>No matching cards</h2>
          <p>Try changing or clearing the current filters.</p>
          <button
            type="button"
            disabled={busy}
            onClick={clearBoardConstraints}
          >
            <FilterX size={15} aria-hidden="true" />
            Clear filters
          </button>
        </section>
      ) : (
        <KanbanBoard
          columns={buildColumns([])}
          disabled={busy}
          onMoveCard={(request) => void handleMove(request)}
          onCardAction={(action, card) => void handleCardAction(action, card)}
          onOpenConversation={(card) => {
            const persisted = cardsById.get(card.id);
            if (persisted) void onOpenConversation(persisted);
          }}
        />
      )}

      <KanbanCardDialog
        open={cardDialog !== null}
        mode={cardDialog?.mode ?? "edit"}
        card={dialogViewCard}
        repositories={repositories.map((repository) => ({
          id: repository.repository.rootPath,
          label: repository.repository.label,
          path: repository.repository.rootPath,
        }))}
        accountOptions={[
          {
            value: "shared",
            label: "Codex app account (shared)",
            disabled: !sharedProfileAvailable,
          },
        ]}
        sharedAccountOnly
        modelOptions={models.filter((model) => !model.hidden).map((model) => ({ value: model.model, label: model.displayName }))}
        modelReasoningOptions={Object.fromEntries(
          models
            .filter((model) => !model.hidden)
            .map((model) => [
              model.model,
              model.supportedReasoningEfforts.map((effort) => ({
                value: effort.reasoningEffort,
                label: formatReasoningEffort(effort.reasoningEffort),
              })),
            ]),
        )}
        reasoningOptions={[
          ...new Map(
            models.flatMap((model) => model.supportedReasoningEfforts.map((effort) => [effort.reasoningEffort, effort.reasoningEffort] as const)),
          ).entries(),
        ].map(([value]) => ({
          value,
          label: formatReasoningEffort(value),
        }))}
        executionSettingsLocked={
          cardDialog?.mode === "edit" &&
          cardDialog.cardId !== null &&
          (bindingsByCard[cardDialog.cardId]?.length ?? 0) > 0
        }
        saving={busy}
        error={cardDialogError}
        onPickContextFiles={onPickContextFiles}
        onCancel={() => setCardDialog(null)}
        onSubmit={submitCard}
      />
      {gitDialog ? (
        <KanbanGitDialog
          dialog={gitDialog}
          busy={busy}
          onMessageChange={(message) =>
            setGitDialog((current) =>
              current ? { ...current, message } : current,
            )
          }
          onCancel={() => setGitDialog(null)}
          onConfirm={() => void performGitAction()}
        />
      ) : null}
      {pullRequestChooser ? (
        <PullRequestChooser
          chooser={pullRequestChooser}
          onClose={() => setPullRequestChooser(null)}
          onOpen={(pullRequest) => {
            if (!pullRequest.url) return;
            setPullRequestChooser(null);
            void openPullRequest(pullRequest.url);
          }}
        />
      ) : null}
      {localReview ? (
        <KanbanLocalReviewDrawer
          review={localReview.review}
          bindings={bindingsByCard[localReview.cardId] ?? []}
          resolvedTheme={resolvedTheme}
          loading={localReview.loading}
          busy={busy}
          error={localReview.error}
          githubConnected={Boolean(githubConnection?.connected)}
          onRetry={() => void refreshLocalReview()}
          onApprove={() => openTransition("approve-local", localReview.cardId)}
          onCompleteNoChanges={() =>
            openTransition("complete-without-pr", localReview.cardId)
          }
          onRequestChanges={() => {
            const card = cardsById.get(localReview.cardId);
            setLocalReview(null);
            if (card) void onOpenConversation(card);
          }}
          onPublishGithub={() => {
            const cardId = localReview.cardId;
            void runAction(
              async () => {
                await publishKanbanCard(cardId);
                setLocalReview(null);
              },
              "Draft pull request publication started.",
            );
          }}
          onClose={() => setLocalReview(null)}
        />
      ) : null}
      {transition && transitionViewCard ? (
        <KanbanTransitionDialog
          open
          kind={transition.kind}
          card={transitionViewCard}
          destinationLabel={transition.destination ? COLUMN_COPY[transition.destination].title : undefined}
          cleanupOptions={cleanupOptions}
          busy={busy}
          error={transitionError}
          messageLabel={transition.kind === "request-changes" ? "Requested changes" : undefined}
          messageValue={requestChangesText}
          messagePlaceholder="Describe what Codex should change before the next review."
          onMessageChange={setRequestChangesText}
          confirmDisabled={transition.kind === "request-changes" && !requestChangesText.trim()}
          onCleanupOptionChange={(optionId, selected) => {
            setCleanupOptions((current) =>
              current.map((option) => {
                if (option.id === optionId) return { ...option, selected };
                if (option.id === "delete-branches" && optionId === "remove-worktrees") {
                  return { ...option, disabled: !selected, selected: selected ? option.selected : false };
                }
                return option;
              }),
            );
          }}
          onCancel={() => setTransition(null)}
          onConfirm={confirmTransition}
        />
      ) : null}
    </div>
  );
}
