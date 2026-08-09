import { describe, expect, it } from "vitest";
import {
  DEFAULT_KANBAN_FILTER_STATE,
  calculateCardPosition,
  canTransitionCard,
  deriveCardCapabilities,
  deriveCardTransition,
  executionFacets,
  filterKanbanCards,
  groupKanbanCards,
  isExecutionActive,
  isExecutionConfigurationLocked,
  isExecutionFinished,
  isExecutionResumable,
  isExecutionWaiting,
  rebalanceKanbanCardPositions,
  reorderKanbanCards,
  sortKanbanCards,
  type KanbanCard,
  type KanbanExecutionState,
  type KanbanFilterState,
} from "./domain";

function card(overrides: Partial<KanbanCard> = {}): KanbanCard {
  return {
    id: "card-a",
    workspaceId: 3,
    chatId: 11,
    title: "Add search",
    description: "Implement fuzzy repository search",
    config: {
      accountId: 7,
      accessMode: "ask-for-approval",
      model: "gpt-5",
      reasoningLevel: "high",
      repositoryScope: "selected",
      repositories: [
        {
          repositoryPath: "/workspace/api",
          relativePath: "api",
          label: "API",
        },
      ],
    },
    stage: "todo",
    sortPosition: 1_024,
    executionState: "idle",
    reviewState: "none",
    currentAttemptId: null,
    stateVersion: 1,
    archivedAt: null,
    deletedAt: null,
    approvedAt: null,
    lastError: null,
    createdAt: "2026-08-02T10:00:00.000Z",
    updatedAt: "2026-08-02T10:00:00.000Z",
    ...overrides,
  };
}

function filters(overrides: Partial<KanbanFilterState>): KanbanFilterState {
  return { ...DEFAULT_KANBAN_FILTER_STATE, ...overrides };
}

describe("Kanban execution state helpers", () => {
  it.each([
    ["idle", false, false, false, false],
    ["starting", true, false, false, true],
    ["running", true, false, false, true],
    ["waiting_user", true, true, false, true],
    ["waiting_approval", true, true, false, true],
    ["paused", false, false, true, true],
    ["blocked", false, false, true, true],
    ["interrupted", false, false, true, false],
    ["failed", false, false, false, false],
    ["stopped", false, false, false, false],
    ["completed", false, false, false, false],
  ] satisfies Array<[
    KanbanExecutionState,
    boolean,
    boolean,
    boolean,
    boolean,
  ]>)(
    "classifies %s consistently",
    (state, active, waiting, resumable, locked) => {
      expect(isExecutionActive(state)).toBe(active);
      expect(isExecutionWaiting(state)).toBe(waiting);
      expect(isExecutionResumable(state)).toBe(resumable);
      expect(isExecutionConfigurationLocked(state)).toBe(locked);
    },
  );

  it("classifies finished states and overlapping attention facets", () => {
    expect(isExecutionFinished("completed")).toBe(true);
    expect(isExecutionFinished("failed")).toBe(true);
    expect(isExecutionFinished("stopped")).toBe(true);
    expect(isExecutionFinished("interrupted")).toBe(false);
    expect(executionFacets("waiting_user")).toEqual(["active", "waiting"]);
    expect(executionFacets("blocked")).toEqual(["blocked"]);
  });
});

describe("deriveCardCapabilities", () => {
  it("offers only lifecycle-valid controls for an idle To do card", () => {
    const capabilities = deriveCardCapabilities(card());

    expect(capabilities.start.enabled).toBe(true);
    expect(capabilities.edit.enabled).toBe(true);
    expect(capabilities.duplicate.enabled).toBe(true);
    expect(capabilities.pause.enabled).toBe(false);
    expect(capabilities.commit.enabled).toBe(false);
    expect(capabilities.archive).toMatchObject({
      enabled: true,
      requiresConfirmation: true,
    });
  });

  it("locks mutations while running", () => {
    const capabilities = deriveCardCapabilities(
      card({
        stage: "in_progress",
        executionState: "running",
        currentAttemptId: "attempt-1",
      }),
    );

    expect(capabilities.pause.enabled).toBe(true);
    expect(capabilities.stop).toMatchObject({
      enabled: true,
      requiresConfirmation: true,
    });
    expect(capabilities.edit.enabled).toBe(false);
    expect(capabilities.archive.enabled).toBe(false);
    expect(capabilities.delete.enabled).toBe(false);
    expect(capabilities.duplicate.enabled).toBe(true);
  });

  it("routes waiting states to their matching response control", () => {
    const waitingUser = deriveCardCapabilities(
      card({ stage: "in_progress", executionState: "waiting_user" }),
    );
    const waitingApproval = deriveCardCapabilities(
      card({ stage: "in_progress", executionState: "waiting_approval" }),
    );

    expect(waitingUser.respond_to_user.enabled).toBe(true);
    expect(waitingUser.resolve_approval.enabled).toBe(false);
    expect(waitingApproval.respond_to_user.enabled).toBe(false);
    expect(waitingApproval.resolve_approval.enabled).toBe(true);
  });

  it("allows an interrupted attempt to be explicitly stopped", () => {
    const capabilities = deriveCardCapabilities(
      card({
        stage: "in_progress",
        executionState: "interrupted",
        currentAttemptId: "attempt-1",
      }),
    );

    expect(capabilities.stop).toMatchObject({
      enabled: true,
      requiresConfirmation: true,
    });
    expect(capabilities.resume.enabled).toBe(true);
  });

  it("uses GitHub pull requests as the review authority", () => {
    const capabilities = deriveCardCapabilities(
      card({
        stage: "in_review",
        executionState: "completed",
        reviewState: "awaiting_review",
        pullRequests: [
          {
            sourceRepositoryPath: "/workspace/repo",
            relativePath: "repo",
            owner: "owner",
            repository: "repo",
            number: 12,
            url: "https://github.com/owner/repo/pull/12",
            baseBranch: "main",
            headBranch: "codex/card",
            draft: true,
            state: "open",
            publicationStatus: "draft",
            error: null,
            updatedAt: "2026-08-09T12:00:00Z",
          },
        ],
      }),
    );

    expect(capabilities.open_pull_request.enabled).toBe(true);
    expect(capabilities.commit.enabled).toBe(false);
    expect(capabilities.commit_and_push.enabled).toBe(false);
    expect(capabilities.merge.enabled).toBe(false);
    expect(capabilities.request_changes.enabled).toBe(false);
    expect(capabilities.approve_result.enabled).toBe(false);
  });

  it("restricts archived and deleted cards", () => {
    const archived = deriveCardCapabilities(
      card({ archivedAt: "2026-08-02T11:00:00.000Z" }),
    );
    const deleted = deriveCardCapabilities(
      card({ deletedAt: "2026-08-02T11:00:00.000Z" }),
    );

    expect(archived.restore.enabled).toBe(true);
    expect(archived.start.enabled).toBe(false);
    expect(deleted.duplicate.enabled).toBe(false);
  });
});

describe("Kanban lifecycle transitions", () => {
  it("starts once when an idle card is dragged into In progress", () => {
    expect(deriveCardTransition(card(), "in_progress")).toEqual({
      allowed: true,
      action: "start",
      requiresConfirmation: false,
      reason: null,
    });
    expect(canTransitionCard(card(), "in_progress", "start")).toBe(true);
    expect(canTransitionCard(card({ executionState: "running" }), "in_progress"))
      .toBe(false);
  });

  it("requires stop-and-move confirmation before an active card leaves In progress", () => {
    const running = card({
      stage: "in_progress",
      executionState: "running",
      currentAttemptId: "attempt-1",
    });

    expect(deriveCardTransition(running, "todo")).toMatchObject({
      allowed: true,
      action: "stop_and_move",
      requiresConfirmation: true,
    });
    expect(canTransitionCard(running, "in_review", "stop_and_move")).toBe(true);
    expect(canTransitionCard(running, "done", "stop_and_move")).toBe(false);
  });

  it("moves successful work to review but never directly to Done", () => {
    const completed = card({
      stage: "in_progress",
      executionState: "completed",
      reviewState: "awaiting_review",
    });

    expect(canTransitionCard(completed, "in_review", "run_completed")).toBe(true);
    expect(
      canTransitionCard(
        card({ stage: "in_progress", executionState: "running" }),
        "in_review",
        "run_completed",
      ),
    ).toBe(true);
    expect(canTransitionCard(completed, "done")).toBe(false);
  });

  it("matches native direct-move recovery states", () => {
    expect(
      canTransitionCard(
        card({ stage: "in_progress", executionState: "failed" }),
        "todo",
      ),
    ).toBe(true);
    expect(
      canTransitionCard(
        card({ stage: "in_progress", executionState: "interrupted" }),
        "todo",
      ),
    ).toBe(true);
    expect(
      canTransitionCard(
        card({ stage: "in_progress", executionState: "idle" }),
        "todo",
      ),
    ).toBe(false);
    expect(
      canTransitionCard(
        card({ stage: "in_progress", executionState: "completed" }),
        "todo",
      ),
    ).toBe(false);
    expect(
      canTransitionCard(
        card({ stage: "in_progress", executionState: "stopped" }),
        "in_review",
      ),
    ).toBe(true);
  });

  it("prevents local review transitions while GitHub owns review", () => {
    const review = card({
      stage: "in_review",
      executionState: "completed",
      reviewState: "awaiting_review",
    });

    expect(deriveCardTransition(review, "in_progress").allowed).toBe(false);
    expect(deriveCardTransition(review, "done").allowed).toBe(false);
    expect(canTransitionCard(review, "done", "approve_result")).toBe(false);
  });

  it("only reopens an approved Done card into review", () => {
    const approved = card({
      stage: "done",
      executionState: "completed",
      reviewState: "approved",
    });

    expect(deriveCardTransition(approved, "in_review").action).toBe(
      "reopen_review",
    );
    expect(canTransitionCard(approved, "todo")).toBe(false);
  });

  it("allows same-column reordering without affecting a live attempt", () => {
    const running = card({
      stage: "in_progress",
      executionState: "running",
    });
    expect(deriveCardTransition(running, "in_progress")).toMatchObject({
      allowed: true,
      action: "none",
    });
  });
});

describe("filterKanbanCards", () => {
  const api = card({ id: "api" });
  const web = card({
    id: "web",
    title: "Polish dashboard",
    description: "Update the React layout",
    executionState: "waiting_approval",
    config: {
      accountId: null,
      accessMode: "full-access",
      model: null,
      reasoningLevel: null,
      repositoryScope: "selected",
      repositories: [
        {
          repositoryPath: "/workspace/web",
          relativePath: "web",
          label: "Web",
        },
      ],
    },
  });
  const allRepositories = card({
    id: "all",
    title: "Cross repo release",
    config: {
      ...card().config,
      repositoryScope: "all",
      repositories: [],
    },
  });

  it("searches title and description using order-independent tokens", () => {
    expect(
      filterKanbanCards([api, web], filters({ search: "repository ADD" })).map(
        (item) => item.id,
      ),
    ).toEqual(["api"]);
  });

  it("ORs values within a dimension and ANDs separate dimensions", () => {
    expect(
      filterKanbanCards(
        [api, web],
        filters({
          accountIds: [7, null],
          accessModes: ["full-access"],
          executionStates: ["waiting_approval"],
        }),
      ).map((item) => item.id),
    ).toEqual(["web"]);
  });

  it("matches all-repository cards against any repository filter", () => {
    expect(
      filterKanbanCards(
        [api, web, allRepositories],
        filters({ repositoryPaths: ["/workspace/web"] }),
      ).map((item) => item.id),
    ).toEqual(["web", "all"]);
  });

  it("supports overlapping active/waiting facets", () => {
    expect(
      filterKanbanCards(
        [api, web],
        filters({ executionFacets: ["active"] }),
      ).map((item) => item.id),
    ).toEqual(["web"]);
    expect(
      filterKanbanCards(
        [api, web],
        filters({ executionFacets: ["waiting"] }),
      ).map((item) => item.id),
    ).toEqual(["web"]);
  });

  it("separates active and archived visibility and always removes deleted cards", () => {
    const archived = card({ id: "archived", archivedAt: "2026-08-02" });
    const deleted = card({ id: "deleted", deletedAt: "2026-08-02" });

    expect(filterKanbanCards([api, archived, deleted], filters({}))).toEqual([
      api,
    ]);
    expect(
      filterKanbanCards(
        [api, archived, deleted],
        filters({ visibility: "archived" }),
      ),
    ).toEqual([archived]);
  });
});

describe("groupKanbanCards", () => {
  it("groups all, single, and multi-repository cards exactly once", () => {
    const cards = [
      card({
        id: "all",
        config: {
          ...card().config,
          repositoryScope: "all",
          repositories: [],
        },
      }),
      card({ id: "api" }),
      card({
        id: "multi",
        config: {
          ...card().config,
          repositories: [
            ...card().config.repositories,
            {
              repositoryPath: "/workspace/web",
              relativePath: "web",
              label: "Web",
            },
          ],
        },
      }),
    ];
    const groups = groupKanbanCards(cards, "repository");

    expect(groups.map((group) => group.label)).toEqual([
      "API",
      "All repositories",
      "Multiple repositories",
    ]);
    expect(groups.flatMap((group) => group.cards).map((item) => item.id).sort())
      .toEqual(["all", "api", "multi"]);
  });

  it("uses supplied display labels without changing stable group keys", () => {
    const groups = groupKanbanCards([card()], "account", {
      accounts: { 7: "Work account" },
    });
    expect(groups[0]).toMatchObject({
      key: "account:7",
      label: "Work account",
    });
  });

  it("assigns every execution state to one non-duplicating facet group", () => {
    const groups = groupKanbanCards(
      [
        card({ id: "running", executionState: "running" }),
        card({ id: "waiting", executionState: "waiting_user" }),
        card({ id: "failed", executionState: "failed" }),
      ],
      "execution_facet",
    );
    expect(groups.map((group) => group.label)).toEqual([
      "Active",
      "Failed",
      "Waiting",
    ]);
    expect(groups.flatMap((group) => group.cards)).toHaveLength(3);
  });
});

describe("Kanban ordering", () => {
  it("sorts by position and then ID without mutating input", () => {
    const input = [
      card({ id: "b", sortPosition: 1_024 }),
      card({ id: "c", sortPosition: Number.NaN }),
      card({ id: "a", sortPosition: 1_024 }),
    ];

    expect(sortKanbanCards(input).map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(input.map((item) => item.id)).toEqual(["b", "c", "a"]);
  });

  it("calculates positions from explicit neighboring anchors", () => {
    const cards = [
      card({ id: "a", sortPosition: 1_024 }),
      card({ id: "b", sortPosition: 3_072 }),
    ];
    expect(
      calculateCardPosition(cards, "todo", {
        beforeCardId: "b",
        afterCardId: "a",
      }),
    ).toBe(2_048);
    expect(
      calculateCardPosition(cards, "todo", { afterCardId: "a" }),
    ).toBe(2_048);
    expect(
      calculateCardPosition(cards, "todo", { beforeCardId: "a" }),
    ).toBe(0);
    expect(() =>
      calculateCardPosition(cards, "done", { beforeCardId: "a" }),
    ).toThrow(/another column/);
  });

  it("reorders visible cards through existing slots while hidden cards stay anchored", () => {
    const cards = [
      card({ id: "visible-a", sortPosition: 1_024 }),
      card({ id: "hidden", sortPosition: 2_048 }),
      card({ id: "visible-b", sortPosition: 3_072 }),
    ];
    const result = reorderKanbanCards(cards, {
      cardId: "visible-b",
      targetStage: "todo",
      visibleCardIds: ["visible-a", "visible-b"],
      targetIndex: 0,
    });

    expect(sortKanbanCards(result.cards, "todo").map((item) => item.id)).toEqual([
      "visible-b",
      "hidden",
      "visible-a",
    ]);
    expect(result.cards.find((item) => item.id === "hidden")?.sortPosition).toBe(
      2_048,
    );
    expect(result.updates.map((update) => update.cardId).sort()).toEqual([
      "visible-a",
      "visible-b",
    ]);
  });

  it("inserts a cross-column card next to a visible anchor without moving hidden cards", () => {
    const cards = [
      card({ id: "moving", stage: "todo", sortPosition: 1_024 }),
      card({ id: "hidden", stage: "in_progress", sortPosition: 1_024 }),
      card({ id: "visible", stage: "in_progress", sortPosition: 3_072 }),
    ];
    const result = reorderKanbanCards(cards, {
      cardId: "moving",
      targetStage: "in_progress",
      visibleCardIds: ["visible"],
      targetIndex: 0,
    });

    expect(
      sortKanbanCards(result.cards, "in_progress").map((item) => item.id),
    ).toEqual(["hidden", "moving", "visible"]);
    expect(result.cards.find((item) => item.id === "hidden")?.sortPosition).toBe(
      1_024,
    );
    expect(result.updates).toContainEqual({
      cardId: "moving",
      stage: "in_progress",
      sortPosition: 2_048,
    });
  });

  it("appends after hidden cards when a filtered column appears empty", () => {
    const result = reorderKanbanCards(
      [
        card({ id: "moving", stage: "todo" }),
        card({ id: "hidden", stage: "in_review", sortPosition: 2_048 }),
      ],
      {
        cardId: "moving",
        targetStage: "in_review",
        visibleCardIds: [],
        targetIndex: 0,
      },
    );

    expect(
      sortKanbanCards(result.cards, "in_review").map((item) => item.id),
    ).toEqual(["hidden", "moving"]);
  });

  it("rebalances duplicate positions deterministically before reordering", () => {
    const cards = [
      card({ id: "a", sortPosition: 10 }),
      card({ id: "b", sortPosition: 10 }),
      card({ id: "c", sortPosition: 10 }),
    ];
    const result = reorderKanbanCards(cards, {
      cardId: "c",
      targetStage: "todo",
      visibleCardIds: ["a", "b", "c"],
      targetIndex: 0,
    });

    expect(result.rebalanced).toBe(true);
    expect(sortKanbanCards(result.cards).map((item) => item.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(new Set(result.cards.map((item) => item.sortPosition)).size).toBe(3);
  });

  it("provides an explicit full-column rebalance and rejects invalid visibility", () => {
    const balanced = rebalanceKanbanCardPositions(
      [
        card({ id: "b", sortPosition: 100 }),
        card({ id: "a", sortPosition: 50 }),
      ],
      "todo",
    );
    expect(sortKanbanCards(balanced.cards).map((item) => item.sortPosition)).toEqual([
      1_024,
      2_048,
    ]);
    expect(() =>
      reorderKanbanCards(balanced.cards, {
        cardId: "a",
        targetStage: "todo",
        visibleCardIds: ["unknown"],
        targetIndex: 0,
      }),
    ).toThrow(/does not belong/);
    expect(() =>
      reorderKanbanCards(balanced.cards, {
        cardId: "a",
        targetStage: "todo",
        visibleCardIds: ["a", "b"],
        targetIndex: Number.NaN,
      }),
    ).toThrow(/finite/);
  });
});
