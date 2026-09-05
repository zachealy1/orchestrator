import { describe, expect, it } from "vitest";
import {
  DEFAULT_KANBAN_FILTER_STATE,
  deriveCardCapabilities,
  deriveCardTransition,
  executionFacets,
  filterKanbanCards,
  groupKanbanCards,
  isExecutionActive,
  isExecutionConfigurationLocked,
  isExecutionResumable,
  isExecutionWaiting,
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
    hasStartedTurn: false,
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

  it("classifies overlapping attention facets", () => {
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

  it("offers local review for a completed disconnected card", () => {
    const capabilities = deriveCardCapabilities(
      card({
        stage: "in_review",
        executionState: "completed",
        reviewState: "awaiting_review",
        reviewChannel: "local",
      }),
    );

    expect(capabilities.review_changes.enabled).toBe(true);
    expect(capabilities.open_pull_request.enabled).toBe(false);
    expect(capabilities.merge.enabled).toBe(false);
  });

  it("offers local review after GitHub publication fails before creating a pull request", () => {
    const capabilities = deriveCardCapabilities(
      card({
        stage: "in_review",
        executionState: "completed",
        reviewState: "awaiting_review",
        reviewChannel: "github",
        pullRequests: [
          {
            sourceRepositoryPath: "/workspace/api",
            relativePath: "api",
            owner: "example",
            repository: "api",
            number: null,
            url: null,
            baseBranch: "main",
            headBranch: "codex/add-search",
            draft: false,
            state: "open",
            publicationStatus: "failed",
            error: "Commit message generation failed",
            updatedAt: "2026-08-19T14:24:07Z",
          },
        ],
      }),
    );

    expect(capabilities.retry_publication.enabled).toBe(true);
    expect(capabilities.review_locally.enabled).toBe(true);
    expect(capabilities.review_changes.enabled).toBe(false);
  });

  it("does not offer local review when any GitHub pull request exists", () => {
    const capabilities = deriveCardCapabilities(
      card({
        stage: "in_review",
        executionState: "completed",
        reviewState: "awaiting_review",
        reviewChannel: "github",
        pullRequests: [
          {
            sourceRepositoryPath: "/workspace/api",
            relativePath: "api",
            owner: "example",
            repository: "api",
            number: 42,
            url: "https://github.com/example/api/pull/42",
            baseBranch: "main",
            headBranch: "codex/add-search",
            draft: true,
            state: "open",
            publicationStatus: "draft",
            error: null,
            updatedAt: "2026-08-19T14:24:07Z",
          },
        ],
      }),
    );

    expect(capabilities.review_locally.enabled).toBe(false);
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
    expect(deriveCardTransition(card(), "in_progress", "start").allowed).toBe(true);
    expect(
      deriveCardTransition(card({ executionState: "running" }), "in_progress")
        .allowed,
    ).toBe(false);
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
    expect(
      deriveCardTransition(running, "in_review", "stop_and_move").allowed,
    ).toBe(true);
    expect(deriveCardTransition(running, "done", "stop_and_move").allowed).toBe(
      false,
    );
  });

  it("moves successful work to review but never directly to Done", () => {
    const completed = card({
      stage: "in_progress",
      executionState: "completed",
      reviewState: "awaiting_review",
    });

    expect(
      deriveCardTransition(completed, "in_review", "run_completed").allowed,
    ).toBe(true);
    expect(
      deriveCardTransition(
        card({ stage: "in_progress", executionState: "running" }),
        "in_review",
        "run_completed",
      ).allowed,
    ).toBe(true);
    expect(deriveCardTransition(completed, "done").allowed).toBe(false);
  });

  it("matches native direct-move recovery states", () => {
    expect(
      deriveCardTransition(
        card({ stage: "in_progress", executionState: "failed" }),
        "todo",
      ).allowed,
    ).toBe(true);
    expect(
      deriveCardTransition(
        card({ stage: "in_progress", executionState: "interrupted" }),
        "todo",
      ).allowed,
    ).toBe(true);
    expect(
      deriveCardTransition(
        card({ stage: "in_progress", executionState: "idle" }),
        "todo",
      ).allowed,
    ).toBe(false);
    expect(
      deriveCardTransition(
        card({ stage: "in_progress", executionState: "completed" }),
        "todo",
      ).allowed,
    ).toBe(false);
    expect(
      deriveCardTransition(
        card({ stage: "in_progress", executionState: "stopped" }),
        "in_review",
      ).allowed,
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
    expect(deriveCardTransition(review, "done", "approve_result").allowed).toBe(
      false,
    );
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
    expect(deriveCardTransition(approved, "todo").allowed).toBe(false);
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

});
