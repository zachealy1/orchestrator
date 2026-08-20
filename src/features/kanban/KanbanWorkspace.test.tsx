import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Workspace } from "../workspaces/types";
import type {
  GithubConnectionStatus,
  KanbanPullRequestRecord,
} from "../github/api";
import type {
  KanbanBoardSnapshotRecord,
  KanbanCardRecord,
  KanbanGitBinding,
  KanbanGitCleanupResult,
} from "./api";
import { KanbanWorkspace } from "./KanbanWorkspace";
import { clearKanbanWorkspaceCaches } from "./workspaceCache";
import { renderWithAppServices as render } from "../../test/renderWithAppServices";

const apiMocks = vi.hoisted(() => ({
  approveKanbanCard: vi.fn(),
  approveKanbanLocalReview: vi.fn(),
  archiveKanbanCard: vi.fn(),
  cleanupKanbanGit: vi.fn(),
  commitKanbanGit: vi.fn(),
  createKanbanCard: vi.fn(),
  deleteKanbanCard: vi.fn(),
  loadKanbanBoard: vi.fn(),
  loadKanbanGitBindings: vi.fn(),
  loadKanbanLocalReview: vi.fn(),
  loadKanbanWorkspaceBootstrap: vi.fn(),
  readKanbanGitFileDiff: vi.fn(),
  mergeKanbanGit: vi.fn(),
  moveKanbanCard: vi.fn(),
  pushKanbanGit: vi.fn(),
  reconcileKanbanGit: vi.fn(),
  reopenKanbanCard: vi.fn(),
  saveKanbanGitBindings: vi.fn(),
  saveKanbanInheritedContext: vi.fn(),
  saveKanbanPreferences: vi.fn(),
  updateKanbanCard: vi.fn(),
  useKanbanLocalReview: vi.fn(),
  completeKanbanLocalReviewWithoutChanges: vi.fn(),
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

function pullRequest(
  overrides: Partial<KanbanPullRequestRecord> = {},
): KanbanPullRequestRecord {
  return {
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
    cliVersion: "2.96.0",
    deviceCode: null,
    verificationUri: null,
    loginGeneration: null,
    browserOpened: false,
  },
  githubConnectionPending = false,
) {
  const props = {
    onLaunch: vi.fn().mockResolvedValue(undefined),
    onPause: vi.fn().mockResolvedValue(undefined),
    onStop: vi.fn().mockResolvedValue(undefined),
    onOpenConversation: vi.fn().mockResolvedValue(undefined),
    onConnectGithub: vi.fn(),
    onShowGithubLogin: vi.fn(),
  };

  const view = render(
    <KanbanWorkspace
      workspace={workspace}
      repositories={[]}
      accounts={[]}
      models={[]}
      refreshToken={0}
      listChatTranscript={transcriptMocks.listLocalChatTranscript}
      githubConnection={githubConnection}
      githubConnectionPending={githubConnectionPending}
      toolbarHost={toolbarHost}
      resolvedTheme="dark"
      {...props}
    />,
  );

  return { ...props, ...view };
}

async function confirmDeleteWithWorktreeCleanup(
  user: ReturnType<typeof userEvent.setup>,
  deleteBranches = false,
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
  if (deleteBranches) {
    await user.click(
      within(dialog).getByRole("checkbox", {
        name: /Delete card branches/,
      }),
    );
  }
  await user.click(within(dialog).getByRole("button", { name: "Delete card" }));
  return dialog;
}

beforeEach(() => {
  vi.resetAllMocks();
  clearKanbanWorkspaceCaches();
  githubMocks.syncKanbanPullRequests.mockResolvedValue(0);
  githubMocks.publishKanbanCard.mockResolvedValue({
    cardId: "card-1",
    pullRequests: [],
  });
  githubMocks.openPullRequest.mockResolvedValue(undefined);
  githubMocks.completeKanbanWithoutPullRequest.mockResolvedValue(undefined);
  transcriptMocks.listLocalChatTranscript.mockResolvedValue([]);
  const initialCard = card();
  const initialBinding = binding();
  const initialSnapshot = snapshot([initialCard]);

  apiMocks.loadKanbanBoard.mockResolvedValue(initialSnapshot);
  apiMocks.loadKanbanGitBindings.mockResolvedValue([initialBinding]);
  apiMocks.loadKanbanWorkspaceBootstrap.mockImplementation(
    async (workspaceId: number, options?: { includeArchived?: boolean }) => {
      const board = await apiMocks.loadKanbanBoard(workspaceId, options);
      return {
        snapshot: board,
        bindings: await Promise.all(
          board.cards.map(async (boardCard: KanbanCardRecord) => ({
            cardId: boardCard.id,
            bindings: await apiMocks.loadKanbanGitBindings(boardCard.id),
          })),
        ),
      };
    },
  );
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
  it("renders persisted cards before live Git reconciliation completes", async () => {
    let finishReconciliation!: (value: unknown) => void;
    apiMocks.reconcileKanbanGit.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishReconciliation = resolve;
        }),
    );

    renderWorkspace();

    expect(
      await screen.findByRole("article", { name: /Controller card/ }),
    ).toBeInTheDocument();
    const boardGroups = document.querySelector(".kanban-board-groups");
    expect(boardGroups?.lastElementChild).toHaveClass(
      "kanban-composer-scroll-clearance",
    );
    expect(boardGroups?.lastElementChild).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    await waitFor(() => expect(apiMocks.reconcileKanbanGit).toHaveBeenCalled());
    expect(screen.queryByText("Loading Kanban board…")).not.toBeInTheDocument();

    await act(async () => {
      finishReconciliation({
        binding: binding(),
        sourceAvailable: true,
        worktreeAvailable: true,
        branchAvailable: true,
        branchMatches: true,
        baseBranchHead: "base-commit",
        headCommit: "base-commit",
        targetMoved: false,
        hasChanges: false,
        hasConflicts: false,
      });
      await Promise.resolve();
    });
  });

  it("paints a cached board immediately while remount revalidation is pending", async () => {
    const firstView = renderWorkspace();
    await screen.findByRole("article", { name: /Controller card/ });
    firstView.unmount();

    let finishBootstrap!: (value: unknown) => void;
    apiMocks.loadKanbanWorkspaceBootstrap.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishBootstrap = resolve;
        }),
    );
    renderWorkspace();

    expect(
      screen.getByRole("article", { name: /Controller card/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Loading Kanban board…")).not.toBeInTheDocument();

    await act(async () => {
      finishBootstrap({
        snapshot: snapshot([card()]),
        bindings: [{ cardId: "card-1", bindings: [binding()] }],
      });
      await Promise.resolve();
    });
  });

  it("suspends polling, reconciliation, and toolbar portals while inactive", async () => {
    const toolbarHost = document.createElement("div");
    document.body.append(toolbarHost);
    const props = {
      active: false,
      workspace,
      repositories: [],
      accounts: [],
      models: [],
      refreshToken: 0,
      listChatTranscript: transcriptMocks.listLocalChatTranscript,
      onLaunch: vi.fn().mockResolvedValue(undefined),
      onPause: vi.fn().mockResolvedValue(undefined),
      onStop: vi.fn().mockResolvedValue(undefined),
      onOpenConversation: vi.fn().mockResolvedValue(undefined),
      githubConnection: {
        available: true,
        connected: true,
        login: "octocat",
        displayName: "Octocat",
        avatarUrl: null,
        status: "connected",
        message: null,
        cliVersion: "2.96.0",
        deviceCode: null,
        verificationUri: null,
        loginGeneration: null,
        browserOpened: false,
      } satisfies GithubConnectionStatus,
      githubConnectionPending: false,
      onConnectGithub: vi.fn(),
      onShowGithubLogin: vi.fn(),
      toolbarHost,
      resolvedTheme: "dark" as const,
    };
    const view = render(<KanbanWorkspace {...props} />);

    await waitFor(() =>
      expect(apiMocks.loadKanbanWorkspaceBootstrap).toHaveBeenCalledTimes(1),
    );
    expect(githubMocks.syncKanbanPullRequests).not.toHaveBeenCalled();
    expect(apiMocks.reconcileKanbanGit).not.toHaveBeenCalled();
    expect(toolbarHost).toBeEmptyDOMElement();

    view.rerender(<KanbanWorkspace {...props} active />);
    expect(
      await screen.findByRole("toolbar", { name: "Kanban controls" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.reconcileKanbanGit).toHaveBeenCalled());
    expect(githubMocks.syncKanbanPullRequests).toHaveBeenCalledTimes(1);

    toolbarHost.remove();
  });

  it("deduplicates focus and visibility refreshes while a sync is active", async () => {
    let resolveSync!: (updated: number) => void;
    githubMocks.syncKanbanPullRequests.mockReturnValueOnce(
      new Promise<number>((resolve) => {
        resolveSync = resolve;
      }),
    );
    renderWorkspace();

    await screen.findByRole("article", { name: /Controller card/ });
    await waitFor(() =>
      expect(githubMocks.syncKanbanPullRequests).toHaveBeenCalledTimes(1),
    );

    act(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(githubMocks.syncKanbanPullRequests).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSync(0);
      await Promise.resolve();
    });
    githubMocks.syncKanbanPullRequests.mockResolvedValue(0);
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() =>
      expect(githubMocks.syncKanbanPullRequests).toHaveBeenCalledTimes(2),
    );
  });

  it("polls open review cards every ten seconds and reloads only after changes", async () => {
    const setInterval = vi.spyOn(window, "setInterval");
    apiMocks.loadKanbanBoard.mockResolvedValue(
      snapshot([card({ pullRequests: [pullRequest()] })]),
    );
    renderWorkspace();

    await screen.findByRole("article", { name: /Controller card/ });
    await waitFor(() =>
      expect(githubMocks.syncKanbanPullRequests).toHaveBeenCalledTimes(1),
    );
    expect(githubMocks.syncKanbanPullRequests).toHaveBeenLastCalledWith(
      1,
      expect.any(Number),
    );
    const intervalCall = setInterval.mock.calls.find(
      ([, delay]) => delay === 10_000,
    );
    expect(intervalCall).toBeDefined();
    const intervalCallback = intervalCall?.[0] as TimerHandler;
    const initialLoadCount = apiMocks.loadKanbanWorkspaceBootstrap.mock.calls.length;

    act(() => {
      if (typeof intervalCallback === "function") intervalCallback();
    });
    await waitFor(() =>
      expect(githubMocks.syncKanbanPullRequests).toHaveBeenCalledTimes(2),
    );
    expect(apiMocks.loadKanbanWorkspaceBootstrap).toHaveBeenCalledTimes(
      initialLoadCount,
    );

    githubMocks.syncKanbanPullRequests.mockResolvedValueOnce(1);
    act(() => {
      if (typeof intervalCallback === "function") intervalCallback();
    });
    await waitFor(() =>
      expect(apiMocks.loadKanbanWorkspaceBootstrap).toHaveBeenCalledTimes(
        initialLoadCount + 1,
      ),
    );
    setInterval.mockRestore();
  });

  it("keeps an icon-only manual pull request refresh fallback", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await screen.findByRole("article", { name: /Controller card/ });
    await waitFor(() =>
      expect(githubMocks.syncKanbanPullRequests).toHaveBeenCalledTimes(1),
    );
    const refresh = screen.getByRole("button", {
      name: "Refresh pull request status",
    });
    expect(refresh).not.toHaveTextContent("Refresh");
    await user.click(refresh);
    await waitFor(() =>
      expect(githubMocks.syncKanbanPullRequests).toHaveBeenCalledTimes(2),
    );
  });

  it("loads archived cards only when the archived board is opened", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await screen.findByRole("article", { name: /Controller card/ });
    expect(apiMocks.loadKanbanWorkspaceBootstrap).toHaveBeenCalledWith(1, {
      includeArchived: false,
    });

    await user.click(screen.getByRole("button", { name: "Archived cards" }));
    await waitFor(() =>
      expect(apiMocks.loadKanbanWorkspaceBootstrap).toHaveBeenCalledWith(1, {
        includeArchived: true,
      }),
    );
  });

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
      cliVersion: "2.96.0",
      deviceCode: null,
      verificationUri: null,
      loginGeneration: null,
      browserOpened: false,
    });

    const warning = await screen.findByTestId("kanban-github-warning");
    expect(warning).toHaveTextContent("GitHub not connected");
    expect(warning).toHaveTextContent(
      "Completed cards will use local review until GitHub is connected.",
    );

    await user.click(
      within(warning).getByRole("button", { name: "Connect GitHub" }),
    );
    expect(callbacks.onConnectGithub).toHaveBeenCalledTimes(1);
  });

  it("returns an in-progress GitHub connection to the shared modal", async () => {
    const user = userEvent.setup();
    const callbacks = renderWorkspace(
      undefined,
      {
        available: true,
        connected: false,
        login: null,
        displayName: null,
        avatarUrl: null,
        status: "connecting",
        message: "Complete GitHub sign-in in your browser.",
        cliVersion: "2.96.0",
        deviceCode: "ABCD-1234",
        verificationUri: "https://github.com/login/device",
        loginGeneration: 4,
        browserOpened: false,
      },
      true,
    );

    const warning = await screen.findByTestId("kanban-github-warning");
    expect(warning).toHaveTextContent("GitHub sign-in is in progress");
    expect(warning).not.toHaveTextContent("ABCD-1234");
    await user.click(
      within(warning).getByRole("button", { name: "Show GitHub sign-in" }),
    );

    expect(callbacks.onShowGithubLogin).toHaveBeenCalledTimes(1);
    expect(callbacks.onConnectGithub).not.toHaveBeenCalled();
  });

  it("does not show the GitHub warning when connected", async () => {
    renderWorkspace();

    expect(await screen.findByText("Controller card")).toBeInTheDocument();
    expect(
      screen.queryByTestId("kanban-github-warning"),
    ).not.toBeInTheDocument();
  });

  it("floats successful Kanban actions without reserving board space", async () => {
    const user = userEvent.setup();
    const readyCard = card({
      stage: "todo",
      executionState: "idle",
      reviewState: "none",
      currentAttemptId: null,
      hasStartedTurn: false,
    });
    apiMocks.loadKanbanBoard.mockResolvedValue(snapshot([readyCard]));

    const callbacks = renderWorkspace();
    const tile = await screen.findByRole("article", {
      name: /Controller card/,
    });
    await user.click(
      within(tile).getByLabelText("Actions for Controller card"),
    );
    await user.click(screen.getByRole("menuitem", { name: "Start agent" }));

    await waitFor(() => expect(callbacks.onLaunch).toHaveBeenCalledTimes(1));
    const anchor = document.querySelector(".kanban-floating-status-anchor");
    expect(anchor).not.toBeNull();
    const bubble = within(anchor as HTMLElement).getByRole("complementary", {
      name: "Workspace status",
    });
    expect(within(bubble).getByText("Agent turn started.")).toBeInTheDocument();
    await user.click(
      within(bubble).getByRole("button", {
        name: "Dismiss Agent turn started.",
      }),
    );
    expect(
      within(bubble).queryByText("Agent turn started."),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector(".kanban-workspace-view > .kanban-workspace-alert"),
    ).toBeNull();
  });

  it("stacks action and Git refresh errors in the floating overlay", async () => {
    const user = userEvent.setup();
    const readyCard = card({
      stage: "todo",
      executionState: "idle",
      reviewState: "none",
      currentAttemptId: null,
      hasStartedTurn: false,
    });
    apiMocks.loadKanbanBoard.mockResolvedValue(snapshot([readyCard]));
    apiMocks.reconcileKanbanGit.mockRejectedValue(
      new Error("Git reconciliation failed"),
    );

    const callbacks = renderWorkspace();
    callbacks.onLaunch.mockRejectedValueOnce(new Error("Agent launch failed"));
    const tile = await screen.findByRole("article", {
      name: /Controller card/,
    });
    await waitFor(() =>
      expect(
        screen.getByText(
          "Git state could not be refreshed for 1 card. Stored card details remain available.",
        ),
      ).toBeInTheDocument(),
    );
    await user.click(
      within(tile).getByLabelText("Actions for Controller card"),
    );
    await user.click(screen.getByRole("menuitem", { name: "Start agent" }));

    const anchor = document.querySelector(".kanban-floating-status-anchor");
    expect(anchor).not.toBeNull();
    const bubble = within(anchor as HTMLElement).getByRole("complementary", {
      name: "Workspace status",
    });
    await waitFor(() => {
      expect(within(bubble).getByText("Agent launch failed")).toBeInTheDocument();
    });
    expect(within(bubble).getAllByRole("alert")).toHaveLength(2);
  });

  it("shows completed instead of awaiting review after a card reaches Done", async () => {
    apiMocks.loadKanbanBoard.mockResolvedValue(
      snapshot([
        card({
          stage: "done",
          executionState: "completed",
          reviewState: "approved",
          approvedAt: "2026-08-14T08:00:00Z",
        }),
      ]),
    );
    apiMocks.loadKanbanGitBindings.mockResolvedValue([
      binding({ status: "merged" }),
    ]);

    renderWorkspace();

    const tile = await screen.findByRole("article", {
      name: "Controller card, Completed",
    });
    expect(within(tile).getByText("Completed")).toBeInTheDocument();
    expect(within(tile).queryByText("Awaiting review")).not.toBeInTheDocument();
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
    expect(
      screen.queryByRole("button", { name: "New card" }),
    ).not.toBeInTheDocument();

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
      expect(
        screen.getByRole("article", { name: /Controller card/ }),
      ).toBeInTheDocument();
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

    await waitFor(() =>
      expect(apiMocks.deleteKanbanCard).toHaveBeenCalledTimes(1),
    );
    expect(apiMocks.saveKanbanGitBindings).toHaveBeenCalledWith(
      expect.objectContaining({ id: originalCard.id, stateVersion: 4 }),
      [cleanedBinding],
    );
    expect(apiMocks.deleteKanbanCard).toHaveBeenCalledWith(
      expect.objectContaining({ id: refreshedCard.id, stateVersion: 5 }),
    );
    expect(
      apiMocks.saveKanbanGitBindings.mock.invocationCallOrder[0],
    ).toBeLessThan(apiMocks.deleteKanbanCard.mock.invocationCallOrder[0]);
  });

  it("discards uncommitted worktree changes when deleting card branches", async () => {
    const user = userEvent.setup();
    const persisted = card();
    const cleanedBinding = binding({ status: "cleaned" });
    apiMocks.loadKanbanBoard.mockResolvedValue(snapshot([persisted]));
    apiMocks.cleanupKanbanGit.mockResolvedValue({
      binding: cleanedBinding,
      status: "cleaned",
      worktreeRemoved: true,
      branchDeleted: true,
      executionRootRemoved: true,
      errors: [],
    } satisfies KanbanGitCleanupResult);
    apiMocks.saveKanbanGitBindings.mockResolvedValue([cleanedBinding]);

    renderWorkspace();
    await confirmDeleteWithWorktreeCleanup(user, true);

    await waitFor(() =>
      expect(apiMocks.cleanupKanbanGit).toHaveBeenCalledWith({
        binding: expect.objectContaining({ sourceRepositoryPath: "/workspace/repo" }),
        deleteBranch: true,
        force: true,
      }),
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
    const tile = await screen.findByRole("article", {
      name: /Controller card/,
    });
    await user.click(
      within(tile).getByLabelText("Actions for Controller card"),
    );
    await user.click(screen.getByRole("menuitem", { name: "Stop agent" }));

    expect(callbacks.onStop).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", {
      name: "Stop this agent?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Stop agent" }),
    );
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

    const tile = await screen.findByRole("article", {
      name: /Controller card/,
    });
    await user.click(
      within(tile).getByLabelText("Actions for Controller card"),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Open pull request" }),
    );
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

    const tile = await screen.findByRole("article", {
      name: /Controller card/,
    });
    await user.click(
      within(tile).getByLabelText("Actions for Controller card"),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Open pull request" }),
    );

    const chooser = screen.getByRole("dialog", { name: "Open pull request" });
    const closeChooser = within(chooser).getByRole("button", {
      name: "Close pull request chooser",
    });
    expect(closeChooser).toHaveAttribute("data-tooltip", "Close");
    expect(closeChooser).not.toHaveAttribute("title");
    await user.click(within(chooser).getByRole("button", { name: /backend/ }));
    expect(githubMocks.openPullRequest).toHaveBeenCalledWith(
      "https://github.com/owner/backend/pull/34",
    );
    expect(
      screen.queryByRole("dialog", { name: "Open pull request" }),
    ).not.toBeInTheDocument();
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

    const tile = await screen.findByRole("article", {
      name: /Controller card/,
    });
    await user.click(
      within(tile).getByLabelText("Actions for Controller card"),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Retry publication" }),
    );
    expect(githubMocks.publishKanbanCard).toHaveBeenCalledWith("card-1");
  });

  it("lets a connected user switch a failed publication to local review", async () => {
    const user = userEvent.setup();
    const failedCard = card({
      reviewChannel: "github",
      pullRequests: [
        {
          sourceRepositoryPath: "/workspace/repo",
          relativePath: "repo",
          owner: "owner",
          repository: "repo",
          number: null,
          url: null,
          baseBranch: "main",
          headBranch: "codex/controller-card",
          draft: true,
          state: "open",
          publicationStatus: "failed",
          error: "Commit message generation failed.",
          updatedAt: "2026-08-19T14:24:07Z",
        },
      ],
    });
    apiMocks.loadKanbanBoard.mockResolvedValue(snapshot([failedCard]));
    apiMocks.useKanbanLocalReview.mockResolvedValue({
      cardId: failedCard.id,
      title: failedCard.title,
      objective: failedCard.description,
      summary: "Implemented the controller.",
      reviewChannel: "local",
      canPublishGithub: true,
      repositories: [],
    });
    renderWorkspace();

    const tile = await screen.findByRole("article", {
      name: /Controller card/,
    });
    await user.click(
      within(tile).getByLabelText("Actions for Controller card"),
    );
    await user.click(screen.getByRole("menuitem", { name: "Review locally" }));

    expect(apiMocks.useKanbanLocalReview).toHaveBeenCalledWith("card-1");
    expect(
      await screen.findByRole("complementary", { name: "Local card review" }),
    ).toBeInTheDocument();
  });

  it("opens the local review drawer for a disconnected completed card", async () => {
    const user = userEvent.setup();
    const localCard = card({ reviewChannel: "local", pullRequests: [] });
    apiMocks.loadKanbanBoard.mockResolvedValue(snapshot([localCard]));
    apiMocks.loadKanbanLocalReview.mockResolvedValue({
      cardId: localCard.id,
      title: localCard.title,
      objective: localCard.description,
      summary: "Implemented the controller.",
      reviewChannel: "local",
      canPublishGithub: false,
      repositories: [
        {
          sourceRepositoryPath: "/workspace/repo",
          relativePath: "repo",
          baseBranch: "main",
          cardBranch: "codex/controller-card",
          status: "pending",
          error: null,
          additions: 1,
          deletions: 0,
          files: ["src/controller.ts"],
          diff: "diff --git a/src/controller.ts b/src/controller.ts\n--- a/src/controller.ts\n+++ b/src/controller.ts\n@@ -0,0 +1 @@\n+export {};\n",
          isEmpty: false,
        },
      ],
    });
    apiMocks.readKanbanGitFileDiff.mockResolvedValue({
      path: "/workspace/.codex/card-1/repo/src/controller.ts",
      relativePath: "src/controller.ts",
      sections: [
        {
          kind: "unstaged",
          title: "Card changes",
          baseLabel: "main:src/controller.ts",
          headLabel: "codex/controller-card:src/controller.ts",
          baseContent: "",
          headContent: "export {};\n",
          baseTruncated: false,
          headTruncated: false,
          content: "+export {};\n",
          isBinary: false,
        },
      ],
    });
    renderWorkspace();

    const tile = await screen.findByRole("article", {
      name: /Controller card/,
    });
    await user.click(
      within(tile).getByLabelText("Actions for Controller card"),
    );
    await user.click(screen.getByRole("menuitem", { name: "Review changes" }));

    expect(
      await screen.findByRole("complementary", { name: "Local card review" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Implemented the controller.")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "controller.ts" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Collapse src" }),
    ).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Collapse src" }));
    expect(
      screen.queryByRole("button", { name: "controller.ts" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand src" }));
    expect(
      screen.getByRole("button", { name: "controller.ts" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Collapse repo" }));
    expect(
      screen.queryByRole("button", { name: "controller.ts" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand repo" }));
    expect(
      screen.getByRole("button", { name: "controller.ts" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Review context" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Previous changed file" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next changed file" }),
    ).not.toBeInTheDocument();
    const inlineLayout = screen.getByRole("button", { name: "Inline diff" });
    const sideBySideLayout = screen.getByRole("button", {
      name: "Side-by-side diff",
    });
    expect(inlineLayout).toHaveAttribute("aria-pressed", "true");
    await user.click(sideBySideLayout);
    expect(sideBySideLayout).toHaveAttribute("aria-pressed", "true");
    await user.click(
      screen.getByRole("button", { name: "Hide changed files" }),
    );
    expect(
      screen.queryByRole("button", { name: "controller.ts" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Show changed files" }),
    );
    expect(
      screen.getByRole("button", { name: "controller.ts" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(apiMocks.readKanbanGitFileDiff).toHaveBeenCalledWith(
        expect.objectContaining({ sourceRepositoryPath: "/workspace/repo" }),
        "src/controller.ts",
      ),
    );
    expect(
      screen.getByRole("button", { name: "Approve and merge locally" }),
    ).toBeInTheDocument();
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
    expect(
      screen.getByRole("region", { name: "In progress" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "In review" }),
    ).toBeInTheDocument();
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
    expect(
      screen.queryByRole("heading", { name: "Multiple repositories" }),
    ).not.toBeInTheDocument();
  });
});
