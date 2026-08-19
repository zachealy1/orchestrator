import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
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
import "./kanban.css";

export type KanbanLaunchKind = KanbanAttemptRecord["kind"];

type Props = {
  workspace: Workspace;
  repositories: WorkspaceGitRepositoryStatus[];
  accounts: CodexAccountProfile[];
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

type GitDialogProps = {
  dialog: GitDialogState;
  busy: boolean;
  onMessageChange: (message: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

type BindingReconcileCacheEntry = {
  fingerprint: string;
  binding: KanbanGitBinding;
  checkedAt: number;
};

const DEFAULT_COLUMN_ORDER: KanbanColumnKey[] = [
  "todo",
  "in_progress",
  "in_review",
  "done",
];

const BINDING_RECONCILE_TTL_MS = 10_000;

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
          <p className="eyebrow">Git</p>
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
            className="secondary"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button ref={confirmRef} type="submit" disabled={confirmDisabled}>
            <GitDialogActionIcon action={dialog.action} busy={busy} />
            {busy ? copy.busy : copy.confirm}
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
            title="Close"
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
  workspace,
  repositories,
  accounts,
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
  const [snapshot, setSnapshot] = useState<KanbanBoardSnapshotRecord | null>(null);
  const snapshotRef = useRef<KanbanBoardSnapshotRecord | null>(null);
  const [preferences, setPreferences] = useState<StoredPreferences>(() =>
    parsePreferences("{}"),
  );
  const preferencesRef = useRef(preferences);
  const [bindingsByCard, setBindingsByCard] = useState<
    Record<string, KanbanGitBinding[] | undefined>
  >({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
  const preferenceTimer = useRef<number | null>(null);
  const preferenceSavePending = useRef(false);
  const bindingReconcileCache = useRef(
    new Map<string, BindingReconcileCacheEntry>(),
  );

  snapshotRef.current = snapshot;
  preferencesRef.current = preferences;

  const loadBoard = useCallback(async () => {
    const request = ++requestSequence.current;
    setLoading(true);
    try {
      const next = await loadKanbanBoard(workspace.id, { includeArchived: true });
      if (request !== requestSequence.current) return next;
      const nextPreferences = preferenceSavePending.current
        ? preferencesRef.current
        : parsePreferences(next.preferencesJson);
      const liveCards = next.cards.filter((card) => card.deletedAt === null);
      const bindingResults: PromiseSettledResult<
        readonly [string, KanbanGitBinding[]]
      >[] = [];
      for (let offset = 0; offset < liveCards.length; offset += 4) {
        const chunk = await Promise.allSettled(
          liveCards.slice(offset, offset + 4).map(async (card) => {
            const storedBindings = await loadKanbanGitBindings(card.id);
            const bindings: KanbanGitBinding[] = [];
            for (const binding of storedBindings) {
              const key = `${binding.sourceRepositoryPath}\u0000${binding.worktreePath}`;
              const fingerprint = JSON.stringify(binding);
              const cached = bindingReconcileCache.current.get(key);
              if (
                cached &&
                cached.fingerprint === fingerprint &&
                Date.now() - cached.checkedAt < BINDING_RECONCILE_TTL_MS
              ) {
                bindings.push(cached.binding);
                continue;
              }
              const reconciled = await reconcileKanbanGit(binding);
              bindingReconcileCache.current.set(key, {
                fingerprint,
                binding: reconciled.binding,
                checkedAt: Date.now(),
              });
              bindings.push(reconciled.binding);
            }
            return [card.id, bindings] as const;
          }),
        );
        bindingResults.push(...chunk);
        if (request !== requestSequence.current) return next;
      }
      if (request !== requestSequence.current) return next;
      const bindingEntries = bindingResults.map((result, index) =>
        result.status === "fulfilled"
          ? result.value
          : ([liveCards[index].id, undefined] as const),
      );
      const bindingFailureCount = bindingResults.filter(
        (result) => result.status === "rejected",
      ).length;
      snapshotRef.current = next;
      setSnapshot(next);
      preferencesRef.current = nextPreferences;
      setPreferences(nextPreferences);
      setBindingsByCard(Object.fromEntries(bindingEntries));
      setError(
        bindingFailureCount > 0
          ? `Git state could not be loaded for ${bindingFailureCount} card${bindingFailureCount === 1 ? "" : "s"}. Binding-sensitive actions are disabled until the board refreshes.`
          : null,
      );
      return next;
    } catch (loadError) {
      if (request === requestSequence.current) setError(errorMessage(loadError));
      throw loadError;
    } finally {
      if (request === requestSequence.current) setLoading(false);
    }
  }, [workspace.id]);

  useEffect(() => {
    requestSequence.current += 1;
    snapshotRef.current = null;
    setSnapshot(null);
    setPreferences(parsePreferences("{}"));
    preferenceSavePending.current = false;
    bindingReconcileCache.current.clear();
    setBindingsByCard({});
    setLoading(true);
    setError(null);
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
    let cancelled = false;
    const hasPendingPublication = snapshot?.cards.some((card) =>
      card.pullRequests?.some((pullRequest) =>
        pullRequest.publicationStatus === "queued" ||
        pullRequest.publicationStatus === "publishing",
      ),
    );
    async function sync() {
      try {
        const updated = await syncKanbanPullRequests(workspace.id);
        if (!cancelled && updated > 0) await loadBoard();
      } catch {
        // A disconnected GitHub account is represented by the persisted card state.
      }
    }
    void sync();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void sync();
    }, hasPendingPublication ? 2_000 : 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [loadBoard, snapshot?.cards, workspace.id]);

  useEffect(
    () => () => {
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
    const accountId = draft.accountId
      ? Number(draft.accountId)
      : existingSettings?.accountId ?? workspace.default_account_id ?? 0;
    const profileKey: CodexProfileKey =
      existingSettings?.accountId === accountId
        ? existingSettings.profileKey
        : accountId === 0
          ? ("default" as CodexProfileKey)
          : (`account:${accountId}` as CodexProfileKey);
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
      accountId: draft.accountId ? Number(draft.accountId) : null,
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
      onToggleArchived={() => setArchivedOpen((current) => !current)}
    />
  );

  return (
    <div className="kanban-workspace-view" aria-busy={busy}>
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
      {error ? (
        <div className="kanban-workspace-alert error" role="alert">
          <AlertCircle size={15} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
      {notice ? (
        <div className="kanban-workspace-alert" role="status">
          <CheckCircle2 size={15} aria-hidden="true" />
          <span>{notice}</span>
        </div>
      ) : null}
      {toolbarHost === undefined
        ? toolbar
        : toolbarHost
          ? createPortal(toolbar, toolbarHost)
          : null}
      {archivedOpen ? (
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
        accountOptions={accounts.map((account) => ({ value: String(account.id), label: account.label, disabled: account.status !== "signed_in" }))}
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
