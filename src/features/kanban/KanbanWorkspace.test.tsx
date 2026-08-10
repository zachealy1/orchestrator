import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Workspace } from "../workspaces/types";
import type { GithubConnectionStatus } from "../github/api";
import type {
  KanbanBoardSnapshotRecord,
  KanbanCardRecord,
  KanbanGitBinding,
  KanbanGitCleanupResult,
} from "./api";
import { KanbanWorkspace } from "./KanbanWorkspace";

const apiMocks = vi.hoisted(() => ({
  approveKanbanCard: vi.fn(),
  archiveKanbanCard: vi.fn(),
  cleanupKanbanGit: vi.fn(),
  commitKanbanGit: vi.fn(),
  createKanbanCard: vi.fn(),
  deleteKanbanCard: vi.fn(),
  loadKanbanBoard: vi.fn(),
  loadKanbanGitBindings: vi.fn(),
  mergeKanbanGit: vi.fn(),
  moveKanbanCard: vi.fn(),
  pushKanbanGit: vi.fn(),
  reconcileKanbanGit: vi.fn(),
  reopenKanbanCard: vi.fn(),
  saveKanbanGitBindings: vi.fn(),
  saveKanbanInheritedContext: vi.fn(),
  saveKanbanPreferences: vi.fn(),
  updateKanbanCard: vi.fn(),
}));
const transcriptMocks = vi.hoisted(() => ({
  listLocalChatTranscript: vi.fn(),
}));
const githubMocks = vi.hoisted(() => ({
  completeKanbanWithoutPullRequest: vi.fn(),
  openPullRequest: vi.fn(),
  publishKanbanCard: vi.fn(),
  syncKanbanPullRequests: vi.fn(),
}));

vi.mock("./api", () => apiMocks);
vi.mock("../github/api", () => githubMocks);
const workspace: Workspace = {
  id: 1,
  path: "/workspace",
  label: "Workspace",
  default_account_id: null,
  selected_git_repository_path: null,
  last_opened_at: "2026-08-02T10:00:00Z",
  created_at: "2026-08-02T10:00:00Z",
};

function card(overrides: Partial<KanbanCardRecord> = {}): KanbanCardRecord {
  return {
    id: "card-1",
    workspaceId: workspace.id,
    chatId: 11,
    title: "Controller card",
    description: "Exercise the Kanban controller",
    accountId: null,
    accessMode: "ask-for-approval",
    model: null,
    reasoningLevel: null,
    repositoryScope: "selected",
    stage: "in_review",
    sortPosition: 1024,
    executionState: "completed",
    reviewState: "awaiting_review",
    currentAttemptId: "attempt-1",
    stateVersion: 4,
    archivedAt: null,
    deletedAt: null,
    approvedAt: null,
    lastError: null,
    hasInheritedContext: false,
    hasStartedTurn: true,
    createdAt: "2026-08-02T10:00:00Z",
    updatedAt: "2026-08-02T10:01:00Z",
    repositories: [
      {
        repositoryPath: "/workspace/repo",
        relativePath: "repo",
        label: "repo",
        includeDirtyChanges: false,
      },
    ],
    ...overrides,
  };
}

function binding(overrides: Partial<KanbanGitBinding> = {}): KanbanGitBinding {
  return {
    sourceRepositoryPath: "/workspace/repo",
    relativePath: "repo",
    executionRoot: "/workspace/.codex/card-1",
    sourceBranch: "main",
    baseBranch: "main",
    baseCommit: "base-commit",
    cardBranch: "codex/card-1",
    worktreePath: "/workspace/.codex/card-1/repo",
    status: "ready",
    error: null,
    ...overrides,
  };
}

function snapshot(
  cards: KanbanCardRecord[],
  revision = 1,
): KanbanBoardSnapshotRecord {
  return {
    workspaceId: workspace.id,
    revision,
    preferencesJson: JSON.stringify({
      search: "",
      filters: {},
      groupBy: "none",
      columnOrder: ["todo", "in_progress", "in_review", "done"],
    }),
    columns: [
      { key: "todo", position: 0 },
      { key: "in_progress", position: 1 },
      { key: "in_review", position: 2 },
      { key: "done", position: 3 },
    ],
    cards,
  };
}

function renderWorkspace(
  toolbarHost?: HTMLElement | null,
  githubConnection: GithubConnectionStatus = {
    available: true,
    connected: true,
    login: "octocat",
    displayName: "Octocat",
    avatarUrl: null,
    status: "connected",
    message: null,
    repositories: [],
  },
) {
  const props = {
    onLaunch: vi.fn().mockResolvedValue(undefined),
    onPause: vi.fn().mockResolvedValue(undefined),
    onStop: vi.fn().mockResolvedValue(undefined),
    onOpenConversation: vi.fn().mockResolvedValue(undefined),
    onConnectGithub: vi.fn(),
  };

  render(
    <KanbanWorkspace
      workspace={workspace}
      repositories={[]}
      accounts={[]}
      models={[]}
      refreshToken={0}
      listChatTranscript={transcriptMocks.listLocalChatTranscript}
      githubConnection={githubConnection}
      githubConnectionPending={false}
      toolbarHost={toolbarHost}
      {...props}
    />,
  );

  return props;
}

async function confirmDeleteWithWorktreeCleanup(
  user: ReturnType<typeof userEvent.setup>,
) {
  const tile = await screen.findByRole("article", { name: /Controller card/ });
  await user.click(within(tile).getByLabelText("Actions for Controller card"));
  await user.click(screen.getByRole("menuitem", { name: "Delete card" }));

  const dialog = await screen.findByRole("alertdialog", {
    name: "Delete Controller card?",
  });
  await user.click(
    within(dialog).getByRole("checkbox", {
      name: /Remove isolated worktrees/,
    }),
  );
  await user.click(within(dialog).getByRole("button", { name: "Delete card" }));
  return dialog;
}

beforeEach(() => {
  vi.resetAllMocks();
  githubMocks.syncKanbanPullRequests.mockResolvedValue(0);
  githubMocks.publishKanbanCard.mockResolvedValue({ cardId: "card-1", pullRequests: [] });
  githubMocks.openPullRequest.mockResolvedValue(undefined);
  githubMocks.completeKanbanWithoutPullRequest.mockResolvedValue(undefined);
  transcriptMocks.listLocalChatTranscript.mockResolvedValue([]);
  const initialCard = card();
  const initialBinding = binding();
  const initialSnapshot = snapshot([initialCard]);

  apiMocks.loadKanbanBoard.mockResolvedValue(initialSnapshot);
  apiMocks.loadKanbanGitBindings.mockResolvedValue([initialBinding]);
  apiMocks.reconcileKanbanGit.mockImplementation(
    async (gitBinding: KanbanGitBinding) => ({
      binding: gitBinding,
      sourceAvailable: true,
      worktreeAvailable: true,
      branchAvailable: true,
      branchMatches: true,
      baseBranchHead: gitBinding.baseCommit,
      headCommit: gitBinding.baseCommit,
      targetMoved: false,
      hasChanges: false,
      hasConflicts: false,
    }),
  );
  apiMocks.saveKanbanGitBindings.mockResolvedValue([initialBinding]);
  apiMocks.deleteKanbanCard.mockResolvedValue(undefined);
  apiMocks.saveKanbanPreferences.mockResolvedValue(initialSnapshot);
});

describe("KanbanWorkspace controller", () => {
  it("warns disconnected users and starts GitHub connection from Kanban", async () => {
    const user = userEvent.setup();
    const callbacks = renderWorkspace(undefined, {
      available: true,
      connected: false,
      login: null,
      displayName: null,
      avatarUrl: null,
      status: "disconnected",
      message: null,
      repositories: [],
    });

    const warning = await screen.findByTestId("kanban-github-warning");
    expect(warning).toHaveTextContent("GitHub not connected");
    expect(warning).toHaveTextContent(
      "Connect GitHub to publish completed cards as draft pull requests.",
    );

    await user.click(within(warning).getByRole("button", { name: "Connect GitHub" }));
    expect(callbacks.onConnectGithub).toHaveBeenCalledTimes(1);
  });

  it("does not show the GitHub warning when connected", async () => {
    renderWorkspace();

    expect(await screen.findByText("Controller card")).toBeInTheDocument();
    expect(screen.queryByTestId("kanban-github-warning")).not.toBeInTheDocument();
  });

  it("renders the board controls in the provided workspace-header host", async () => {
    const toolbarHost = document.createElement("div");
    toolbarHost.dataset.testid = "kanban-toolbar-host";
    document.body.append(toolbarHost);

    renderWorkspace(toolbarHost);

    const toolbar = await screen.findByRole("toolbar", {
      name: "Kanban controls",
    });
    expect(toolbarHost).toContainElement(toolbar);
    expect(screen.getByPlaceholderText("Search cards")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New card" })).not.toBeInTheDocument();

    toolbarHost.remove();
  });

  it.each(["blocked", "partial"] as const)(
    "persists a fulfilled %s cleanup result and keeps the card",
    async (cleanupStatus) => {
      const user = userEvent.setup();
      const persisted = card();
      const originalBinding = binding();
      const partialBinding = binding({
        status: "cleanupRequired",
        error: {
          repositoryPath: "/workspace/repo",
          code: "cleanup_incomplete",
          message: "The worktree still contains local changes.",
          cleanupRequired: true,
        },
      });
      const cleanupResult: KanbanGitCleanupResult = {
        binding: partialBinding,
        status: cleanupStatus,
        worktreeRemoved: false,
        branchDeleted: false,
        executionRootRemoved: false,
        errors: [partialBinding.error!],
      };

      apiMocks.loadKanbanBoard.mockResolvedValue(snapshot([persisted]));
      apiMocks.loadKanbanGitBindings.mockResolvedValue([originalBinding]);
      apiMocks.cleanupKanbanGit.mockResolvedValue(cleanupResult);
      apiMocks.saveKanbanGitBindings.mockResolvedValue([partialBinding]);

      renderWorkspace();
      const dialog = await confirmDeleteWithWorktreeCleanup(user);

      await waitFor(() => {
        expect(apiMocks.saveKanbanGitBindings).toHaveBeenCalledWith(
          expect.objectContaining({ id: persisted.id, stateVersion: 4 }),
          [partialBinding],
        );
      });
      expect(apiMocks.deleteKanbanCard).not.toHaveBeenCalled();
      expect(
        within(dialog).getByRole("alert", {
          name: "",
        }),
      ).toHaveTextContent(/cleanup is incomplete.*card was kept for retry/i);
      expect(screen.getByRole("article", { name: /Controller card/ })).toBeInTheDocument();
    },
  );

  it("deletes after persisting a complete cleanup and reloading the refreshed card version", async () => {
    const user = userEvent.setup();
    const originalCard = card({ stateVersion: 4 });
    const refreshedCard = card({
      stateVersion: 5,
      updatedAt: "2026-08-02T10:02:00Z",
    });
    const originalBinding = binding();
    const cleanedBinding = binding({ status: "cleaned" });

    apiMocks.loadKanbanBoard
      .mockResolvedValueOnce(snapshot([originalCard], 1))
      .mockResolvedValueOnce(snapshot([refreshedCard], 2))
      .mockResolvedValueOnce(snapshot([], 3));
    apiMocks.loadKanbanGitBindings.mockResolvedValue([originalBinding]);
    apiMocks.cleanupKanbanGit.mockResolvedValue({
      binding: cleanedBinding,
      status: "cleaned",
      worktreeRemoved: true,
      branchDeleted: false,
      executionRootRemoved: true,
      errors: [],
    } satisfies KanbanGitCleanupResult);
    apiMocks.saveKanbanGitBindings.mockResolvedValue([cleanedBinding]);

    renderWorkspace();
    await confirmDeleteWithWorktreeCleanup(user);

    await waitFor(() => expect(apiMocks.deleteKanbanCard).toHaveBeenCalledTimes(1));
    expect(apiMocks.saveKanbanGitBindings).toHaveBeenCalledWith(
      expect.objectContaining({ id: originalCard.id, stateVersion: 4 }),
      [cleanedBinding],
    );
    expect(apiMocks.deleteKanbanCard).toHaveBeenCalledWith(
      expect.objectContaining({ id: refreshedCard.id, stateVersion: 5 }),
    );
    expect(apiMocks.saveKanbanGitBindings.mock.invocationCallOrder[0]).toBeLessThan(
      apiMocks.deleteKanbanCard.mock.invocationCallOrder[0],
    );
  });

  it("requires confirmation before stopping an active card", async () => {
    const user = userEvent.setup();
    const runningCard = card({
      stage: "in_progress",
      executionState: "running",
      reviewState: "none",
    });
    apiMocks.loadKanbanBoard.mockResolvedValue(snapshot([runningCard]));
    apiMocks.loadKanbanGitBindings.mockResolvedValue([binding()]);

    const callbacks = renderWorkspace();
    const tile = await screen.findByRole("article", { name: /Controller card/ });
    await user.click(within(tile).getByLabelText("Actions for Controller card"));
    await user.click(screen.getByRole("menuitem", { name: "Stop agent" }));

    expect(callbacks.onStop).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", {
      name: "Stop this agent?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Stop agent" }));
    await waitFor(() => expect(callbacks.onStop).toHaveBeenCalledTimes(1));
  });

  it("opens the card pull request from its action menu", async () => {
    const user = userEvent.setup();
    const reviewCard = card({
      pullRequests: [
        {
          sourceRepositoryPath: "/workspace/repo",
          relativePath: "repo",
          owner: "owner",
          repository: "repo",
          number: 12,
          url: "https://github.com/owner/repo/pull/12",
          baseBranch: "main",
          headBranch: "codex/controller-card",
          draft: true,
          state: "open",
          publicationStatus: "draft",
          error: null,
          updatedAt: "2026-08-09T12:00:00Z",
        },
      ],
    });
    apiMocks.loadKanbanBoard.mockResolvedValue(snapshot([reviewCard]));
    renderWorkspace();

    const tile = await screen.findByRole("article", { name: /Controller card/ });
    await user.click(within(tile).getByLabelText("Actions for Controller card"));
    await user.click(screen.getByRole("menuitem", { name: "Open pull request" }));
    expect(githubMocks.openPullRequest).toHaveBeenCalledWith(
      "https://github.com/owner/repo/pull/12",
    );
  });

  it("lets the user choose a repository when a card has multiple pull requests", async () => {
    const user = userEvent.setup();
    const reviewCard = card({
      pullRequests: [
        {
          sourceRepositoryPath: "/workspace/frontend",
          relativePath: "frontend",
          owner: "owner",
          repository: "frontend",
          number: 21,
          url: "https://github.com/owner/frontend/pull/21",
          baseBranch: "main",
          headBranch: "codex/controller-card",
          draft: true,
          state: "open",
          publicationStatus: "draft",
          error: null,
          updatedAt: "2026-08-09T12:00:00Z",
        },
        {
          sourceRepositoryPath: "/workspace/backend",
          relativePath: "backend",
          owner: "owner",
          repository: "backend",
          number: 34,
          url: "https://github.com/owner/backend/pull/34",
          baseBranch: "develop",
          headBranch: "codex/controller-card",
          draft: true,
          state: "open",
          publicationStatus: "draft",
          error: null,
          updatedAt: "2026-08-09T12:00:00Z",
        },
      ],
    });
    apiMocks.loadKanbanBoard.mockResolvedValue(snapshot([reviewCard]));
    renderWorkspace();

    const tile = await screen.findByRole("article", { name: /Controller card/ });
    await user.click(within(tile).getByLabelText("Actions for Controller card"));
    await user.click(screen.getByRole("menuitem", { name: "Open pull request" }));

    const chooser = screen.getByRole("dialog", { name: "Open pull request" });
    await user.click(within(chooser).getByRole("button", { name: /backend/ }));
    expect(githubMocks.openPullRequest).toHaveBeenCalledWith(
      "https://github.com/owner/backend/pull/34",
    );
    expect(screen.queryByRole("dialog", { name: "Open pull request" })).not.toBeInTheDocument();
  });

  it("offers retry when publication has failed", async () => {
    const user = userEvent.setup();
    const failedCard = card({
      pullRequests: [
        {
          sourceRepositoryPath: "/workspace/repo",
          relativePath: "repo",
          owner: null,
          repository: null,
          number: null,
          url: null,
          baseBranch: "main",
          headBranch: "codex/controller-card",
          draft: true,
          state: "open",
          publicationStatus: "failed",
          error: "Reconnect GitHub and retry.",
          updatedAt: "2026-08-09T12:00:00Z",
        },
      ],
    });
    apiMocks.loadKanbanBoard.mockResolvedValue(snapshot([failedCard]));
    renderWorkspace();

    const tile = await screen.findByRole("article", { name: /Controller card/ });
    await user.click(within(tile).getByLabelText("Actions for Controller card"));
    await user.click(screen.getByRole("menuitem", { name: "Retry publication" }));
    expect(githubMocks.publishKanbanCard).toHaveBeenCalledWith("card-1");
  });

  it("offers to clear active filters when the board has no matches", async () => {
    const user = userEvent.setup();
    const filteredSnapshot = snapshot([]);
    filteredSnapshot.preferencesJson = JSON.stringify({
      search: "missing card",
      filters: { repository: ["/workspace/repo"] },
      groupBy: "none",
      columnOrder: ["todo", "in_progress", "in_review", "done"],
    });
    apiMocks.loadKanbanBoard.mockResolvedValue(filteredSnapshot);
    renderWorkspace();

    expect(
      await screen.findByRole("heading", { name: "No matching cards" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.queryByText("No cards yet")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "To do" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "In progress" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "In review" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Done" })).toBeInTheDocument();
  });

  it("does not render the multiple-repositories group heading", async () => {
    const groupedSnapshot = snapshot([
      card({
        repositories: [
          {
            repositoryPath: "/workspace/repo",
            relativePath: "repo",
            label: "repo",
            includeDirtyChanges: false,
          },
          {
            repositoryPath: "/workspace/docs",
            relativePath: "docs",
            label: "docs",
            includeDirtyChanges: false,
          },
        ],
      }),
    ]);
    groupedSnapshot.preferencesJson = JSON.stringify({
      search: "",
      filters: {},
      groupBy: "repository",
      columnOrder: ["todo", "in_progress", "in_review", "done"],
    });
    apiMocks.loadKanbanBoard.mockResolvedValue(groupedSnapshot);

    renderWorkspace();

    expect(await screen.findByText("Controller card")).toBeInTheDocument();
    expect(screen.queryByText("Multiple repositories")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Multiple repositories" }))
      .not.toBeInTheDocument();
  });
});
