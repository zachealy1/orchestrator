import type { CodexAccessMode } from "../codex/types";

export const KANBAN_STAGES = [
  "todo",
  "in_progress",
  "in_review",
  "done",
] as const;

export type KanbanStage = (typeof KANBAN_STAGES)[number];

export const KANBAN_EXECUTION_STATES = [
  "idle",
  "starting",
  "running",
  "paused",
  "waiting_user",
  "waiting_approval",
  "blocked",
  "failed",
  "stopped",
  "interrupted",
  "completed",
] as const;

export type KanbanExecutionState =
  (typeof KANBAN_EXECUTION_STATES)[number];

export type KanbanReviewState =
  | "none"
  | "awaiting_review"
  | "changes_requested"
  | "approved";

export type KanbanRepositorySelection = {
  repositoryPath: string;
  relativePath: string;
  label: string;
  includeDirtyChanges?: boolean;
};

export type KanbanCardConfig = {
  accountId: number | null;
  accessMode: CodexAccessMode;
  model: string | null;
  reasoningLevel: string | null;
  executionSettingsJson?: string | null;
  repositoryScope: "all" | "selected";
  repositories: readonly KanbanRepositorySelection[];
};

export type KanbanCard = {
  id: string;
  workspaceId: number;
  chatId: number;
  title: string;
  description: string;
  config: KanbanCardConfig;
  stage: KanbanStage;
  sortPosition: number;
  executionState: KanbanExecutionState;
  reviewState: KanbanReviewState;
  currentAttemptId: string | null;
  stateVersion: number;
  archivedAt: string | null;
  deletedAt: string | null;
  approvedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KanbanColumn = {
  stage: KanbanStage;
  position: number;
};

export type KanbanBoardSnapshot = {
  workspaceId: number;
  revision: number;
  columns: readonly KanbanColumn[];
  cards: readonly KanbanCard[];
  filters: KanbanFilterState;
  grouping: KanbanGrouping;
};

export type KanbanExecutionFacet =
  | "active"
  | "waiting"
  | "blocked"
  | "failed";

export type KanbanCardVisibility = "active" | "archived" | "all";

export type KanbanFilterState = {
  search: string;
  repositoryPaths: readonly string[];
  accountIds: readonly (number | null)[];
  accessModes: readonly CodexAccessMode[];
  models: readonly string[];
  reasoningLevels: readonly string[];
  executionStates: readonly KanbanExecutionState[];
  executionFacets: readonly KanbanExecutionFacet[];
  visibility: KanbanCardVisibility;
};

export const DEFAULT_KANBAN_FILTER_STATE: KanbanFilterState = {
  search: "",
  repositoryPaths: [],
  accountIds: [],
  accessModes: [],
  models: [],
  reasoningLevels: [],
  executionStates: [],
  executionFacets: [],
  visibility: "active",
};

export type KanbanGrouping =
  | "none"
  | "repository"
  | "account"
  | "access_mode"
  | "model"
  | "reasoning_level"
  | "execution_state"
  | "execution_facet";

export type KanbanCardGroup = {
  key: string;
  label: string;
  cards: KanbanCard[];
};

export type KanbanGroupLabels = {
  repositories?: Readonly<Record<string, string>>;
  accounts?: Readonly<Record<number, string>>;
  models?: Readonly<Record<string, string>>;
  reasoningLevels?: Readonly<Record<string, string>>;
};

export type KanbanCardAction =
  | "start"
  | "pause"
  | "resume"
  | "stop"
  | "retry"
  | "respond_to_user"
  | "resolve_approval"
  | "edit"
  | "duplicate"
  | "archive"
  | "restore"
  | "delete"
  | "commit"
  | "push"
  | "commit_and_push"
  | "merge"
  | "request_changes"
  | "approve_result"
  | "reopen_review";

export type KanbanCapability = {
  enabled: boolean;
  requiresConfirmation: boolean;
  reason: string | null;
};

export type KanbanCardCapabilities = Record<
  KanbanCardAction,
  KanbanCapability
>;

const ACTIVE_EXECUTION_STATES = new Set<KanbanExecutionState>([
  "starting",
  "running",
  "waiting_user",
  "waiting_approval",
]);

const WAITING_EXECUTION_STATES = new Set<KanbanExecutionState>([
  "waiting_user",
  "waiting_approval",
]);

const RESUMABLE_EXECUTION_STATES = new Set<KanbanExecutionState>([
  "paused",
  "blocked",
  "interrupted",
]);

export function isExecutionActive(state: KanbanExecutionState) {
  return ACTIVE_EXECUTION_STATES.has(state);
}

export function isExecutionWaiting(state: KanbanExecutionState) {
  return WAITING_EXECUTION_STATES.has(state);
}

export function isExecutionResumable(state: KanbanExecutionState) {
  return RESUMABLE_EXECUTION_STATES.has(state);
}

export function isExecutionFinished(state: KanbanExecutionState) {
  return state === "failed" || state === "stopped" || state === "completed";
}

export function isExecutionConfigurationLocked(
  state: KanbanExecutionState,
) {
  return (
    isExecutionActive(state) ||
    state === "paused" ||
    state === "blocked"
  );
}

export function executionFacets(
  state: KanbanExecutionState,
): KanbanExecutionFacet[] {
  const facets: KanbanExecutionFacet[] = [];
  if (isExecutionActive(state)) facets.push("active");
  if (isExecutionWaiting(state)) facets.push("waiting");
  if (state === "blocked") facets.push("blocked");
  if (state === "failed") facets.push("failed");
  return facets;
}

function capability(
  enabled: boolean,
  reason: string,
  requiresConfirmation = false,
): KanbanCapability {
  return {
    enabled,
    requiresConfirmation: enabled && requiresConfirmation,
    reason: enabled ? null : reason,
  };
}

export function deriveCardCapabilities(
  card: KanbanCard,
): KanbanCardCapabilities {
  const deleted = card.deletedAt !== null;
  const archived = card.archivedAt !== null;
  const available = !deleted && !archived;
  const active = isExecutionActive(card.executionState);
  const locked = isExecutionConfigurationLocked(card.executionState);
  const stoppable =
    active ||
    card.executionState === "paused" ||
    card.executionState === "blocked" ||
    card.executionState === "interrupted";
  const reviewable =
    (card.stage === "in_review" || card.stage === "done") && !locked;
  const awaitingReview =
    card.stage === "in_review" &&
    card.executionState === "completed" &&
    card.reviewState === "awaiting_review";

  return {
    start: capability(
      available && card.stage === "todo" && card.executionState === "idle",
      "Only an idle To do card can be started.",
    ),
    pause: capability(
      available && active,
      "Only a live agent attempt can be paused.",
    ),
    resume: capability(
      available && isExecutionResumable(card.executionState),
      "This card has no resumable attempt.",
    ),
    stop: capability(
      available && stoppable,
      "This card has no attempt to stop.",
      true,
    ),
    retry: capability(
      available &&
        (card.executionState === "failed" || card.executionState === "stopped"),
      "Only failed or stopped work can be retried.",
    ),
    respond_to_user: capability(
      available && card.executionState === "waiting_user",
      "The agent is not waiting for user input.",
    ),
    resolve_approval: capability(
      available && card.executionState === "waiting_approval",
      "The agent has no pending approval request.",
    ),
    edit: capability(
      available && !locked,
      "Execution settings are locked while an attempt is active.",
    ),
    duplicate: capability(!deleted, "This card has been deleted."),
    archive: capability(
      available && !locked,
      "Stop the active attempt before archiving this card.",
      true,
    ),
    restore: capability(
      !deleted && archived,
      "Only an archived card can be restored.",
    ),
    delete: capability(
      !deleted && !locked,
      "Stop the active attempt before deleting this card.",
      true,
    ),
    commit: capability(
      available && reviewable,
      "Git actions are available after execution reaches review.",
    ),
    push: capability(
      available && reviewable,
      "Git actions are available after execution reaches review.",
    ),
    commit_and_push: capability(
      available && reviewable,
      "Git actions are available after execution reaches review.",
    ),
    merge: capability(
      available && reviewable,
      "Git actions are available after execution reaches review.",
    ),
    request_changes: capability(
      available &&
        card.stage === "in_review" &&
        card.executionState === "completed" &&
        card.reviewState === "awaiting_review" &&
        !locked,
      "Changes can only be requested for a result awaiting review.",
    ),
    approve_result: capability(
      available && awaitingReview,
      "Only a completed result awaiting review can be approved.",
      true,
    ),
    reopen_review: capability(
      available &&
        card.stage === "done" &&
        card.reviewState === "approved" &&
        !locked,
      "Only an approved Done card can be reopened.",
    ),
  };
}

export type KanbanTransitionTrigger =
  | "drag"
  | "start"
  | "run_completed"
  | "request_changes"
  | "approve_result"
  | "reopen_review"
  | "stop_and_move";

export type KanbanTransitionAction =
  | "none"
  | "start"
  | "resume"
  | "retry"
  | "stop_and_move"
  | "request_changes"
  | "approve_result"
  | "reopen_review";

export type KanbanTransitionDecision = {
  allowed: boolean;
  action: KanbanTransitionAction;
  requiresConfirmation: boolean;
  reason: string | null;
};

function transition(
  allowed: boolean,
  action: KanbanTransitionAction = "none",
  requiresConfirmation = false,
  reason = "That move is not valid for the card's current lifecycle.",
): KanbanTransitionDecision {
  return {
    allowed,
    action,
    requiresConfirmation: allowed && requiresConfirmation,
    reason: allowed ? null : reason,
  };
}

export function deriveCardTransition(
  card: KanbanCard,
  target: KanbanStage,
  trigger: KanbanTransitionTrigger = "drag",
): KanbanTransitionDecision {
  if (card.deletedAt !== null || card.archivedAt !== null) {
    return transition(false, "none", false, "Archived or deleted cards cannot move.");
  }
  if (target === card.stage) return transition(true);

  const capabilities = deriveCardCapabilities(card);
  if (trigger === "start") {
    return transition(
      target === "in_progress" && capabilities.start.enabled,
      "start",
    );
  }
  if (trigger === "run_completed") {
    return transition(
      card.stage === "in_progress" &&
        target === "in_review" &&
        (isExecutionActive(card.executionState) ||
          card.executionState === "completed"),
    );
  }
  if (trigger === "request_changes") {
    return transition(
      target === "in_progress" && capabilities.request_changes.enabled,
      "request_changes",
      true,
    );
  }
  if (trigger === "approve_result") {
    return transition(
      target === "done" && capabilities.approve_result.enabled,
      "approve_result",
      true,
    );
  }
  if (trigger === "reopen_review") {
    return transition(
      target === "in_review" && capabilities.reopen_review.enabled,
      "reopen_review",
    );
  }
  if (trigger === "stop_and_move") {
    const mustStop =
      card.stage === "in_progress" &&
      (isExecutionActive(card.executionState) ||
        card.executionState === "paused" ||
        card.executionState === "blocked");
    return transition(
      mustStop && (target === "todo" || target === "in_review"),
      "stop_and_move",
      true,
    );
  }

  if (card.stage === "todo" && target === "in_progress") {
    if (card.executionState === "idle") return transition(true, "start");
    if (
      card.executionState === "failed" ||
      card.executionState === "stopped"
    ) {
      return transition(true, "retry");
    }
    if (isExecutionResumable(card.executionState)) {
      return transition(true, "resume");
    }
    return transition(false);
  }

  if (card.stage === "in_progress") {
    if (target === "done") {
      return transition(
        false,
        "none",
        false,
        "A card must enter review before its result can be approved.",
      );
    }
    if (
      isExecutionActive(card.executionState) ||
      card.executionState === "paused" ||
      card.executionState === "blocked"
    ) {
      return transition(true, "stop_and_move", true);
    }
    if (
      target === "todo" &&
      (card.executionState === "failed" ||
        card.executionState === "stopped" ||
        card.executionState === "interrupted")
    ) {
      return transition(true);
    }
    if (
      target === "in_review" &&
      (card.executionState === "completed" ||
        card.executionState === "stopped")
    ) {
      return transition(true);
    }
    return transition(false);
  }

  if (card.stage === "in_review" && target === "in_progress") {
    return transition(
      capabilities.request_changes.enabled,
      "request_changes",
      true,
    );
  }
  if (card.stage === "in_review" && target === "done") {
    return transition(
      capabilities.approve_result.enabled,
      "approve_result",
      true,
    );
  }
  if (card.stage === "done" && target === "in_review") {
    return transition(
      capabilities.reopen_review.enabled,
      "reopen_review",
    );
  }
  return transition(false);
}

export function canTransitionCard(
  card: KanbanCard,
  target: KanbanStage,
  trigger: KanbanTransitionTrigger = "drag",
) {
  return deriveCardTransition(card, target, trigger).allowed;
}

function matchesAny<T>(selected: readonly T[], value: T) {
  return selected.length === 0 || selected.includes(value);
}

function searchable(value: string) {
  return value.normalize("NFKC").toLowerCase();
}

function matchesSearch(card: KanbanCard, query: string) {
  const tokens = searchable(query).trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = searchable(`${card.title}\n${card.description}`);
  return tokens.every((token) => haystack.includes(token));
}

function matchesRepositories(
  card: KanbanCard,
  selectedPaths: readonly string[],
) {
  if (selectedPaths.length === 0 || card.config.repositoryScope === "all") {
    return true;
  }
  const cardPaths = new Set(
    card.config.repositories.map((repository) => repository.repositoryPath),
  );
  return selectedPaths.some((path) => cardPaths.has(path));
}

export function filterKanbanCards(
  cards: readonly KanbanCard[],
  filters: KanbanFilterState = DEFAULT_KANBAN_FILTER_STATE,
) {
  return cards.filter((card) => {
    if (card.deletedAt !== null) return false;
    const archived = card.archivedAt !== null;
    if (filters.visibility === "active" && archived) return false;
    if (filters.visibility === "archived" && !archived) return false;
    if (!matchesSearch(card, filters.search)) return false;
    if (!matchesRepositories(card, filters.repositoryPaths)) return false;
    if (!matchesAny(filters.accountIds, card.config.accountId)) return false;
    if (!matchesAny(filters.accessModes, card.config.accessMode)) return false;
    if (!matchesAny(filters.models, card.config.model ?? "")) return false;
    if (
      !matchesAny(
        filters.reasoningLevels,
        card.config.reasoningLevel ?? "",
      )
    ) {
      return false;
    }
    if (!matchesAny(filters.executionStates, card.executionState)) return false;
    if (filters.executionFacets.length > 0) {
      const cardFacets = executionFacets(card.executionState);
      if (!filters.executionFacets.some((facet) => cardFacets.includes(facet))) {
        return false;
      }
    }
    return true;
  });
}

const EXECUTION_LABELS: Record<KanbanExecutionState, string> = {
  idle: "Idle",
  starting: "Starting",
  running: "Running",
  paused: "Paused",
  waiting_user: "Waiting for user",
  waiting_approval: "Waiting for approval",
  blocked: "Blocked",
  failed: "Failed",
  stopped: "Stopped",
  interrupted: "Interrupted",
  completed: "Completed",
};

function primaryExecutionFacet(state: KanbanExecutionState) {
  if (state === "failed") return ["failed", "Failed"] as const;
  if (state === "blocked") return ["blocked", "Blocked"] as const;
  if (isExecutionWaiting(state)) return ["waiting", "Waiting"] as const;
  if (isExecutionActive(state)) return ["active", "Active"] as const;
  return ["inactive", "Inactive"] as const;
}

function repositoryGroup(card: KanbanCard, labels: KanbanGroupLabels) {
  if (card.config.repositoryScope === "all") {
    return ["repository:all", "All repositories"] as const;
  }
  if (card.config.repositories.length !== 1) {
    return ["repository:multiple", "Multiple repositories"] as const;
  }
  const repository = card.config.repositories[0];
  return [
    `repository:${repository.repositoryPath}`,
    labels.repositories?.[repository.repositoryPath] ?? repository.label,
  ] as const;
}

function cardGroup(
  card: KanbanCard,
  grouping: KanbanGrouping,
  labels: KanbanGroupLabels,
) {
  if (grouping === "repository") return repositoryGroup(card, labels);
  if (grouping === "account") {
    const accountId = card.config.accountId;
    return accountId === null
      ? (["account:default", "Default account"] as const)
      : ([
          `account:${accountId}`,
          labels.accounts?.[accountId] ?? `Account ${accountId}`,
        ] as const);
  }
  if (grouping === "access_mode") {
    return card.config.accessMode === "full-access"
      ? (["access:full-access", "Full access"] as const)
      : (["access:ask-for-approval", "Ask for approval"] as const);
  }
  if (grouping === "model") {
    const model = card.config.model;
    return model
      ? ([`model:${model}`, labels.models?.[model] ?? model] as const)
      : (["model:default", "Default model"] as const);
  }
  if (grouping === "reasoning_level") {
    const reasoning = card.config.reasoningLevel;
    return reasoning
      ? ([
          `reasoning:${reasoning}`,
          labels.reasoningLevels?.[reasoning] ?? reasoning,
        ] as const)
      : (["reasoning:default", "Default reasoning"] as const);
  }
  if (grouping === "execution_state") {
    return [
      `execution:${card.executionState}`,
      EXECUTION_LABELS[card.executionState],
    ] as const;
  }
  if (grouping === "execution_facet") {
    const [key, label] = primaryExecutionFacet(card.executionState);
    return [`facet:${key}`, label] as const;
  }
  return ["all", "All cards"] as const;
}

export function groupKanbanCards(
  cards: readonly KanbanCard[],
  grouping: KanbanGrouping,
  labels: KanbanGroupLabels = {},
): KanbanCardGroup[] {
  const groups = new Map<string, KanbanCardGroup>();
  for (const card of cards) {
    const [key, label] = cardGroup(card, grouping, labels);
    const group = groups.get(key);
    if (group) group.cards.push(card);
    else groups.set(key, { key, label, cards: [card] });
  }
  return [...groups.values()].sort(
    (left, right) =>
      lexicalCompare(left.label, right.label) || lexicalCompare(left.key, right.key),
  );
}

export function compareKanbanCards(left: KanbanCard, right: KanbanCard) {
  const leftPosition = Number.isFinite(left.sortPosition)
    ? left.sortPosition
    : Number.MAX_SAFE_INTEGER;
  const rightPosition = Number.isFinite(right.sortPosition)
    ? right.sortPosition
    : Number.MAX_SAFE_INTEGER;
  return leftPosition - rightPosition || lexicalCompare(left.id, right.id);
}

function lexicalCompare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function sortKanbanCards(
  cards: readonly KanbanCard[],
  stage?: KanbanStage,
) {
  return cards
    .filter((card) => stage === undefined || card.stage === stage)
    .slice()
    .sort(compareKanbanCards);
}

export const KANBAN_POSITION_SPACING = 1_024;

export type KanbanPositionAnchors = {
  /** The following card; the moved card is inserted before this anchor. */
  beforeCardId?: string | null;
  /** The preceding card; the moved card is inserted after this anchor. */
  afterCardId?: string | null;
};

function betweenPositions(before: number | null, after: number | null) {
  if (
    (before !== null && !Number.isFinite(before)) ||
    (after !== null && !Number.isFinite(after))
  ) {
    return null;
  }
  if (before === null && after === null) return KANBAN_POSITION_SPACING;
  if (before === null) return (after as number) - KANBAN_POSITION_SPACING;
  if (after === null) return before + KANBAN_POSITION_SPACING;
  const position = before + (after - before) / 2;
  return position > before && position < after ? position : null;
}

export function calculateCardPosition(
  cards: readonly KanbanCard[],
  stage: KanbanStage,
  anchors: KanbanPositionAnchors,
) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const following = anchors.beforeCardId
    ? byId.get(anchors.beforeCardId) ?? null
    : null;
  const preceding = anchors.afterCardId
    ? byId.get(anchors.afterCardId) ?? null
    : null;
  if (following && following.stage !== stage) {
    throw new Error("The before-card anchor is in another column.");
  }
  if (preceding && preceding.stage !== stage) {
    throw new Error("The after-card anchor is in another column.");
  }
  if (anchors.beforeCardId && !following) {
    throw new Error("Unknown before-card anchor.");
  }
  if (anchors.afterCardId && !preceding) {
    throw new Error("Unknown after-card anchor.");
  }
  return betweenPositions(
    preceding?.sortPosition ?? null,
    following?.sortPosition ?? null,
  );
}

export type KanbanReorderInput = {
  cardId: string;
  targetStage: KanbanStage;
  /** Visible target-column IDs in their current display order. */
  visibleCardIds: readonly string[];
  /** Insertion index after removing cardId from visibleCardIds. */
  targetIndex: number;
};

export type KanbanCardPositionUpdate = {
  cardId: string;
  stage: KanbanStage;
  sortPosition: number;
};

export type KanbanReorderResult = {
  cards: KanbanCard[];
  updates: KanbanCardPositionUpdate[];
  rebalanced: boolean;
};

function needsRebalance(cards: readonly KanbanCard[]) {
  const positions = new Set<number>();
  for (const card of cards) {
    if (!Number.isFinite(card.sortPosition) || positions.has(card.sortPosition)) {
      return true;
    }
    positions.add(card.sortPosition);
  }
  return false;
}

function applyUpdates(
  cards: readonly KanbanCard[],
  updates: ReadonlyMap<string, KanbanCardPositionUpdate>,
) {
  return cards.map((card) => {
    const update = updates.get(card.id);
    return update
      ? { ...card, stage: update.stage, sortPosition: update.sortPosition }
      : card;
  });
}

export function rebalanceKanbanCardPositions(
  cards: readonly KanbanCard[],
  stage: KanbanStage,
) {
  const updates = new Map<string, KanbanCardPositionUpdate>();
  sortKanbanCards(cards, stage).forEach((card, index) => {
    updates.set(card.id, {
      cardId: card.id,
      stage,
      sortPosition: (index + 1) * KANBAN_POSITION_SPACING,
    });
  });
  return {
    cards: applyUpdates(cards, updates),
    updates: [...updates.values()],
  };
}

export function reorderKanbanCards(
  cards: readonly KanbanCard[],
  input: KanbanReorderInput,
): KanbanReorderResult {
  const moving = cards.find((card) => card.id === input.cardId);
  if (!moving) throw new Error("Cannot reorder an unknown Kanban card.");
  if (moving.deletedAt !== null || moving.archivedAt !== null) {
    throw new Error("Archived or deleted Kanban cards cannot be reordered.");
  }
  if (new Set(input.visibleCardIds).size !== input.visibleCardIds.length) {
    throw new Error("Visible card IDs must be unique.");
  }
  const byId = new Map(cards.map((card) => [card.id, card]));
  for (const id of input.visibleCardIds) {
    const card = byId.get(id);
    if (!card || card.stage !== input.targetStage) {
      throw new Error("A visible card does not belong to the target column.");
    }
  }
  if (
    moving.stage === input.targetStage &&
    !input.visibleCardIds.includes(moving.id)
  ) {
    throw new Error("The moved card must be visible in its current column.");
  }
  if (!Number.isFinite(input.targetIndex)) {
    throw new Error("The target index must be a finite number.");
  }

  let working = cards.slice();
  let rebalanced = false;
  const updates = new Map<string, KanbanCardPositionUpdate>();
  const targetCards = sortKanbanCards(working, input.targetStage);
  if (needsRebalance(targetCards)) {
    const balanced = rebalanceKanbanCardPositions(working, input.targetStage);
    working = balanced.cards;
    for (const update of balanced.updates) updates.set(update.cardId, update);
    rebalanced = true;
  }

  const remainingVisibleIds = input.visibleCardIds.filter(
    (id) => id !== moving.id,
  );
  const targetIndex = Math.max(
    0,
    Math.min(Math.trunc(input.targetIndex), remainingVisibleIds.length),
  );
  const desiredVisibleIds = remainingVisibleIds.slice();
  desiredVisibleIds.splice(targetIndex, 0, moving.id);
  if (moving.stage === input.targetStage) {
    const slots = input.visibleCardIds
      .map((id) => byId.get(id) as KanbanCard)
      .map((card) => {
        const current = working.find((candidate) => candidate.id === card.id);
        return (current as KanbanCard).sortPosition;
      })
      .sort((left, right) => left - right);
    desiredVisibleIds.forEach((cardId, index) => {
      const original = byId.get(cardId) as KanbanCard;
      if (original.sortPosition !== slots[index]) {
        updates.set(cardId, {
          cardId,
          stage: input.targetStage,
          sortPosition: slots[index],
        });
      }
    });
  } else {
    const sortedTarget = sortKanbanCards(working, input.targetStage);
    const previousVisibleId = remainingVisibleIds[targetIndex - 1] ?? null;
    const nextVisibleId = remainingVisibleIds[targetIndex] ?? null;
    let before: KanbanCard | null = null;
    let after: KanbanCard | null = null;
    if (nextVisibleId) {
      const nextIndex = sortedTarget.findIndex((card) => card.id === nextVisibleId);
      after = sortedTarget[nextIndex] ?? null;
      before = sortedTarget[nextIndex - 1] ?? null;
    } else if (previousVisibleId) {
      const previousIndex = sortedTarget.findIndex(
        (card) => card.id === previousVisibleId,
      );
      before = sortedTarget[previousIndex] ?? null;
      after = sortedTarget[previousIndex + 1] ?? null;
    } else {
      before = sortedTarget[sortedTarget.length - 1] ?? null;
    }
    let position = betweenPositions(
      before?.sortPosition ?? null,
      after?.sortPosition ?? null,
    );
    if (position === null || !Number.isFinite(position)) {
      const balanced = rebalanceKanbanCardPositions(working, input.targetStage);
      working = balanced.cards;
      rebalanced = true;
      for (const update of balanced.updates) updates.set(update.cardId, update);
      const refreshedBefore = before
        ? working.find((card) => card.id === before?.id) ?? null
        : null;
      const refreshedAfter = after
        ? working.find((card) => card.id === after?.id) ?? null
        : null;
      position = betweenPositions(
        refreshedBefore?.sortPosition ?? null,
        refreshedAfter?.sortPosition ?? null,
      );
    }
    if (position === null) throw new Error("Unable to allocate a card position.");
    updates.set(moving.id, {
      cardId: moving.id,
      stage: input.targetStage,
      sortPosition: position,
    });
  }

  const resultCards = applyUpdates(working, updates);
  const effectiveUpdates = [...updates.values()]
    .filter((update) => {
      const original = cards.find((card) => card.id === update.cardId);
      return (
        !original ||
        original.stage !== update.stage ||
        original.sortPosition !== update.sortPosition
      );
    })
    .sort((left, right) =>
      lexicalCompare(left.stage, right.stage) ||
      left.sortPosition - right.sortPosition ||
      lexicalCompare(left.cardId, right.cardId),
    );
  return { cards: resultCards, updates: effectiveUpdates, rebalanced };
}
