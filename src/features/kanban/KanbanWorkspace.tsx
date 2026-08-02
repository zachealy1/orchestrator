import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  CodexAccessMode,
  CodexAccountProfile,
  CodexModel,
  Workspace,
  WorkspaceGitRepositoryStatus,
} from "../../types";
import { listLocalChatTranscript } from "../../db";
import {
  approveKanbanCard,
  archiveKanbanCard,
  cleanupKanbanGit,
  commitKanbanGit,
  createKanbanCard,
  deleteKanbanCard,
  loadKanbanBoard,
  loadKanbanGitBindings,
  mergeKanbanGit,
  moveKanbanCard,
  pushKanbanGit,
  readKanbanGitDiff,
  readKanbanGitStatus,
  reconcileKanbanGit,
  reopenKanbanCard,
  saveKanbanGitBindings,
  saveKanbanInheritedContext,
  saveKanbanPreferences,
  updateKanbanCard,
  type KanbanAttemptRecord,
  type KanbanBoardSnapshotRecord,
  type KanbanCardDraft as PersistedKanbanCardDraft,
  type KanbanCardRecord,
  type KanbanColumnKey,
  type KanbanGitBinding,
  type KanbanGitStatusResult,
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
  KanbanDetailShell,
  KanbanToolbar,
  KanbanTransitionDialog,
  type KanbanCard as ViewKanbanCard,
  type KanbanCardAction,
  type KanbanCardDraft,
  type KanbanChangedFile,
  type KanbanCleanupOption,
  type KanbanColumn,
  type KanbanColumnId,
  type KanbanFilterGroup,
  type KanbanFilterSelection,
  type KanbanGroupBy,
  type KanbanMoveRequest,
  type KanbanReviewData,
  type KanbanTransitionKind,
} from "./components";
import "./kanban.css";

export type KanbanLaunchKind = KanbanAttemptRecord["kind"];

type Props = {
  workspace: Workspace;
  repositories: WorkspaceGitRepositoryStatus[];
  accounts: CodexAccountProfile[];
  models: CodexModel[];
  defaultAccountId: number | null;
  defaultAccessMode: CodexAccessMode;
  defaultModel: string | null;
  defaultReasoningLevel: string | null;
  refreshToken: number;
  conversation?: ReactNode;
  onOpenConversation: (card: KanbanCardRecord) => void | Promise<void>;
  onShowConversation?: (card: KanbanCardRecord) => void | Promise<void>;
  onLaunch: (
    card: KanbanCardRecord,
    kind: KanbanLaunchKind,
    prompt: string,
  ) => Promise<void>;
  onPause: (card: KanbanCardRecord) => Promise<void>;
  onStop: (card: KanbanCardRecord) => Promise<void>;
};

type StoredPreferences = {
  search: string;
  filters: KanbanFilterSelection;
  groupBy: KanbanGroupBy;
  columnOrder: KanbanColumnKey[];
};

type CardDialogState = {
  mode: "create" | "edit" | "duplicate";
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

type ReviewState = KanbanReviewData & {
  statuses: KanbanGitStatusResult[];
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

const EMPTY_REVIEW: ReviewState = {
  summary: "",
  files: [],
  selectedFilePath: null,
  diff: null,
  gitBusy: false,
  canCommit: false,
  canPush: false,
  canMerge: false,
  canRequestChanges: false,
  canApprove: false,
  statuses: [],
};

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
  in_review: { title: "In review", description: "Inspect results and Git changes" },
  done: { title: "Done", description: "Explicitly approved results" },
};

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
      repositoryScope: card.repositoryScope,
      repositories: card.repositories,
    },
    stage: card.stage,
    sortPosition: card.sortPosition,
    executionState: card.executionState,
    reviewState: card.reviewState,
    currentAttemptId: card.currentAttemptId,
    stateVersion: card.stateVersion,
    archivedAt: card.archivedAt,
    deletedAt: card.deletedAt,
    approvedAt: card.approvedAt,
    lastError: card.lastError,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}

function viewExecutionState(card: DomainKanbanCard): ViewKanbanCard["executionState"] {
  if (card.executionState === "waiting_user") return "waiting-for-input";
  if (card.executionState === "waiting_approval") return "waiting-for-approval";
  if (card.executionState === "completed") return "completed-awaiting-review";
  return card.executionState;
}

function viewActions(card: DomainKanbanCard): KanbanCardAction[] {
  const capabilities = deriveCardCapabilities(card);
  const pairs: Array<[keyof typeof capabilities, KanbanCardAction]> = [
    ["open_conversation", "open"],
    ["start", "start"],
    ["pause", "pause"],
    ["resume", "resume"],
    ["stop", "stop"],
    ["retry", "retry"],
    ["edit", "edit"],
    ["duplicate", "duplicate"],
    ["archive", "archive"],
    ["delete", "delete"],
    ["commit", "commit"],
    ["commit_and_push", "commit-and-push"],
    ["merge", "merge"],
    ["request_changes", "request-changes"],
    ["approve_result", "approve"],
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
  runs: Awaited<ReturnType<typeof listLocalChatTranscript>>,
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
  defaultAccountId,
  defaultAccessMode,
  defaultModel,
  defaultReasoningLevel,
  refreshToken,
  conversation,
  onOpenConversation,
  onShowConversation,
  onLaunch,
  onPause,
  onStop,
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
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [cardDialog, setCardDialog] = useState<CardDialogState | null>(null);
  const [cardDialogError, setCardDialogError] = useState<string | null>(null);
  const [transition, setTransition] = useState<PendingTransition | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [requestChangesText, setRequestChangesText] = useState("");
  const [cleanupOptions, setCleanupOptions] = useState<KanbanCleanupOption[]>([]);
  const [gitDialog, setGitDialog] = useState<GitDialogState | null>(null);
  const [review, setReview] = useState<ReviewState>(EMPTY_REVIEW);
  const requestSequence = useRef(0);
  const reviewRequestSequence = useRef(0);
  const reviewFileRequestSequence = useRef(0);
  const selectedCardIdRef = useRef<string | null>(null);
  const preferenceTimer = useRef<number | null>(null);
  const preferenceSavePending = useRef(false);
  const bindingReconcileCache = useRef(
    new Map<string, BindingReconcileCacheEntry>(),
  );

  snapshotRef.current = snapshot;
  preferencesRef.current = preferences;
  selectedCardIdRef.current = selectedCardId;

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
    reviewRequestSequence.current += 1;
    reviewFileRequestSequence.current += 1;
    snapshotRef.current = null;
    selectedCardIdRef.current = null;
    setSnapshot(null);
    setPreferences(parsePreferences("{}"));
    preferenceSavePending.current = false;
    bindingReconcileCache.current.clear();
    setBindingsByCard({});
    setLoading(true);
    setError(null);
    setNotice(null);
    setArchivedOpen(false);
    setSelectedCardId(null);
    setCardDialog(null);
    setTransition(null);
    setGitDialog(null);
    setReview(EMPTY_REVIEW);
  }, [workspace.id]);

  useEffect(() => {
    void loadBoard().catch(() => undefined);
  }, [loadBoard, refreshToken]);

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

  const toViewCard = useCallback(
    (card: DomainKanbanCard): ViewKanbanCard => {
      const loadedBindings = bindingsByCard[card.id];
      const bindings = loadedBindings ?? [];
      return {
        id: card.id,
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
        reasoningLevel: card.config.reasoningLevel ?? "Model default",
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
        availableActions: viewActions(card).filter(
          (action) =>
            action !== "edit" ||
            loadedBindings !== undefined,
        ),
        archivedAt: card.archivedAt,
        lastActivityAt: card.updatedAt,
      };
    },
    [accountLabels, bindingsByCard, modelLabels],
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
      }),
    [accounts, modelLabels, preferences.groupBy, repositories, visibleDomainCards],
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
            card.config.reasoningLevel ?? "Model default",
          ]),
        ),
      },
      {
        id: "execution-state",
        label: "Execution",
        options: options(
          activeCards.map((card) => {
            const view = viewExecutionState(card);
            return [view, view.replace(/-/g, " ")];
          }),
        ),
      },
    ];
  }, [accountLabels, domainCards, modelLabels, repositories]);

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

  function persistedDraft(draft: KanbanCardDraft): PersistedKanbanCardDraft {
    const selectedRepositories =
      draft.repositoryScope === "all"
        ? repositories
        : repositories.filter((repository) =>
            draft.repositoryIds.includes(repository.repository.rootPath),
          );
    return {
      title: draft.title,
      description: draft.description,
      accountId: draft.accountId ? Number(draft.accountId) : null,
      accessMode: draft.accessMode,
      model: draft.model || null,
      reasoningLevel: draft.reasoningLevel || null,
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
      let input = persistedDraft(draft);
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
            const runs = await listLocalChatTranscript(source.chatId);
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

  function openCard(card: ViewKanbanCard) {
    selectedCardIdRef.current = card.id;
    setSelectedCardId(card.id);
    const persisted = cardsById.get(card.id);
    if (persisted) {
      void Promise.resolve(onOpenConversation(persisted)).catch((openError) => {
        if (selectedCardIdRef.current === card.id) setError(errorMessage(openError));
      });
    }
  }

  async function loadReview(
    cardId: string,
    explicitBindings?: KanbanGitBinding[],
  ) {
    const request = ++reviewRequestSequence.current;
    const fileRequest = ++reviewFileRequestSequence.current;
    const card = domainCardsById.get(cardId);
    if (!card) return;
    const bindings = explicitBindings ?? bindingsByCard[cardId] ?? [];
    setReview((current) => ({ ...current, gitBusy: true }));
    const transcriptPromise = listLocalChatTranscript(card.chatId).catch(() => []);
    const results = await Promise.allSettled(
      bindings.map((binding) => readKanbanGitStatus(binding)),
    );
    const statuses = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    const statusFailureCount = results.length - statuses.length;
    const files: KanbanChangedFile[] = statuses.flatMap((status) =>
      status.files.map((file) => ({
        path: file.path,
        repositoryId: status.binding.sourceRepositoryPath,
        repositoryLabel:
          card.config.repositories.find(
            (repository) =>
              repository.repositoryPath === status.binding.sourceRepositoryPath,
          )?.label ?? status.binding.relativePath,
        status: file.kind,
      })),
    );
    let diff: string | null = null;
    if (bindings[0]) {
      diff = await readKanbanGitDiff(bindings[0])
        .then((result) => result.content || null)
        .catch(() => null);
    }
    const transcript = await transcriptPromise;
    const finalSummary = [...transcript]
      .reverse()
      .map((run) => run.final_message?.trim() ?? "")
      .find(Boolean);
    if (
      request !== reviewRequestSequence.current ||
      fileRequest !== reviewFileRequestSequence.current ||
      selectedCardIdRef.current !== cardId
    ) {
      return;
    }
    const capabilities = deriveCardCapabilities(card);
    if (statusFailureCount > 0) {
      setError(
        `Git status could not be read for ${statusFailureCount} repositor${statusFailureCount === 1 ? "y" : "ies"}. Repository actions are disabled until it can be reconciled.`,
      );
    }
    setReview({
      summary:
        card.lastError ??
        finalSummary ??
        (card.executionState === "completed"
          ? "Codex completed this card. Inspect the conversation and repository changes before approving."
          : "Review the card conversation and current repository state."),
      files,
      selectedFilePath: files[0]
        ? `${files[0].repositoryId ?? files[0].repositoryLabel ?? ""}:${files[0].path}`
        : null,
      diff,
      gitBusy: false,
      canCommit:
        capabilities.commit.enabled &&
        statusFailureCount === 0 &&
        statuses.some((status) => status.hasChanges),
      canPush:
        capabilities.commit_and_push.enabled &&
        bindings.length > 0 &&
        statusFailureCount === 0,
      canMerge:
        capabilities.merge.enabled &&
        bindings.length > 0 &&
        statusFailureCount === 0,
      canRequestChanges: capabilities.request_changes.enabled,
      canApprove: capabilities.approve_result.enabled,
      statuses,
    });
  }

  useEffect(() => {
    if (!selectedCardId) {
      setReview(EMPTY_REVIEW);
      return;
    }
    void loadReview(selectedCardId);
    // Binding/card refreshes are represented by refreshToken and snapshot revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCardId, refreshToken, snapshot?.revision]);

  async function selectReviewFile(file: KanbanChangedFile) {
    const cardId = selectedCardId;
    if (!cardId) return;
    const request = ++reviewFileRequestSequence.current;
    const card = domainCardsById.get(cardId);
    const binding = (bindingsByCard[cardId] ?? []).find((candidate) => {
      if (file.repositoryId) {
        return candidate.sourceRepositoryPath === file.repositoryId;
      }
      const label =
        card?.config.repositories.find(
          (repository) =>
            repository.repositoryPath === candidate.sourceRepositoryPath,
        )?.label ?? candidate.relativePath;
      return label === file.repositoryLabel;
    });
    setReview((current) => ({
      ...current,
      selectedFilePath: `${file.repositoryId ?? file.repositoryLabel ?? ""}:${file.path}`,
      gitBusy: true,
    }));
    const diff = binding
      ? await readKanbanGitDiff(binding)
          .then((result) => result.content || null)
          .catch(() => null)
      : null;
    if (
      request !== reviewFileRequestSequence.current ||
      selectedCardIdRef.current !== cardId
    ) {
      return;
    }
    setReview((current) => ({ ...current, diff, gitBusy: false }));
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
    await runAction(
      () =>
        moveKanbanCard({
          card: persisted,
          targetStage: target,
          beforeCardId: next?.id ?? null,
          afterCardId: previous?.id ?? null,
        }),
      "Card moved.",
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
          description: "Only available when removing worktrees; unmerged commits may be lost.",
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
                force: false,
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
        if (selectedCardId === persisted.id) setSelectedCardId(null);
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
      await loadReview(gitDialog.cardId, nextBindings);
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

  async function handleCardAction(action: KanbanCardAction, card: ViewKanbanCard) {
    const persisted = cardsById.get(card.id);
    if (!persisted) return;
    if (action === "open") return openCard(card);
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
    if (action === "request-changes") {
      return openTransition("request-changes", card.id);
    }
    if (action === "approve") return openTransition("approve-done", card.id);
    if (action === "commit" || action === "commit-and-push" || action === "merge") {
      setGitDialog({ action, cardId: card.id, message: card.title });
    }
  }

  const selectedDomainCard = selectedCardId
    ? domainCardsById.get(selectedCardId) ?? null
    : null;
  const selectedViewCard = selectedDomainCard ? toViewCard(selectedDomainCard) : null;
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
  const defaultDraft: Partial<KanbanCardDraft> = {
    accountId: defaultAccountId === null ? null : String(defaultAccountId),
    accessMode: defaultAccessMode,
    model: defaultModel ?? "",
    reasoningLevel: defaultReasoningLevel ?? "",
    repositoryScope: "all",
    repositoryIds: repositories.map((repository) => repository.repository.rootPath),
    includeDirtyChanges: false,
  };

  if (loading && !snapshot) {
    return (
      <section className="kanban-loading" aria-live="polite">
        <span className="kanban-loading-spinner" aria-hidden="true" />
        <p>Loading Kanban board…</p>
      </section>
    );
  }

  if (selectedViewCard) {
    return (
      <div className="kanban-workspace-view">
        {error ? <div className="kanban-workspace-alert error" role="alert">{error}</div> : null}
        <KanbanDetailShell
          card={selectedViewCard}
          conversation={
            conversation ?? (
              <div className="kanban-conversation-bridge">
                <p>This card’s conversation is stored separately from regular workspace chat history.</p>
                <button
                  type="button"
                  className="kanban-primary-button"
                  onClick={() => {
                    const card = cardsById.get(selectedViewCard.id);
                    if (card) void (onShowConversation ?? onOpenConversation)(card);
                  }}
                >
                  Open card conversation
                </button>
              </div>
            )
          }
          review={review}
          initialTab={selectedDomainCard?.stage === "in_review" ? "review" : "conversation"}
          onBack={() => {
            selectedCardIdRef.current = null;
            reviewRequestSequence.current += 1;
            reviewFileRequestSequence.current += 1;
            setSelectedCardId(null);
          }}
          onAction={(action, card) => void handleCardAction(action, card)}
          onSelectReviewFile={(file) => void selectReviewFile(file)}
        />
        {gitDialog ? (
          <div className="kanban-modal-backdrop" role="presentation">
            <section className="kanban-git-dialog" role="dialog" aria-modal="true" aria-labelledby="kanban-git-dialog-title">
              <header>
                <div>
                  <span className="kanban-eyebrow">Per-repository Git operation</span>
                  <h2 id="kanban-git-dialog-title">
                    {gitDialog.action === "merge"
                      ? "Merge card branches?"
                      : gitDialog.action === "commit-and-push"
                        ? "Commit and push changes?"
                        : "Commit changes?"}
                  </h2>
                </div>
              </header>
              <p>Each repository is handled independently. Partial results are reported and never mark the card Done.</p>
              {gitDialog.action !== "merge" ? (
                <label className="kanban-field">
                  <span>Commit message</span>
                  <input
                    value={gitDialog.message}
                    onChange={(event) => setGitDialog({ ...gitDialog, message: event.target.value })}
                  />
                </label>
              ) : null}
              <footer>
                <button type="button" className="secondary" disabled={busy} onClick={() => setGitDialog(null)}>Cancel</button>
                <button
                  type="button"
                  className="kanban-primary-button"
                  disabled={busy || (gitDialog.action !== "merge" && !gitDialog.message.trim())}
                  onClick={() => void performGitAction()}
                >
                  {busy ? "Working…" : "Continue"}
                </button>
              </footer>
            </section>
          </div>
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

  return (
    <div className="kanban-workspace-view">
      {error ? <div className="kanban-workspace-alert error" role="alert">{error}</div> : null}
      {notice ? <div className="kanban-workspace-alert" role="status">{notice}</div> : null}
      <KanbanToolbar
        search={preferences.search}
        filters={preferences.filters}
        filterGroups={filterGroups}
        groupBy={preferences.groupBy}
        visibleCardCount={visibleDomainCards.length}
        totalCardCount={domainCards.filter((card) => card.archivedAt === null && card.deletedAt === null).length}
        archivedOpen={archivedOpen}
        onSearchChange={(search) => schedulePreferenceSave({ ...preferencesRef.current, search })}
        onFiltersChange={(filters) => schedulePreferenceSave({ ...preferencesRef.current, filters })}
        onGroupByChange={(groupBy) => schedulePreferenceSave({ ...preferencesRef.current, groupBy })}
        onCreateCard={() => setCardDialog({ mode: "create", cardId: null })}
        onToggleArchived={() => setArchivedOpen((current) => !current)}
      />
      {archivedOpen ? (
        <KanbanArchivedView
          cards={archivedCards}
          onClose={() => setArchivedOpen(false)}
          onOpenCard={openCard}
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
              {preferences.groupBy !== "none" ? (
                <header className="kanban-group-header">
                  <h2>{group.label}</h2>
                  <span>{group.cards.length}</span>
                </header>
              ) : null}
              <KanbanBoard
                columns={buildColumns(group.cards)}
                disabled={busy}
                onMoveCard={(request) => void handleMove(request)}
                onReorderColumns={(ids) => {
                  const columnOrder = ids.map((id) => VIEW_TO_STAGE[id]).filter(Boolean);
                  if (columnOrder.length === 4) {
                    schedulePreferenceSave({ ...preferencesRef.current, columnOrder });
                  }
                }}
                onOpenCard={openCard}
                onCardAction={(action, card) => void handleCardAction(action, card)}
                onCreateCard={() => setCardDialog({ mode: "create", cardId: null })}
              />
            </section>
          ))}
        </div>
      ) : (
        <section className="kanban-empty-board">
          <h2>No matching cards</h2>
          <p>Create a card or clear the current filters.</p>
          <button type="button" className="kanban-primary-button" onClick={() => setCardDialog({ mode: "create", cardId: null })}>Create card</button>
        </section>
      )}

      <KanbanCardDialog
        open={cardDialog !== null}
        mode={cardDialog?.mode ?? "create"}
        card={dialogViewCard}
        defaults={cardDialog?.mode === "create" ? defaultDraft : undefined}
        repositories={repositories.map((repository) => ({
          id: repository.repository.rootPath,
          label: repository.repository.label,
          path: repository.repository.rootPath,
        }))}
        accountOptions={accounts.map((account) => ({ value: String(account.id), label: account.label, disabled: account.status !== "signed_in" }))}
        modelOptions={models.filter((model) => !model.hidden).map((model) => ({ value: model.model, label: model.displayName }))}
        reasoningOptions={[
          ...new Map(
            models.flatMap((model) => model.supportedReasoningEfforts.map((effort) => [effort.reasoningEffort, effort.reasoningEffort] as const)),
          ).entries(),
        ].map(([value, label]) => ({ value, label }))}
        executionSettingsLocked={
          cardDialog?.mode === "edit" &&
          cardDialog.cardId !== null &&
          (bindingsByCard[cardDialog.cardId]?.length ?? 0) > 0
        }
        saving={busy}
        error={cardDialogError}
        onCancel={() => setCardDialog(null)}
        onSubmit={submitCard}
      />
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
