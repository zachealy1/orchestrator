import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, beforeEach, expect, it, vi } from "vitest";
import {
  getMocks,
  workspace,
  prepareDefaults,
  renderApp,
  pointerTapFile,
  prepareSignedInRun,
  setWindowWidth,
} from "./test/appRuntimeHarness";

const mocks = getMocks();

describe("Application runtime scenarios 1", () => {
  beforeEach(() => {
      mocks.listeners.clear();
      vi.clearAllMocks();
      vi.useRealTimers();
      localStorage.clear();
      setWindowWidth(1024);
      document.documentElement.removeAttribute("data-theme");
      mocks.virtuosoState = {
        ranges: [{ startIndex: 0, endIndex: 0 }],
        scrollTop: 0,
      };
      prepareDefaults();
    });

  it("shows only sign in when the account is disconnected", async () => {
      mocks.connectCodexMock.mockRejectedValue(new Error("codex app-server missing"));

      const { user } = await renderApp();

      const signIn = await screen.findByLabelText("Sign in to Codex");
      expect(signIn).toHaveTextContent("Sign in to Codex");
      expect(signIn.querySelector(".account-avatar")).not.toBeInTheDocument();
      expect(signIn).not.toHaveAttribute("aria-expanded");
      expect(screen.queryByLabelText("Codex account")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Connect Codex")).not.toBeInTheDocument();
      expect(screen.queryByText("Refresh")).not.toBeInTheDocument();

      await user.click(signIn);
      await waitFor(() => expect(mocks.connectCodexMock).toHaveBeenCalledWith(7));
    });

  it("lists workspaces without paths and opens the picker from the sidebar", async () => {
      const secondWorkspace = {
        ...workspace,
        id: 2,
        path: "/repo/mobile-client",
        label: "mobile-client",
        default_account_id: null,
      };
      mocks.listWorkspacesMock.mockResolvedValue([workspace, secondWorkspace]);
      mocks.openDialogMock.mockResolvedValue("/repo/new-workspace");

      const { user } = await renderApp();
      const primaryNav = screen.getByRole("navigation", {
        name: "Primary",
      });
      const appRailBrand = document.querySelector(".app-rail-brand");
      const betaBrand = screen.getByLabelText("Orchestrator beta");
      expect(appRailBrand).toContainElement(betaBrand);
      expect(appRailBrand?.nextElementSibling).toBe(primaryNav);
      expect(
        within(primaryNav).queryByRole("button", { name: "Task" }),
      ).not.toBeInTheDocument();
      expect(
        within(primaryNav).queryByRole("button", { name: "Runs" }),
      ).not.toBeInTheDocument();
      const workspaceNav = screen.getByRole("navigation", {
        name: "Workspaces",
      });
      expect(
        within(workspaceNav).getByRole("button", { name: "orchestrator" }),
      ).toBeInTheDocument();
      const secondWorkspaceButton = within(workspaceNav).getByRole("button", {
        name: "mobile-client",
      });
      expect(secondWorkspaceButton).toBeInTheDocument();
      expect(within(workspaceNav).queryByText(workspace.path)).not.toBeInTheDocument();
      expect(
        within(workspaceNav).queryByText(secondWorkspace.path),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("combobox", { name: "Folder" }),
      ).not.toBeInTheDocument();
      const workspacesHeading = screen.getByText("Workspaces");
      const addWorkspaceButton = screen.getByRole("button", {
        name: "Add workspace",
      });
      expect(workspacesHeading.parentElement).toContainElement(addWorkspaceButton);
      expect(addWorkspaceButton).not.toHaveTextContent("Add workspace");

      await user.click(within(primaryNav).getByRole("button", { name: "Analytics" }));
      expect(screen.queryByLabelText("Task composer")).not.toBeInTheDocument();
      expect(
        within(workspaceNav).getByRole("button", { name: "orchestrator" }),
      ).not.toHaveAttribute("aria-current");
      expect(screen.queryByLabelText("Run history")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Codex run console")).not.toBeInTheDocument();

      await user.click(secondWorkspaceButton);
      expect(secondWorkspaceButton).toHaveAttribute("aria-current", "page");
      expect(screen.getByLabelText("Task composer")).toBeInTheDocument();
      expect(mocks.listWorkspaceDirectoryMock).not.toHaveBeenCalled();

      await user.click(addWorkspaceButton);

      await waitFor(() =>
        expect(mocks.openDialogMock).toHaveBeenCalledWith({
          directory: true,
          multiple: false,
          title: "Choose a repository workspace",
        }),
      );
      expect(mocks.upsertWorkspaceMock).toHaveBeenCalledWith(
        "/repo/new-workspace",
      );
    });

  it("selects a newly added workspace after it is persisted", async () => {
      const newWorkspace = {
        ...workspace,
        id: 9,
        path: "/repo/new-workspace",
        label: "new-workspace",
        default_account_id: null,
      };
      mocks.openDialogMock.mockResolvedValueOnce(newWorkspace.path);
      mocks.upsertWorkspaceMock.mockResolvedValueOnce(newWorkspace);
      mocks.listWorkspacesMock
        .mockResolvedValueOnce([workspace])
        .mockResolvedValue([newWorkspace, workspace]);

      const { user } = await renderApp();
      await user.click(screen.getByRole("button", { name: "Add workspace" }));

      const workspaceNav = screen.getByRole("navigation", {
        name: "Workspaces",
      });
      await waitFor(() =>
        expect(
          within(workspaceNav).getByRole("button", {
            name: newWorkspace.label,
          }),
        ).toHaveAttribute("aria-current", "page"),
      );
      expect(screen.getByLabelText("Selected folder")).toHaveTextContent(
        newWorkspace.label,
      );
    });

  it("opens a workspace context menu and cancels workspace removal", async () => {
      const { user } = await renderApp();
      const workspaceNav = screen.getByRole("navigation", {
        name: "Workspaces",
      });
      const workspaceButton = within(workspaceNav).getByRole("button", {
        name: "orchestrator",
      });

      fireEvent.contextMenu(workspaceButton, { clientX: 60, clientY: 140 });

      const menu = screen.getByRole("menu", {
        name: "orchestrator workspace actions",
      });
      expect(menu).toBeInTheDocument();
      await user.click(
        within(menu).getByRole("menuitem", {
          name: "Remove from Orchestrator",
        }),
      );

      const dialog = screen.getByRole("dialog", { name: "Remove workspace?" });
      expect(
        within(dialog).getByText(/The folder on disk will not be deleted/i),
      ).toBeInTheDocument();
      const keepWorkspaceButton = within(dialog).getByRole("button", {
        name: "Keep workspace",
      });
      expect(keepWorkspaceButton).toHaveTextContent("");
      expect(keepWorkspaceButton).toHaveAttribute(
        "data-tooltip",
        "Keep workspace",
      );
      await user.click(keepWorkspaceButton);

      expect(mocks.softDeleteWorkspaceMock).not.toHaveBeenCalled();
      expect(
        within(workspaceNav).getByRole("button", { name: "orchestrator" }),
      ).toBeInTheDocument();
    });

  it("soft-deletes the selected workspace and falls back to the next workspace", async () => {
      const secondWorkspace = {
        ...workspace,
        id: 2,
        path: "/repo/mobile-client",
        label: "mobile-client",
        default_account_id: null,
      };
      mocks.listWorkspacesMock.mockResolvedValue([workspace, secondWorkspace]);

      const { user } = await renderApp();
      const workspaceNav = screen.getByRole("navigation", {
        name: "Workspaces",
      });

      await user.click(
        within(workspaceNav).getByRole("button", { name: "mobile-client" }),
      );
      await user.type(screen.getByLabelText("Prompt"), "Remember this draft");
      await user.click(
        within(workspaceNav).getByRole("button", { name: "orchestrator" }),
      );

      fireEvent.contextMenu(
        within(workspaceNav).getByRole("button", { name: "orchestrator" }),
        { clientX: 60, clientY: 140 },
      );
      await user.click(
        screen.getByRole("menuitem", { name: "Remove from Orchestrator" }),
      );
      const removeWorkspaceButton = within(
        screen.getByRole("dialog", { name: "Remove workspace?" }),
      ).getByRole("button", { name: "Remove workspace" });
      expect(removeWorkspaceButton).toHaveTextContent("");
      expect(removeWorkspaceButton).toHaveAttribute(
        "data-tooltip",
        "Remove workspace",
      );
      await user.click(removeWorkspaceButton);

      await waitFor(() => expect(mocks.softDeleteWorkspaceMock).toHaveBeenCalledWith(1));
      expect(
        within(workspaceNav).queryByRole("button", { name: "orchestrator" }),
      ).not.toBeInTheDocument();
      const fallbackWorkspace = within(workspaceNav).getByRole("button", {
        name: "mobile-client",
      });
      expect(fallbackWorkspace).toHaveAttribute("aria-current", "page");
      expect(screen.getByLabelText("Selected folder")).toHaveTextContent("mobile-client");
      expect(screen.getByLabelText("Prompt")).toHaveValue("Remember this draft");
    });

  it("opens and closes the workspace context menu from the keyboard", async () => {
      const { user } = await renderApp();
      const workspaceNav = screen.getByRole("navigation", {
        name: "Workspaces",
      });
      const workspaceButton = within(workspaceNav).getByRole("button", {
        name: "orchestrator",
      });

      workspaceButton.focus();
      fireEvent.keyDown(workspaceButton, { key: "F10", shiftKey: true });
      expect(
        screen.getByRole("menu", { name: "orchestrator workspace actions" }),
      ).toBeInTheDocument();

      await user.keyboard("{Escape}");
      expect(
        screen.queryByRole("menu", { name: "orchestrator workspace actions" }),
      ).not.toBeInTheDocument();
    });

  it("expands a workspace independently from selection and previews files", async () => {
      const secondWorkspace = {
        ...workspace,
        id: 2,
        path: "/repo/mobile-client",
        label: "mobile-client",
        default_account_id: null,
      };
      const readmeEntry = {
        name: "README.md",
        path: "/repo/mobile-client/README.md",
        relativePath: "README.md",
        kind: "file" as const,
      };
      mocks.listWorkspacesMock.mockResolvedValue([workspace, secondWorkspace]);
      mocks.listWorkspaceDirectoryMock.mockResolvedValue([
        {
          name: "src",
          path: "/repo/mobile-client/src",
          relativePath: "src",
          kind: "directory",
        },
        readmeEntry,
      ]);
      mocks.readWorkspaceFilePreviewMock.mockResolvedValue({
        path: readmeEntry.path,
        relativePath: readmeEntry.relativePath,
        content: "# Mobile client",
        truncated: false,
        isBinary: false,
      });

      const { user } = await renderApp();
      const workspaceNav = screen.getByRole("navigation", {
        name: "Workspaces",
      });
      const selectedWorkspaceButton = within(workspaceNav).getByRole("button", {
        name: "orchestrator",
      });
      const secondWorkspaceButton = within(workspaceNav).getByRole("button", {
        name: "mobile-client",
      });

      await user.click(
        within(workspaceNav).getByRole("button", { name: "Expand mobile-client" }),
      );

      await waitFor(() =>
        expect(mocks.listWorkspaceDirectoryMock).toHaveBeenCalledWith(
          secondWorkspace.path,
          secondWorkspace.path,
        ),
      );
      expect(selectedWorkspaceButton).toHaveAttribute("aria-current", "page");
      expect(secondWorkspaceButton).not.toHaveAttribute("aria-current");
      expect(await within(workspaceNav).findByTitle("README.md")).toBeInTheDocument();

      pointerTapFile(within(workspaceNav).getByRole("button", { name: "README.md" }));

      await waitFor(() =>
        expect(mocks.readWorkspaceFilePreviewMock).toHaveBeenCalledWith(
          secondWorkspace.path,
          readmeEntry.path,
        ),
      );
      await waitFor(() =>
        expect(
          screen.getByRole("complementary", { name: "File preview" }),
        ).toHaveTextContent("# Mobile client"),
      );
      expect(screen.queryByLabelText("Selected context files")).not.toBeInTheDocument();
    });

  it("dedupes repeated file preview requests while a preview is loading", async () => {
      const readmeEntry = {
        name: "README.md",
        path: "/repo/orchestrator/README.md",
        relativePath: "README.md",
        kind: "file" as const,
      };
      let resolvePreview: (preview: unknown) => void = () => undefined;
      const pendingPreview = new Promise((resolve) => {
        resolvePreview = resolve;
      });
      mocks.listWorkspaceDirectoryMock.mockResolvedValue([readmeEntry]);
      mocks.readWorkspaceFilePreviewMock.mockReturnValue(pendingPreview);

      const { user } = await renderApp();
      const workspaceNav = screen.getByRole("navigation", {
        name: "Workspaces",
      });

      await user.click(
        within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
      );
      const readmeButton = await within(workspaceNav).findByRole("button", {
        name: "README.md",
      });

      await user.click(readmeButton);
      await user.click(readmeButton);

      expect(mocks.readWorkspaceFilePreviewMock).toHaveBeenCalledTimes(1);

      resolvePreview({
        path: readmeEntry.path,
        relativePath: readmeEntry.relativePath,
        content: "# Cached preview",
        truncated: false,
        isBinary: false,
      });
      expect(await screen.findByText("# Cached preview")).toBeInTheDocument();
    });

  it("loads git status for the selected workspace", async () => {
      await renderApp();

      await waitFor(() =>
        expect(mocks.listWorkspaceGitStatusMock).toHaveBeenCalledWith(workspace.path),
      );
    });

  it("shows git status markers for workspaces that are not selected", async () => {
      const otherWorkspace = {
        ...workspace,
        id: 2,
        path: "/repo/other",
        label: "other",
      };

      mocks.listWorkspacesMock.mockResolvedValue([workspace, otherWorkspace]);
      mocks.listWorkspaceGitStatusMock.mockImplementation(async (workspacePath: string) => {
        if (workspacePath === otherWorkspace.path) {
          return {
            workspacePath: otherWorkspace.path,
            gitRoot: otherWorkspace.path,
            files: [
              {
                path: "/repo/other/Changed.ts",
                relativePath: "Changed.ts",
                oldRelativePath: null,
                indexStatus: " ",
                worktreeStatus: "M",
                statusKind: "modified",
                badge: "M",
              },
            ],
          };
        }

        return {
          workspacePath: workspace.path,
          gitRoot: workspace.path,
          files: [],
        };
      });

      const { user } = await renderApp();
      const workspaceNav = screen.getByRole("navigation", {
        name: "Workspaces",
      });

      await waitFor(() =>
        expect(mocks.listWorkspaceGitStatusMock).toHaveBeenCalledWith(
          otherWorkspace.path,
        ),
      );
      expect(
        within(within(workspaceNav).getByTitle("other")).getByLabelText(
          "Contains changes",
        ),
      ).toBeInTheDocument();

      await user.click(
        within(workspaceNav).getByRole("button", { name: "Expand other" }),
      );

      expect(await within(workspaceNav).findByTitle("Changed.ts")).toBeInTheDocument();
      expect(within(workspaceNav).getByLabelText("modified file")).toHaveTextContent(
        "M",
      );
    });

  it("renders a selected folder banner with workspace, branch, and clean git state", async () => {
      mocks.listGitBranchesMock.mockResolvedValue({
        branches: ["main", "feature/chat-controls"],
        currentBranch: "main",
      });

      const { user } = await renderApp();

      const banner = screen.getByRole("region", { name: "Selected folder" });
      expect(within(banner).getByText("orchestrator")).toBeInTheDocument();
      expect(within(banner).queryByText(workspace.path)).not.toBeInTheDocument();
      expect(
        banner.querySelector(`[title="${workspace.path}"]`),
      ).not.toBeNull();
      const branchSelect = await within(banner).findByRole("combobox", {
        name: "Branch",
      });
      await waitFor(() => expect(branchSelect).toHaveTextContent("main"));
      expect(
        within(screen.getByLabelText("Task composer")).queryByRole("combobox", {
          name: "Branch",
        }),
      ).not.toBeInTheDocument();
      await user.click(branchSelect);
      await user.click(
        screen.getByRole("option", { name: "feature/chat-controls" }),
      );
      await waitFor(() =>
        expect(mocks.checkoutGitBranchMock).toHaveBeenCalledWith(
          workspace.path,
          "feature/chat-controls",
          workspace.path,
        ),
      );
      expect(await within(banner).findByText("Clean")).toBeInTheDocument();
    });

  it("creates and selects a branch from the header branch menu", async () => {
      let currentBranch = "main";
      mocks.listGitBranchesMock.mockImplementation(async () => ({
        branches:
          currentBranch === "main"
            ? ["main"]
            : ["feature/chat-controls", "main"],
        currentBranch,
      }));
      mocks.createGitBranchMock.mockImplementation(
        async (_path: string, branch: string) => {
          currentBranch = branch;
          return { branch };
        },
      );

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      const branchSelect = await within(banner).findByRole("combobox", {
        name: "Branch",
      });
      await waitFor(() => expect(branchSelect).toBeEnabled());

      await user.click(branchSelect);
      await user.click(
        screen.getByRole("option", { name: "Create branch..." }),
      );
      const dialog = screen.getByRole("dialog", { name: "Create branch" });
      expect(dialog).toHaveTextContent("from main");
      const input = within(dialog).getByRole("textbox", { name: "Branch name" });
      await waitFor(() => expect(input).toHaveFocus());
      await user.type(input, "feature/chat-controls");
      await user.keyboard("{Enter}");

      await waitFor(() =>
        expect(mocks.createGitBranchMock).toHaveBeenCalledWith(
          workspace.path,
          "feature/chat-controls",
          workspace.path,
        ),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Create branch" }),
        ).not.toBeInTheDocument(),
      );
      expect(branchSelect).toHaveTextContent("feature/chat-controls");
      expect(mocks.checkoutGitBranchMock).not.toHaveBeenCalled();
    });

  it("keeps branch creation open for validation and Git failures", async () => {
      mocks.createGitBranchMock.mockRejectedValue(
        new Error("Branch `feature/existing` already exists"),
      );

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      const branchSelect = await within(banner).findByRole("combobox", {
        name: "Branch",
      });
      await waitFor(() => expect(branchSelect).toBeEnabled());
      await user.click(branchSelect);
      await user.click(
        screen.getByRole("option", { name: "Create branch..." }),
      );

      const dialog = screen.getByRole("dialog", { name: "Create branch" });
      await user.click(
        within(dialog).getByRole("button", { name: "Create branch" }),
      );
      expect(
        within(dialog).getByText("Enter a branch name before creating it."),
      ).toBeInTheDocument();
      expect(mocks.createGitBranchMock).not.toHaveBeenCalled();

      await user.type(
        within(dialog).getByRole("textbox", { name: "Branch name" }),
        "feature/existing",
      );
      await user.click(
        within(dialog).getByRole("button", { name: "Create branch" }),
      );

      expect(
        await within(dialog).findByText(
          "Could not create branch: Branch `feature/existing` already exists",
        ),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole("textbox", { name: "Branch name" }),
      ).toHaveValue("feature/existing");
      expect(branchSelect).toHaveTextContent("main");
    });

  it("summarizes changed files in the selected folder banner", async () => {
      mocks.listWorkspaceGitStatusMock.mockResolvedValue({
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        additions: 167,
        deletions: 82,
        files: [
          {
            path: "/repo/orchestrator/src/App.tsx",
            relativePath: "src/App.tsx",
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "M",
            statusKind: "modified",
            badge: "M",
          },
          {
            path: "/repo/orchestrator/src/New.tsx",
            relativePath: "src/New.tsx",
            oldRelativePath: null,
            indexStatus: "A",
            worktreeStatus: " ",
            statusKind: "added",
            badge: "A",
          },
          {
            path: "/repo/orchestrator/src/Renamed.tsx",
            relativePath: "src/Renamed.tsx",
            oldRelativePath: "src/Old.tsx",
            indexStatus: "R",
            worktreeStatus: " ",
            statusKind: "renamed",
            badge: "R",
          },
          {
            path: "/repo/orchestrator/src/Deleted.tsx",
            relativePath: "src/Deleted.tsx",
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "D",
            statusKind: "deleted",
            badge: "D",
          },
          {
            path: "/repo/orchestrator/notes.md",
            relativePath: "notes.md",
            oldRelativePath: null,
            indexStatus: "?",
            worktreeStatus: "?",
            statusKind: "untracked",
            badge: "U",
          },
          {
            path: "/repo/orchestrator/src/conflict.ts",
            relativePath: "src/conflict.ts",
            oldRelativePath: null,
            indexStatus: "U",
            worktreeStatus: "U",
            statusKind: "conflicted",
            badge: "U",
          },
        ],
      });

      await renderApp();

      const banner = screen.getByRole("region", { name: "Selected folder" });
      const changeSummary = await within(banner).findByLabelText(
        "6 changed (1 modified, 2 added, 1 deleted, 1 untracked, 1 conflicted); 167 additions, 82 deletions",
      );
      expect(changeSummary).toHaveClass("git-summary");
      expect(within(changeSummary).getByText("+167")).toBeInTheDocument();
      expect(within(changeSummary).getByText("-82")).toBeInTheDocument();
    });

  it("selects one repository for branch and commit actions in a multi-repo workspace", async () => {
      const frontendPath = `${workspace.path}/frontend`;
      const backendPath = `${workspace.path}/backend`;
      const frontendFile = {
        path: `${frontendPath}/src/App.tsx`,
        relativePath: "frontend/src/App.tsx",
        repositoryPath: frontendPath,
        repositoryRelativePath: "src/App.tsx",
        oldRelativePath: null,
        indexStatus: " ",
        worktreeStatus: "M",
        statusKind: "modified",
        badge: "M",
      };
      const backendFile = {
        path: `${backendPath}/src/server.ts`,
        relativePath: "backend/src/server.ts",
        repositoryPath: backendPath,
        repositoryRelativePath: "src/server.ts",
        oldRelativePath: null,
        indexStatus: " ",
        worktreeStatus: "M",
        statusKind: "modified",
        badge: "M",
      };
      mocks.listWorkspaceGitStatusMock.mockResolvedValue({
        workspacePath: workspace.path,
        repositories: [
          {
            repository: {
              rootPath: frontendPath,
              relativePath: "frontend",
              label: "frontend",
            },
            workspacePath: workspace.path,
            gitRoot: frontendPath,
            currentBranch: "main",
            aheadCount: 0,
            additions: 5,
            deletions: 1,
            hasUpstream: true,
            hasOrigin: true,
            canPush: false,
            files: [frontendFile],
          },
          {
            repository: {
              rootPath: backendPath,
              relativePath: "backend",
              label: "backend",
            },
            workspacePath: workspace.path,
            gitRoot: backendPath,
            currentBranch: "release",
            aheadCount: 2,
            additions: 8,
            deletions: 3,
            hasUpstream: true,
            hasOrigin: true,
            canPush: true,
            files: [backendFile],
          },
        ],
        additions: 13,
        deletions: 4,
        changedRepositoryCount: 2,
        files: [frontendFile, backendFile],
        discoveryTruncated: false,
      });
      mocks.listGitBranchesMock.mockImplementation(
        async (_workspacePath: string, repositoryPath: string) =>
          repositoryPath === backendPath
            ? { branches: ["release", "main"], currentBranch: "release" }
            : { branches: ["main"], currentBranch: "main" },
      );

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      const repositorySelect = await within(banner).findByRole("combobox", {
        name: "Git repository",
      });
      const branchSelect = within(banner).getByRole("combobox", {
        name: "Branch",
      });
      expect(
        repositorySelect.compareDocumentPosition(branchSelect) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(repositorySelect).toHaveTextContent("frontend · main");
      expect(within(banner).getByText("+13")).toBeInTheDocument();
      expect(within(banner).getByText("-4")).toBeInTheDocument();

      await user.click(
        within(banner).getByRole("button", { name: /commit or push/i }),
      );
      const dialog = screen.getByRole("dialog", { name: "Commit or push" });
      const dialogRepositorySelect = within(dialog).getByRole("combobox", {
        name: "Commit repository",
      });
      const dialogBranch = within(dialog).getByText("main");
      expect(
        dialogBranch.compareDocumentPosition(dialogRepositorySelect) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(dialogRepositorySelect).toHaveTextContent("frontend");
      expect(dialogRepositorySelect).not.toHaveTextContent("main");
      expect(dialogRepositorySelect).not.toHaveTextContent("changed");
      expect(
        dialog.querySelector(
          ".git-action-status-row .git-action-repository-select",
        ),
      ).not.toBeNull();
      expect(
        dialog.querySelector(":scope > .git-action-repository-select"),
      ).toBeNull();
      await user.type(
        within(dialog).getByLabelText(/commit message/i),
        "Frontend message",
      );
      await user.click(dialogRepositorySelect);
      await user.click(
        screen.getByRole("option", {
          name: "backend",
        }),
      );

      expect(within(dialog).getByLabelText(/commit message/i)).toHaveValue("");
      expect(within(dialog).getByText("release")).toBeInTheDocument();
      expect(within(dialog).getByLabelText("8 additions, 3 deletions"))
        .toBeInTheDocument();
      await waitFor(() =>
        expect(mocks.updateWorkspaceSelectedGitRepositoryMock).toHaveBeenCalledWith(
          workspace.id,
          backendPath,
        ),
      );
      expect(mocks.listGitBranchesMock).toHaveBeenCalledWith(
        workspace.path,
        backendPath,
      );

      await user.type(
        within(dialog).getByLabelText(/commit message/i),
        "Update backend",
      );
      await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));
      await waitFor(() =>
        expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledWith(
          workspace.path,
          "Update backend",
          true,
          backendPath,
        ),
      );
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Commit or push" }))
          .not.toBeInTheDocument(),
      );
      await user.click(
        within(banner).getByRole("button", { name: /commit or push/i }),
      );
      await user.click(
        within(screen.getByRole("dialog", { name: "Commit or push" })).getByRole(
          "button",
          { name: /^push$/i },
        ),
      );
      await waitFor(() =>
        expect(mocks.pushWorkspaceBranchMock).toHaveBeenCalledWith(
          workspace.path,
          backendPath,
        ),
      );
    });

  it("commits all workspace changes from the selected folder banner", async () => {
      mocks.listWorkspaceGitStatusMock.mockResolvedValue({
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        currentBranch: "main",
        aheadCount: 0,
        hasUpstream: true,
        hasOrigin: true,
        canPush: false,
        files: [
          {
            path: "/repo/orchestrator/src/App.tsx",
            relativePath: "src/App.tsx",
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "M",
            statusKind: "modified",
            badge: "M",
          },
        ],
      });

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        await within(banner).findByRole("button", { name: /commit or push/i }),
      );

      const dialog = screen.getByRole("dialog", { name: "Commit or push" });
      expect(document.querySelector(".commit-popover")).toBeNull();
      expect(dialog.querySelectorAll(".git-action-branch svg")).toHaveLength(1);
      expect(within(dialog).getByText("Include unstaged changes")).toBeInTheDocument();
      const messageInput = within(dialog).getByLabelText(/commit message/i);
      expect(messageInput).toHaveValue("");
      expect(messageInput).toHaveAttribute(
        "placeholder",
        "Commit message (leave blank to generate)...",
      );
      await user.type(messageInput, "Update app shell");
      await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));

      await waitFor(() =>
        expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledWith(
          workspace.path,
          "Update app shell",
          true,
          workspace.path,
        ),
      );
      await waitFor(() =>
        expect(mocks.listWorkspaceGitStatusMock).toHaveBeenCalledWith(workspace.path),
      );
    });

  it("can commit only staged changes when unstaged changes are excluded", async () => {
      mocks.listWorkspaceGitStatusMock.mockResolvedValue({
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        currentBranch: "main",
        aheadCount: 0,
        hasUpstream: true,
        hasOrigin: true,
        canPush: true,
        additions: 8,
        deletions: 1,
        files: [
          {
            path: "/repo/orchestrator/src/App.tsx",
            relativePath: "src/App.tsx",
            oldRelativePath: null,
            indexStatus: "M",
            worktreeStatus: "M",
            statusKind: "modified",
            badge: "M",
          },
        ],
      });

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        await within(banner).findByRole("button", { name: /commit or push/i }),
      );

      const dialog = screen.getByRole("dialog", { name: "Commit or push" });
      const includeUnstaged = within(dialog).getByRole("checkbox", {
        name: /include unstaged changes/i,
      });
      expect(includeUnstaged).toBeChecked();

      await user.click(includeUnstaged);
      expect(includeUnstaged).not.toBeChecked();
      await user.type(
        within(dialog).getByLabelText(/commit message/i),
        "Commit staged app source",
      );
      await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));

      await waitFor(() =>
        expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledWith(
          workspace.path,
          "Commit staged app source",
          false,
          workspace.path,
        ),
      );
    });

  it("does not use a diff-topic fallback when generation fails", async () => {
      mocks.listWorkspaceGitStatusMock.mockResolvedValue({
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        currentBranch: "main",
        aheadCount: 0,
        hasUpstream: true,
        hasOrigin: true,
        canPush: true,
        additions: 14,
        deletions: 5,
        files: [
          {
            path: "/repo/orchestrator/src/components/TaskChatTranscript.tsx",
            relativePath: "src/components/TaskChatTranscript.tsx",
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "M",
            statusKind: "modified",
            badge: "M",
          },
          {
            path: "/repo/orchestrator/src/components/TaskChatTranscript.test.tsx",
            relativePath: "src/components/TaskChatTranscript.test.tsx",
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "A",
            statusKind: "added",
            badge: "A",
          },
          {
            path: "/repo/orchestrator/src/components/taskChatFormatting.ts",
            relativePath: "src/components/taskChatFormatting.ts",
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "D",
            statusKind: "deleted",
            badge: "D",
          },
        ],
      });

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        await within(banner).findByRole("button", { name: /commit or push/i }),
      );

      const dialog = screen.getByRole("dialog", { name: "Commit or push" });
      await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));

      expect(
        screen.queryByRole("dialog", { name: "Commit or push" }),
      ).not.toBeInTheDocument();
      const review = await screen.findByRole("button", {
        name: "Open Git actions",
      });
      expect(review).toHaveTextContent(
        "Could not generate a commit message. Enter a message manually or try again.",
      );
      expect(mocks.commitWorkspaceChangesMock).not.toHaveBeenCalled();
    });

  it("uses an AI-generated commit message when the commit message is blank", async () => {
      prepareSignedInRun();
      mocks.generateWorkspaceCommitMessageMock.mockResolvedValue({
        message: "Make staged-only commits respect the checkbox",
        source: "codex",
      });
      mocks.listWorkspaceGitStatusMock.mockResolvedValue({
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        currentBranch: "main",
        aheadCount: 0,
        hasUpstream: true,
        hasOrigin: true,
        canPush: true,
        additions: 14,
        deletions: 4,
        files: [
          {
            path: "/repo/orchestrator/src/App.tsx",
            relativePath: "src/App.tsx",
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "M",
            statusKind: "modified",
            badge: "M",
          },
          {
            path: "/repo/orchestrator/src-tauri/src/lib.rs",
            relativePath: "src-tauri/src/lib.rs",
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "M",
            statusKind: "modified",
            badge: "M",
          },
        ],
      });

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        await within(banner).findByRole("button", { name: /commit or push/i }),
      );

      const dialog = screen.getByRole("dialog", { name: "Commit or push" });
      await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));

      await waitFor(() =>
        expect(mocks.generateWorkspaceCommitMessageMock).toHaveBeenCalledWith(
          expect.objectContaining({
            workspacePath: workspace.path,
            repositoryPath: workspace.path,
            accountId: 7,
            includeUnstaged: true,
          }),
        ),
      );
      await waitFor(() =>
        expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledWith(
          workspace.path,
          "Make staged-only commits respect the checkbox",
          true,
          workspace.path,
        ),
      );
    });

  it("generates a message before committing and pushing when the message is blank", async () => {
      prepareSignedInRun();
      mocks.generateWorkspaceCommitMessageMock.mockResolvedValue({
        message: "Keep header controls on one row",
        source: "codex",
      });
      mocks.listWorkspaceGitStatusMock.mockResolvedValue({
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        currentBranch: "main",
        aheadCount: 0,
        hasUpstream: true,
        hasOrigin: true,
        canPush: true,
        additions: 10,
        deletions: 2,
        files: [
          {
            path: "/repo/orchestrator/src/App.css",
            relativePath: "src/App.css",
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "M",
            statusKind: "modified",
            badge: "M",
          },
        ],
      });

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        await within(banner).findByRole("button", { name: /commit or push/i }),
      );

      const dialog = screen.getByRole("dialog", { name: "Commit or push" });
      await user.click(
        within(dialog).getByRole("button", { name: /^commit and push$/i }),
      );

      await waitFor(() =>
        expect(mocks.generateWorkspaceCommitMessageMock).toHaveBeenCalled(),
      );
      await waitFor(() =>
        expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledWith(
          workspace.path,
          "Keep header controls on one row",
          true,
          workspace.path,
        ),
      );
      await waitFor(() =>
        expect(mocks.pushWorkspaceBranchMock).toHaveBeenCalledWith(
          workspace.path,
          workspace.path,
        ),
      );
    });

  it("fails closed when no account is available for message generation", async () => {
      mocks.generateWorkspaceCommitMessageMock.mockRejectedValue(
        new Error("Sign in to Codex or enter a commit message manually"),
      );
      mocks.listWorkspaceGitStatusMock.mockResolvedValue({
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        currentBranch: "main",
        aheadCount: 0,
        hasUpstream: true,
        hasOrigin: true,
        canPush: true,
        additions: 5,
        deletions: 2,
        files: [
          {
            path: "/repo/orchestrator/src/App.tsx",
            relativePath: "src/App.tsx",
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "M",
            statusKind: "modified",
            badge: "M",
          },
        ],
      });

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        await within(banner).findByRole("button", { name: /commit or push/i }),
      );

      const dialog = screen.getByRole("dialog", { name: "Commit or push" });
      await user.click(
        within(dialog).getByRole("button", { name: /^commit and push$/i }),
      );

      await waitFor(() =>
        expect(mocks.generateWorkspaceCommitMessageMock).toHaveBeenCalledWith(
          expect.objectContaining({
            workspacePath: workspace.path,
            repositoryPath: workspace.path,
            accountId: null,
            includeUnstaged: true,
          }),
        ),
      );
      const review = await screen.findByRole("button", {
        name: "Open Git actions",
      });
      expect(review).toHaveTextContent(
        "Could not generate a commit message. Enter a message manually or try again.",
      );
      expect(mocks.commitWorkspaceChangesMock).not.toHaveBeenCalled();
      expect(mocks.pushWorkspaceBranchMock).not.toHaveBeenCalled();

      await user.click(review);
      const retryDialog = screen.getByRole("dialog", { name: "Commit or push" });
      await user.type(
        within(retryDialog).getByLabelText(/commit message/i),
        "Fix manual commit fallback",
      );
      await user.click(
        within(retryDialog).getByRole("button", { name: /^commit and push$/i }),
      );
      await waitFor(() =>
        expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledWith(
          workspace.path,
          "Fix manual commit fallback",
          true,
          workspace.path,
        ),
      );
      await waitFor(() =>
        expect(mocks.pushWorkspaceBranchMock).toHaveBeenCalledWith(
          workspace.path,
          workspace.path,
        ),
      );
    });

  it("retries commit-message generation without duplicating the commit", async () => {
      prepareSignedInRun();
      mocks.generateWorkspaceCommitMessageMock
        .mockRejectedValueOnce(new Error("request timed out"))
        .mockResolvedValueOnce({
          message: "Keep Snake controls responsive",
          source: "codex",
        });
      mocks.listWorkspaceGitStatusMock.mockResolvedValue({
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        currentBranch: "main",
        aheadCount: 0,
        hasUpstream: true,
        hasOrigin: true,
        canPush: true,
        additions: 410,
        deletions: 0,
        files: [
          {
            path: "/repo/orchestrator/src/app.js",
            relativePath: "src/app.js",
            oldRelativePath: null,
            indexStatus: "M",
            worktreeStatus: " ",
            statusKind: "modified",
            badge: "M",
          },
        ],
      });

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        await within(banner).findByRole("button", { name: /commit or push/i }),
      );
      let dialog = screen.getByRole("dialog", { name: "Commit or push" });

      await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));
      const review = await screen.findByRole("button", {
        name: "Open Git actions",
      });
      expect(review).toHaveTextContent(
        "Could not generate a commit message. Enter a message manually or try again.",
      );
      await user.click(review);
      dialog = screen.getByRole("dialog", { name: "Commit or push" });
      await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));

      await waitFor(() =>
        expect(mocks.generateWorkspaceCommitMessageMock).toHaveBeenCalledTimes(2),
      );
      await waitFor(() =>
        expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledWith(
          workspace.path,
          "Keep Snake controls responsive",
          true,
          workspace.path,
        ),
      );
      expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledTimes(1);
    });

  it("ignores duplicate commit-and-push actions while generation is pending", async () => {
      prepareSignedInRun();
      let resolveGeneration:
        | ((value: { message: string; source: "codex" }) => void)
        | null = null;
      let resolveCommit:
        | ((value: { message: string; branch: string }) => void)
        | null = null;
      mocks.generateWorkspaceCommitMessageMock.mockImplementation(
        () =>
          new Promise<{ message: string; source: "codex" }>((resolve) => {
            resolveGeneration = resolve;
          }),
      );
      mocks.commitWorkspaceChangesMock.mockImplementation(
        () =>
          new Promise<{ message: string; branch: string }>((resolve) => {
            resolveCommit = resolve;
          }),
      );
      mocks.listWorkspaceGitStatusMock.mockResolvedValue({
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        currentBranch: "main",
        aheadCount: 0,
        hasUpstream: true,
        hasOrigin: true,
        canPush: true,
        additions: 24,
        deletions: 2,
        files: [
          {
            path: "/repo/orchestrator/src/app.js",
            relativePath: "src/app.js",
            oldRelativePath: null,
            indexStatus: "M",
            worktreeStatus: " ",
            statusKind: "modified",
            badge: "M",
          },
        ],
      });

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        await within(banner).findByRole("button", { name: /commit or push/i }),
      );
      const dialog = screen.getByRole("dialog", { name: "Commit or push" });
      const commitAndPush = within(dialog).getByRole("button", {
        name: /^commit and push$/i,
      });

      act(() => {
        commitAndPush.click();
        commitAndPush.click();
      });
      expect(mocks.generateWorkspaceCommitMessageMock).toHaveBeenCalledTimes(1);
      expect(
        within(dialog).queryByText(/generating an intent-driven commit message/i),
      ).not.toBeInTheDocument();

      await act(async () => {
        resolveGeneration?.({
          message: "Keep Snake controls responsive",
          source: "codex",
        });
        await Promise.resolve();
      });

      await waitFor(() =>
        expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledTimes(1),
      );
      expect(
        screen.queryByRole("dialog", { name: "Commit or push" }),
      ).not.toBeInTheDocument();
      expect(
        within(banner).getByRole("button", { name: /commit or push/i }),
      ).toHaveAttribute("aria-busy", "true");
      expect(
        within(banner).getByRole("button", { name: /commit or push/i }),
      ).toBeDisabled();
      expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledWith(
        workspace.path,
        "Keep Snake controls responsive",
        true,
        workspace.path,
      );

      await act(async () => {
        resolveCommit?.({
          message: "Committed workspace changes",
          branch: "main",
        });
        await Promise.resolve();
      });
      await waitFor(() =>
        expect(mocks.pushWorkspaceBranchMock).toHaveBeenCalledTimes(1),
      );
      await waitFor(() =>
        expect(
          within(banner).getByRole("button", { name: /commit or push/i }),
        ).toHaveAttribute("aria-busy", "false"),
      );
    });

  it("closes the dialog while an accepted commit runs in the background", async () => {
      let resolveCommit:
        | ((value: { message: string; branch: string }) => void)
        | null = null;
      mocks.commitWorkspaceChangesMock.mockImplementation(
        () =>
          new Promise<{ message: string; branch: string }>((resolve) => {
            resolveCommit = resolve;
          }),
      );
      mocks.listWorkspaceGitStatusMock.mockResolvedValue({
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        currentBranch: "main",
        aheadCount: 0,
        hasUpstream: true,
        hasOrigin: true,
        canPush: false,
        additions: 4,
        deletions: 1,
        files: [
          {
            path: "/repo/orchestrator/src/App.tsx",
            relativePath: "src/App.tsx",
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "M",
            statusKind: "modified",
            badge: "M",
          },
        ],
      });

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      const gitButton = await within(banner).findByRole("button", {
        name: /commit or push/i,
      });
      await user.click(gitButton);
      const dialog = screen.getByRole("dialog", { name: "Commit or push" });
      await user.type(
        within(dialog).getByLabelText(/commit message/i),
        "Keep Git actions responsive",
      );
      await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));

      expect(
        screen.queryByRole("dialog", { name: "Commit or push" }),
      ).not.toBeInTheDocument();
      expect(gitButton).toBeDisabled();
      expect(gitButton).toHaveAttribute("aria-busy", "true");
      expect(
        within(banner)
          .getByRole("status", { name: "Committing changes" })
          .querySelector(".spin"),
      ).toBeInTheDocument();

      await act(async () => {
        resolveCommit?.({
          message: "Committed workspace changes",
          branch: "main",
        });
        await Promise.resolve();
      });

      expect(
        await screen.findByText(
          "Workspace changes were committed successfully. Repository: orchestrator.",
        ),
      ).toBeInTheDocument();
      await waitFor(() => expect(gitButton).toHaveAttribute("aria-busy", "false"));
    });

  it("closes the dialog immediately while generating a commit message", async () => {
      prepareSignedInRun();
      let resolveGeneration:
        | ((value: { message: string; source: "codex" }) => void)
        | null = null;
      let resolveCommit:
        | ((value: { message: string; branch: string }) => void)
        | null = null;
      mocks.generateWorkspaceCommitMessageMock.mockImplementation(
        () =>
          new Promise<{ message: string; source: "codex" }>((resolve) => {
            resolveGeneration = resolve;
          }),
      );
      mocks.commitWorkspaceChangesMock.mockImplementation(
        () =>
          new Promise<{ message: string; branch: string }>((resolve) => {
            resolveCommit = resolve;
          }),
      );
      mocks.listWorkspaceGitStatusMock.mockResolvedValue({
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        currentBranch: "main",
        aheadCount: 0,
        hasUpstream: true,
        hasOrigin: true,
        canPush: false,
        additions: 4,
        deletions: 1,
        files: [
          {
            path: "/repo/orchestrator/src/App.tsx",
            relativePath: "src/App.tsx",
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "M",
            statusKind: "modified",
            badge: "M",
          },
        ],
      });

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      const gitButton = await within(banner).findByRole("button", {
        name: /commit or push/i,
      });
      await user.click(gitButton);
      const dialog = screen.getByRole("dialog", { name: "Commit or push" });
      await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));

      expect(
        screen.queryByRole("dialog", { name: "Commit or push" }),
      ).not.toBeInTheDocument();
      expect(mocks.generateWorkspaceCommitMessageMock).toHaveBeenCalledTimes(1);
      expect(gitButton).toHaveAttribute("aria-busy", "true");
      expect(
        within(banner)
          .getByRole("button", { name: /commit or push/i })
          .querySelector(".spin"),
      ).toBeInTheDocument();

      await act(async () => {
        resolveGeneration?.({
          message: "Preserve workspace scroll position",
          source: "codex",
        });
        await Promise.resolve();
      });
      await waitFor(() =>
        expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledWith(
          workspace.path,
          "Preserve workspace scroll position",
          true,
          workspace.path,
        ),
      );

      await act(async () => {
        resolveCommit?.({
          message: "Committed workspace changes",
          branch: "main",
        });
        await Promise.resolve();
      });
    });

  it("reports a failed background commit and retries without reopening the dialog", async () => {
      mocks.commitWorkspaceChangesMock
        .mockRejectedValueOnce(new Error("commit timed out"))
        .mockResolvedValueOnce({
          message: "Committed workspace changes",
          branch: "main",
        });
      mocks.listWorkspaceGitStatusMock.mockResolvedValue({
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        currentBranch: "main",
        aheadCount: 0,
        hasUpstream: true,
        hasOrigin: true,
        canPush: false,
        additions: 4,
        deletions: 1,
        files: [
          {
            path: "/repo/orchestrator/src/App.tsx",
            relativePath: "src/App.tsx",
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "M",
            statusKind: "modified",
            badge: "M",
          },
        ],
      });

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        await within(banner).findByRole("button", { name: /commit or push/i }),
      );
      const dialog = screen.getByRole("dialog", { name: "Commit or push" });
      await user.type(
        within(dialog).getByLabelText(/commit message/i),
        "Keep failed Git actions retryable",
      );
      await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));

      const retry = await screen.findByRole("button", { name: "Retry commit" });
      expect(retry).toHaveTextContent(
        "Commit timed out. Check your connection and try again.",
      );
      expect(
        screen.queryByRole("dialog", { name: "Commit or push" }),
      ).not.toBeInTheDocument();

      await user.click(retry);
      await waitFor(() =>
        expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledTimes(2),
      );
      expect(
        await screen.findByText(
          "Workspace changes were committed successfully. Repository: orchestrator.",
        ),
      ).toBeInTheDocument();
    });

  it("shows a retryable composer warning when a background push fails", async () => {
      mocks.pushWorkspaceBranchMock
        .mockRejectedValueOnce(
          new Error("failed to push some refs (non-fast-forward)"),
        )
        .mockResolvedValueOnce({
          message: "Pushed main",
          branch: "main",
        });
      mocks.listWorkspaceGitStatusMock.mockResolvedValue({
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        currentBranch: "main",
        aheadCount: 1,
        hasUpstream: true,
        hasOrigin: true,
        canPush: true,
        files: [],
      });

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        await within(banner).findByRole("button", { name: /commit or push/i }),
      );
      const dialog = screen.getByRole("dialog", { name: "Commit or push" });
      await user.click(within(dialog).getByRole("button", { name: /^push$/i }));

      expect(
        screen.queryByRole("dialog", { name: "Commit or push" }),
      ).not.toBeInTheDocument();
      const retry = await screen.findByRole("button", { name: "Retry push" });
      expect(retry).toHaveTextContent(
        "Push was rejected. Pull or resolve the remote changes, then try again.",
      );

      await user.click(retry);
      await waitFor(() =>
        expect(mocks.pushWorkspaceBranchMock).toHaveBeenCalledTimes(2),
      );
      expect(
        await screen.findByText(
          "The current branch was pushed successfully. Repository: orchestrator.",
        ),
      ).toBeInTheDocument();
    });

  it("retries only the push after a combined operation commits successfully", async () => {
      mocks.pushWorkspaceBranchMock
        .mockRejectedValueOnce(new Error("authentication failed"))
        .mockResolvedValueOnce({
          message: "Pushed main",
          branch: "main",
        });
      mocks.listWorkspaceGitStatusMock.mockResolvedValue({
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        currentBranch: "main",
        aheadCount: 0,
        hasUpstream: true,
        hasOrigin: true,
        canPush: true,
        additions: 8,
        deletions: 0,
        files: [
          {
            path: "/repo/orchestrator/src/App.tsx",
            relativePath: "src/App.tsx",
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "M",
            statusKind: "modified",
            badge: "M",
          },
        ],
      });

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        await within(banner).findByRole("button", { name: /commit or push/i }),
      );
      const dialog = screen.getByRole("dialog", { name: "Commit or push" });
      await user.type(
        within(dialog).getByLabelText(/commit message/i),
        "Keep background Git operations isolated",
      );
      await user.click(
        within(dialog).getByRole("button", { name: /^commit and push$/i }),
      );

      const retry = await screen.findByRole("button", { name: "Retry push" });
      expect(retry).toHaveTextContent(
        "The commit succeeded, but the push failed.",
      );
      await user.click(retry);

      await waitFor(() =>
        expect(mocks.pushWorkspaceBranchMock).toHaveBeenCalledTimes(2),
      );
      expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledTimes(1);
    });
});
