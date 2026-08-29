import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, beforeEach, expect, it, vi } from "vitest";
import {
  getMocks,
  workspace,
  pendingAccount,
  signedInAccount,
  signedInAccount2,
  defaultCodexModel,
  workspaceRunFixture,
  workspaceChatFixture,
  workspaceChatWithRunsFixture,
  prepareDefaults,
  renderApp,
  prepareSignedInRun,
  startMockRun,
  emitCodexNotification,
  setWindowWidth,
} from "./test/appRuntimeHarness";
import { ASK_FOR_APPROVAL_PERMISSION_PROFILE } from "./lib/codexAccess";

const mocks = getMocks();

describe("Application runtime scenarios 5", () => {
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

  it("sorts @ mention search results and limits visible files", async () => {
      mocks.listWorkspaceDirectoryMock.mockResolvedValue([
        {
          name: "happy-app.ts",
          path: `${workspace.path}/happy-app.ts`,
          relativePath: "happy-app.ts",
          kind: "file",
        },
        {
          name: "application.md",
          path: `${workspace.path}/application.md`,
          relativePath: "application.md",
          kind: "file",
        },
        {
          name: "App.tsx",
          path: `${workspace.path}/App.tsx`,
          relativePath: "App.tsx",
          kind: "file",
        },
        {
          name: "app.config.ts",
          path: `${workspace.path}/app.config.ts`,
          relativePath: "app.config.ts",
          kind: "file",
        },
        {
          name: "mapped.ts",
          path: `${workspace.path}/mapped.ts`,
          relativePath: "mapped.ts",
          kind: "file",
        },
        {
          name: "wrapped.ts",
          path: `${workspace.path}/wrapped.ts`,
          relativePath: "wrapped.ts",
          kind: "file",
        },
        {
          name: "app-state.ts",
          path: `${workspace.path}/app-state.ts`,
          relativePath: "app-state.ts",
          kind: "file",
        },
        {
          name: "mapper-app.ts",
          path: `${workspace.path}/mapper-app.ts`,
          relativePath: "mapper-app.ts",
          kind: "file",
        },
        {
          name: "app-router.ts",
          path: `${workspace.path}/app-router.ts`,
          relativePath: "app-router.ts",
          kind: "file",
        },
      ]);

      const { user } = await renderApp();
      await user.type(screen.getByLabelText("Prompt"), "@app");

      const listbox = await screen.findByRole("listbox", {
        name: "Workspace file suggestions",
      });
      const options = within(listbox).getAllByRole("option");
      expect(options).toHaveLength(8);
      expect(options[0]).toHaveTextContent("App.tsx");
      expect(options[1]).toHaveTextContent("app-state.ts");
    });

  it("rebuilds @ mention search after switching workspaces", async () => {
      const mobileWorkspace = {
        ...workspace,
        id: 2,
        path: "/repo/mobile-client",
        label: "mobile-client",
        default_account_id: null,
      };
      mocks.listWorkspacesMock.mockResolvedValue([workspace, mobileWorkspace]);
      mocks.listWorkspaceDirectoryMock.mockImplementation(
        async (workspacePath: string) => {
          if (workspacePath === workspace.path) {
            return [
              {
                name: "App.tsx",
                path: `${workspace.path}/src/App.tsx`,
                relativePath: "src/App.tsx",
                kind: "file",
              },
            ];
          }

          return [
            {
              name: "MobileApp.tsx",
              path: `${mobileWorkspace.path}/src/MobileApp.tsx`,
              relativePath: "src/MobileApp.tsx",
              kind: "file",
            },
          ];
        },
      );

      const { user } = await renderApp();
      const promptInput = screen.getByLabelText("Prompt");

      await user.type(promptInput, "@app");
      await user.click(await screen.findByRole("option", { name: /app\.tsx/i }));

      const workspaceNav = screen.getByRole("navigation", {
        name: "Workspaces",
      });
      await user.click(
        within(workspaceNav).getByRole("button", { name: "mobile-client" }),
      );

      await user.type(screen.getByLabelText("Prompt"), "@mobile");
      expect(
        await screen.findByRole("option", { name: /mobileapp\.tsx/i }),
      ).toBeInTheDocument();
      expect(mocks.listWorkspaceDirectoryMock).toHaveBeenCalledWith(
        mobileWorkspace.path,
        mobileWorkspace.path,
      );
    });

  it("enforces dark mode and exposes no appearance controls", async () => {
      localStorage.setItem("orchestrator.theme", "light");
      const { user } = await renderApp();

      await waitFor(() =>
        expect(document.documentElement).toHaveAttribute("data-theme", "dark"),
      );
      expect(document.documentElement.style.colorScheme).toBe("dark");
      expect(localStorage.getItem("orchestrator.theme")).toBe("dark");

      await user.click(screen.getByRole("button", { name: "Settings" }));

      expect(screen.queryByRole("radio", { name: "System" })).toBeNull();
      expect(screen.queryByRole("radio", { name: "Dark" })).toBeNull();
      expect(screen.queryByRole("radio", { name: "Light" })).toBeNull();
    });

  it("requests notification permission only from Settings and persists each category", async () => {
      mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue(
        "not-enabled",
      );
      const { user } = await renderApp();

      expect(mocks.requestAgentNotificationPermissionMock).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Settings" }));
      expect(screen.getByText("Not enabled")).toBeInTheDocument();

      await user.click(
        screen.getByRole("checkbox", { name: /Completed responses/ }),
      );
      await user.click(
        screen.getByRole("checkbox", { name: /Agent questions/ }),
      );
      await waitFor(() =>
        expect(
          JSON.parse(
            localStorage.getItem("orchestrator.agent-notifications.v1") ?? "{}",
          ),
        ).toEqual(
          expect.objectContaining({
            responseCompleted: false,
            approvalRequired: true,
            userInputRequired: false,
            planReady: true,
            externalAction: true,
          }),
        ),
      );

      await user.click(
        screen.getByRole("button", { name: "Enable notifications" }),
      );
      await waitFor(() =>
        expect(mocks.requestAgentNotificationPermissionMock).toHaveBeenCalledTimes(
          1,
        ),
      );
      expect(await screen.findByText("Allowed")).toBeInTheDocument();
    });

  it("opens macOS notification settings after permission is denied", async () => {
      mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue("denied");
      const { user } = await renderApp();

      await user.click(screen.getByRole("button", { name: "Settings" }));
      expect(await screen.findByText("Denied")).toBeInTheDocument();
      await user.click(
        screen.getByRole("button", {
          name: "Open macOS notification settings",
        }),
      );

      expect(mocks.openAgentNotificationSettingsMock).toHaveBeenCalledTimes(1);
    });

  it("removes consolidated duplicate profile directories during startup", async () => {
      mocks.listDuplicateProfilesPendingCleanupMock.mockResolvedValue([11]);

      await renderApp();

      await waitFor(() =>
        expect(mocks.deleteCodexProfileMock).toHaveBeenCalledWith(11),
      );
      expect(mocks.completeDuplicateProfileCleanupMock).toHaveBeenCalledWith(11);
    });

  it("removes abandoned identity-less account profiles during startup", async () => {
      const abandonedAccount = {
        ...pendingAccount,
        id: 10,
        status: "signed_out" as const,
      };
      mocks.listCodexAccountsMock.mockResolvedValue([
        signedInAccount,
        abandonedAccount,
      ]);

      await renderApp();

      await waitFor(() =>
        expect(mocks.softDeleteCodexAccountMock).toHaveBeenCalledWith(10),
      );
      expect(mocks.deleteCodexProfileMock).toHaveBeenCalledWith(10);
      expect(screen.queryByText("Local profile 10")).not.toBeInTheDocument();
    });

  it("maps account/read into signed-in auth UI", async () => {
      mocks.listCodexAccountsMock.mockResolvedValue([signedInAccount]);
      mocks.readCodexAccountMock.mockResolvedValue({
        account: {
          type: "chatgpt",
          email: "dev@example.com",
          planType: "pro",
        },
        requiresOpenaiAuth: true,
      });

      await renderApp();

      const accountButton = await screen.findByLabelText("Codex account");
      expect(within(accountButton).getByText("dev@example.com")).toBeInTheDocument();
      expect(within(accountButton).getByText("Pro")).toBeInTheDocument();
      expect(screen.queryByLabelText("Log out of Codex")).not.toBeInTheDocument();
    });

  it("handles malformed shared-profile account/read responses on visibility refresh", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        mocks.codexDefaultProfileRpcMock.mockImplementation(async (method: string) => {
          if (method === "account/read") {
            return undefined;
          }
          return {};
        });

        await renderApp();
        window.dispatchEvent(new Event("focus"));

        await waitFor(() =>
          expect(mocks.codexDefaultProfileRpcMock).toHaveBeenCalledWith(
            "account/read",
            { refreshToken: false },
          ),
        );

        const sharedRefreshWarnings = warnSpy.mock.calls.filter(
          ([message]) =>
            typeof message === "string" &&
            message.includes("Could not refresh the shared Codex account"),
        );
        expect(sharedRefreshWarnings).toHaveLength(0);
        expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
      } finally {
        warnSpy.mockRestore();
      }
    });

  it("starts browser login and shows waiting status", async () => {
      mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue("allowed");
      const { user } = await renderApp();

      expect(await screen.findByText("Sign in to Codex")).toBeInTheDocument();
      window.dispatchEvent(new Event("blur"));
      await user.click(screen.getByLabelText("Sign in to Codex"));

      await waitFor(() =>
        expect(mocks.openUrlMock).toHaveBeenCalledWith("https://example.com/auth"),
      );
      expect(mocks.startCodexLoginMock).toHaveBeenCalledWith(7);
      expect(await screen.findByText("Waiting for browser sign-in")).toBeInTheDocument();
      expect(screen.getByText("Click to cancel")).toBeInTheDocument();
      expect(screen.getByLabelText("Cancel Codex sign-in")).toBeInTheDocument();
      expect(screen.queryByLabelText("Codex account")).not.toBeInTheDocument();
      await waitFor(() =>
        expect(mocks.sendAgentNotificationMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Action required",
            body: expect.not.stringContaining("https://example.com/auth"),
            target: expect.objectContaining({
              kind: "external-action",
              accountId: 7,
              requestId: "login-1",
            }),
          }),
        ),
      );
    });

  it("surfaces account profile creation failures instead of leaving sign-in inert", async () => {
      mocks.createCodexAccountMock.mockRejectedValue(
        new Error("SQL execute permission denied"),
      );

      const { user } = await renderApp();
      await user.click(screen.getByLabelText("Sign in to Codex"));

      expect(await screen.findByText("Sign-in failed")).toBeInTheDocument();
      expect(
        screen.getByText("SQL execute permission denied"),
      ).toBeInTheDocument();
      expect(mocks.connectCodexMock).not.toHaveBeenCalled();
    });

  it("shows device code login and cancels the pending flow", async () => {
      mocks.startCodexLoginMock.mockResolvedValue({
        type: "chatgptDeviceCode",
        loginId: "login-2",
        verificationUrl: "https://example.com/device",
        userCode: "CODE-123",
      });

      const { user } = await renderApp();
      await user.click(screen.getByLabelText("Sign in to Codex"));

      await waitFor(() =>
        expect(mocks.openUrlMock).toHaveBeenCalledWith("https://example.com/device"),
      );
      expect(await screen.findByText("Enter code CODE-123")).toBeInTheDocument();

      await user.click(screen.getByLabelText("Cancel Codex sign-in"));
      await waitFor(() =>
        expect(mocks.cancelCodexLoginMock).toHaveBeenCalledWith(7, "login-2"),
      );
      expect(mocks.deleteCodexProfileMock).toHaveBeenCalledWith(7);
      expect(mocks.softDeleteCodexAccountMock).toHaveBeenCalledWith(7);
      expect(await screen.findByText("Sign in to Codex")).toBeInTheDocument();
      expect(screen.queryByLabelText("Codex account")).not.toBeInTheDocument();
    });

  it("completes sign-in from notifications and supports logout", async () => {
      mocks.readCodexAccountMock
        .mockResolvedValueOnce({
          account: {
            type: "chatgpt",
            email: "dev@example.com",
            planType: "pro",
          },
          requiresOpenaiAuth: true,
        });

      const { user } = await renderApp();
      await user.click(screen.getByLabelText("Sign in to Codex"));

      const notificationHandler = mocks.listeners.get("codex:notification");
      expect(notificationHandler).toBeDefined();

      await act(async () => {
        notificationHandler?.({
          payload: {
            accountId: 7,
            message: {
              method: "account/login/completed",
              params: {
                success: true,
                loginId: "login-1",
              },
            },
          },
        });
      });

      const accountButton = await screen.findByLabelText("Codex account");
      expect(within(accountButton).getByText("dev@example.com")).toBeInTheDocument();
      expect(within(accountButton).getByText("Pro")).toBeInTheDocument();

      await user.click(accountButton);
      expect(await screen.findByLabelText("Log out of Codex")).toBeInTheDocument();
      expect(screen.getByText("Refresh account")).toBeInTheDocument();
      expect(screen.queryByLabelText("Stop Codex")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Codex accounts")).not.toBeInTheDocument();

      await user.click(screen.getByLabelText("Log out of Codex"));
      await waitFor(() => expect(mocks.logoutCodexAccountMock).toHaveBeenCalledWith(7));
      expect(await screen.findByText("Sign in to Codex")).toBeInTheDocument();
      expect(screen.queryByLabelText("Codex account")).not.toBeInTheDocument();
    });

  it("refreshes account state with polling when login completion notifications are missed", async () => {
      mocks.readCodexAccountMock
        .mockResolvedValueOnce({
          account: {
            type: "chatgpt",
            email: "poll@example.com",
            planType: "plus",
          },
          requiresOpenaiAuth: true,
        });

      const { user } = await renderApp();
      await user.click(screen.getByLabelText("Sign in to Codex"));

      await waitFor(() => expect(mocks.openUrlMock).toHaveBeenCalledWith("https://example.com/auth"));

      const accountButton = await screen.findByLabelText(
        "Codex account",
        {},
        { timeout: 3500 },
      );
      expect(within(accountButton).getByText("poll@example.com")).toBeInTheDocument();
      expect(within(accountButton).getByText("Plus")).toBeInTheDocument();
    });

  it("refreshes account state from account/updated notifications", async () => {
      mocks.listCodexAccountsMock.mockResolvedValue([signedInAccount]);
      mocks.readCodexAccountMock
        .mockResolvedValueOnce({
          account: null,
          requiresOpenaiAuth: true,
        })
        .mockResolvedValueOnce({
          account: {
            type: "chatgpt",
            email: "updated@example.com",
            planType: "plus",
          },
          requiresOpenaiAuth: true,
        });

      await renderApp();

      const notificationHandler = mocks.listeners.get("codex:notification");
      expect(notificationHandler).toBeDefined();

      await act(async () => {
        notificationHandler?.({
          payload: {
            accountId: 7,
            message: {
              method: "account/updated",
              params: {
                authMode: "chatgpt",
                planType: "plus",
              },
            },
          },
        });
      });

      const accountButton = await screen.findByLabelText("Codex account");
      expect(within(accountButton).getByText("updated@example.com")).toBeInTheDocument();
      expect(within(accountButton).getByText("Plus")).toBeInTheDocument();
    });

  it("adds a second isolated account from the account menu", async () => {
      mocks.listCodexAccountsMock.mockResolvedValue([signedInAccount]);
      mocks.createCodexAccountMock.mockResolvedValue({
        ...pendingAccount,
        id: 8,
      });
      mocks.readCodexAccountMock.mockResolvedValue({
        account: {
          type: "chatgpt",
          email: "dev@example.com",
          planType: "pro",
        },
        requiresOpenaiAuth: true,
      });

      const { user } = await renderApp();
      await user.click(await screen.findByLabelText("Codex account"));
      await user.click(screen.getByRole("button", { name: "Add account" }));

      await waitFor(() => expect(mocks.connectCodexMock).toHaveBeenCalledWith(8));
      expect(mocks.startCodexLoginMock).toHaveBeenCalledWith(8);
      expect(mocks.openUrlMock).toHaveBeenCalledWith("https://example.com/auth");
    });

  it("recovers an active native sign-in after the webview reloads", async () => {
      const signingInAccount = { ...pendingAccount, id: 8 };
      mocks.listCodexAccountsMock.mockResolvedValue([signingInAccount]);
      mocks.readActiveCodexLoginMock.mockResolvedValue({
        accountId: 8,
        loginId: "login-recovered",
        authUrl: "https://example.com/recovered-auth",
        connectionGeneration: 4,
        startedAtMs: Date.now(),
        expiresAtMs: Date.now() + 600_000,
        state: "waiting",
      });

      const { user } = await renderApp();

      expect(await screen.findByText("Waiting for browser sign-in")).toBeInTheDocument();
      expect(mocks.startCodexLoginMock).not.toHaveBeenCalled();
      expect(mocks.openUrlMock).toHaveBeenCalledWith(
        "https://example.com/recovered-auth",
      );
      await user.click(screen.getByRole("button", { name: "Settings" }));
      expect(await screen.findByText(/Signing in/)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Cancel sign-in" }));

      expect(mocks.cancelCodexLoginMock).toHaveBeenCalledWith(
        8,
        "login-recovered",
      );
      expect(mocks.deleteCodexProfileMock).toHaveBeenCalledWith(8);
    });

  it("recovers a login id that arrives after the webview reloads", async () => {
      const now = Date.now();
      const startingLogin = {
        accountId: 8,
        loginId: null,
        authUrl: null,
        connectionGeneration: 4,
        startedAtMs: now,
        expiresAtMs: now + 600_000,
        state: "starting" as const,
      };
      mocks.listCodexAccountsMock.mockResolvedValue([
        { ...pendingAccount, id: 8 },
      ]);
      mocks.readActiveCodexLoginMock
        .mockResolvedValueOnce(startingLogin)
        .mockResolvedValue({
          ...startingLogin,
          loginId: "login-after-reload",
          authUrl: "https://example.com/after-reload",
          state: "waiting",
        });

      await renderApp();

      expect(await screen.findByText("Waiting for browser sign-in")).toBeInTheDocument();
      expect(mocks.startCodexLoginMock).not.toHaveBeenCalled();
      expect(mocks.openUrlMock).toHaveBeenCalledWith(
        "https://example.com/after-reload",
      );
    });

  it("reconciles a stranded active-login error during startup", async () => {
      mocks.listCodexAccountsMock.mockResolvedValue([
        {
          ...pendingAccount,
          id: 11,
          status: "error",
          last_error: "Another Codex sign-in is already active for account 10",
        },
      ]);

      await renderApp();

      await waitFor(() =>
        expect(mocks.updateCodexAccountMock).toHaveBeenCalledWith(11, {
          status: "signed_out",
          lastError: null,
        }),
      );
    });

  it("adds another account while the selected account has an active turn", async () => {
      prepareSignedInRun();
      mocks.createCodexAccountMock.mockResolvedValue({
        ...pendingAccount,
        id: 8,
      });
      const { user } = await renderApp();
      await startMockRun(user, "Keep working in this account");

      await user.click(await screen.findByLabelText("Codex account"));
      const addAccount = screen.getByRole("button", { name: "Add account" });
      expect(addAccount).toBeEnabled();
      await user.click(addAccount);

      await waitFor(() => expect(mocks.startCodexLoginMock).toHaveBeenCalledWith(8));
      expect(mocks.codexRpcMock).not.toHaveBeenCalledWith(
        7,
        "turn/interrupt",
        expect.anything(),
      );
    });

  it("renders account actions as an anchored popover", async () => {
      mocks.listCodexAccountsMock.mockResolvedValue([signedInAccount]);
      mocks.readCodexAccountMock.mockResolvedValue({
        account: {
          type: "chatgpt",
          email: signedInAccount.email,
          planType: signedInAccount.plan_type,
        },
        requiresOpenaiAuth: true,
      });

      const { user } = await renderApp();
      const accountButton = await screen.findByLabelText("Codex account");
      await user.click(accountButton);

      const menu = document.getElementById("codex-account-menu");
      expect(menu).toBeInTheDocument();
      expect(menu).toHaveClass("account-menu");
      expect(accountButton).toHaveAttribute("aria-expanded", "true");
      expect(accountButton.closest(".account-card")).toContainElement(menu);
    });

  it("closes the account actions popover when clicking elsewhere on the screen", async () => {
      mocks.listCodexAccountsMock.mockResolvedValue([signedInAccount]);
      mocks.readCodexAccountMock.mockResolvedValue({
        account: {
          type: "chatgpt",
          email: signedInAccount.email,
          planType: signedInAccount.plan_type,
        },
        requiresOpenaiAuth: true,
      });

      const { user } = await renderApp();
      const accountButton = await screen.findByLabelText("Codex account");
      await user.click(accountButton);

      expect(document.getElementById("codex-account-menu")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /analytics/i }));

      await waitFor(() =>
        expect(document.getElementById("codex-account-menu")).not.toBeInTheDocument(),
      );
      expect(accountButton).toHaveAttribute("aria-expanded", "false");
    });

  it("switches accounts from the account menu", async () => {
      mocks.listCodexAccountsMock.mockResolvedValue([
        signedInAccount,
        signedInAccount2,
      ]);
      mocks.readCodexAccountMock.mockImplementation(async (accountId: number) => ({
        account: {
          type: "chatgpt",
          email:
            accountId === signedInAccount2.id
              ? signedInAccount2.email
              : signedInAccount.email,
          planType:
            accountId === signedInAccount2.id
              ? signedInAccount2.plan_type
              : signedInAccount.plan_type,
        },
        requiresOpenaiAuth: true,
      }));
      mocks.readCodexAccountMock.mockImplementation(async (accountId: number) => ({
        account: {
          type: "chatgpt",
          email:
            accountId === signedInAccount2.id
              ? signedInAccount2.email
              : signedInAccount.email,
          planType:
            accountId === signedInAccount2.id
              ? signedInAccount2.plan_type
              : signedInAccount.plan_type,
        },
        requiresOpenaiAuth: true,
      }));

      const { user } = await renderApp();
      await user.click(await screen.findByLabelText("Codex account"));
      const accountList = screen.getByLabelText("Codex accounts");
      expect(
        within(accountList).queryByRole("button", { name: /dev@example.com/i }),
      ).not.toBeInTheDocument();
      await user.click(
        within(accountList).getByRole("button", { name: /personal@example.com/i }),
      );

      await waitFor(() =>
        expect(
          screen.getByRole("combobox", { name: "Run account" }),
        ).toHaveTextContent("personal@example.com"),
      );
    });

  it("rejects and removes a second profile with the same email address", async () => {
      mocks.listCodexAccountsMock.mockResolvedValue([signedInAccount]);
      mocks.createCodexAccountMock.mockResolvedValue({
        ...pendingAccount,
        id: 8,
      });
      mocks.readCodexAccountMock.mockResolvedValue({
        account: {
          type: "chatgpt",
          email: signedInAccount.email,
          planType: "pro",
        },
        requiresOpenaiAuth: true,
      });

      const { user } = await renderApp();
      await user.click(await screen.findByLabelText("Codex account"));
      await user.click(screen.getByRole("button", { name: "Add account" }));

      const notificationHandler = mocks.listeners.get("codex:notification");
      await act(async () => {
        notificationHandler?.({
          payload: {
            accountId: 8,
            message: {
              method: "account/login/completed",
              params: {
                success: true,
                loginId: "login-1",
              },
            },
          },
        });
      });

      await waitFor(() =>
        expect(mocks.deleteCodexProfileMock).toHaveBeenCalledWith(8),
      );
      expect(mocks.softDeleteCodexAccountMock).toHaveBeenCalledWith(8);
      expect(
        mocks.updateCodexAccountMock,
      ).not.toHaveBeenCalledWith(
        8,
        expect.objectContaining({ email: signedInAccount.email }),
      );

      const accountButton = await screen.findByLabelText("Codex account");
      expect(
        within(accountButton).getByText(signedInAccount.email),
      ).toBeInTheDocument();
      await user.click(accountButton);
      expect(screen.queryByLabelText("Codex accounts")).not.toBeInTheDocument();
    });

  it("keeps account notifications isolated by account id", async () => {
      mocks.listCodexAccountsMock.mockResolvedValue([
        signedInAccount,
        signedInAccount2,
      ]);
      mocks.readCodexAccountMock.mockImplementation(async (accountId: number) => ({
        account: {
          type: "chatgpt",
          email:
            accountId === signedInAccount2.id
              ? "updated-personal@example.com"
              : signedInAccount.email,
          planType: accountId === signedInAccount2.id ? "plus" : "pro",
        },
        requiresOpenaiAuth: true,
      }));

      await renderApp();
      const selectedButton = await screen.findByLabelText("Codex account");
      expect(within(selectedButton).getByText("dev@example.com")).toBeInTheDocument();

      await act(async () => {
        mocks.listeners.get("codex:notification")?.({
          payload: {
            accountId: 8,
            message: {
              method: "account/updated",
              params: { authMode: "chatgpt", planType: "plus" },
            },
          },
        });
      });

      expect(within(selectedButton).getByText("dev@example.com")).toBeInTheDocument();
      expect(
        within(selectedButton).queryByText("updated-personal@example.com"),
      ).not.toBeInTheDocument();
    });

  it("removes only the selected managed account profile", async () => {
      mocks.listCodexAccountsMock.mockResolvedValue([signedInAccount]);
      mocks.readCodexAccountMock.mockResolvedValue({
        account: {
          type: "chatgpt",
          email: signedInAccount.email,
          planType: signedInAccount.plan_type,
        },
        requiresOpenaiAuth: true,
      });

      const { user } = await renderApp();
      await user.click(screen.getByRole("button", { name: "Settings" }));
      await user.click(
        await screen.findByRole("button", { name: "Remove dev@example.com" }),
      );

      expect(mocks.deleteCodexProfileMock).toHaveBeenCalledWith(7);
      expect(mocks.softDeleteCodexAccountMock).toHaveBeenCalledWith(7);
    });

  it("records the selected account when creating a run", async () => {
      prepareSignedInRun();

      const { user } = await renderApp();
      await user.type(screen.getByLabelText("Prompt"), "Fix the auth flow");
      await user.click(screen.getByRole("button", { name: /run codex/i }));

      await waitFor(() =>
        expect(mocks.createRunMock).toHaveBeenCalledWith(
          expect.objectContaining({
            accountId: 7,
            accountLabel: "dev@example.com",
            accountEmail: "dev@example.com",
          }),
        ),
      );
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "thread/start",
        expect.any(Object),
      );
      expect(screen.getByLabelText("Prompt")).toHaveValue("");
      const transcript = screen.getByLabelText("Task chat transcript");
      expect(transcript).toBeInTheDocument();
      expect(within(transcript).getByLabelText("Submitted prompt")).toHaveTextContent(
        "Fix the auth flow",
      );
      expect(screen.queryByLabelText("Run history")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Codex run console")).not.toBeInTheDocument();
    });

  it("keeps Computer Use least-privilege by default and persists Settings changes", async () => {
      mocks.readDesktopRuntimeStatusMock.mockResolvedValueOnce({
        available: true,
        message: null,
        version: "1.0.1000816",
        serviceCompatible: true,
        accessibilityTrusted: null,
        screenRecordingTrusted: null,
      });
      mocks.codexDefaultProfileRpcMock.mockImplementation(async (method) =>
        method === "plugin/list"
          ? {
              marketplaces: [{
                name: "openai-bundled",
                path: null,
                plugins: [{
                  id: "computer-use@openai-bundled",
                  name: "computer-use",
                  version: "1.0.1000816",
                  localVersion: "1.0.1000816",
                  installed: true,
                  enabled: true,
                  installPolicy: "INSTALLED_BY_DEFAULT",
                  authPolicy: "ON_USE",
                  availability: "AVAILABLE",
                  interface: { displayName: "Computer Use" },
                  keywords: [],
                }],
              }],
              marketplaceLoadErrors: [],
              featuredPluginIds: [],
            }
          : undefined,
      );
      const { user } = await renderApp();
      await user.click(screen.getByRole("button", { name: "Settings" }));

      expect(
        await screen.findByRole("button", {
          name: "Computer Use access not verified. Show details",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", {
          name: /computer use\s*review permissions/i,
        }),
      ).toBeInTheDocument();

      const computerUse = screen.getByRole("checkbox", {
        name: /any approved app/i,
      });
      await waitFor(() => expect(computerUse).toBeEnabled());
      expect(computerUse).not.toBeChecked();

      await user.click(computerUse);
      expect(computerUse).toBeChecked();
      expect(
        JSON.parse(localStorage.getItem("orchestrator.interaction.v2")!),
      ).toEqual({ computerUseEnabled: true });
    });

  it("does not inject a custom Browser backend into ordinary runs", async () => {
      prepareSignedInRun();

      const { user } = await renderApp();
      await startMockRun(user, "Make this change without a browser");

      const threadStart = mocks.codexRpcMock.mock.calls.find(
        ([, method]) => method === "thread/start",
      );
      expect(JSON.stringify(threadStart?.[2])).not.toContain(
        "shell_environment_policy",
      );
      expect(JSON.stringify(threadStart?.[2])).not.toContain(
        "control-in-app-browser",
      );
    });

  it("does not emit legacy Browser availability events", async () => {
      prepareSignedInRun();

      const { user } = await renderApp();
      await startMockRun(user, "Continue without browser control");

      expect(
        mocks.appendRunEventMock.mock.calls.some(
          ([event]) => event.method === "browser/availability",
        ),
      ).toBe(false);
      const threadStart = mocks.codexRpcMock.mock.calls.find(
        ([, method]) => method === "thread/start",
      );
      expect(threadStart?.[2]?.config).not.toEqual(
        expect.objectContaining({
          shell_environment_policy: expect.anything(),
        }),
      );
    });

  it("routes an unavailable Browser plugin to Plugins", async () => {
      const { user } = await renderApp();
      await user.click(screen.getByRole("button", { name: "Settings" }));

      const settings = screen.getByRole("region", {
        name: "Browser settings",
      });
      expect(await within(settings).findByText("Unavailable")).toBeInTheDocument();
      expect(within(settings).getByRole("alert")).toHaveTextContent(
        "Browser plugin is not available from configured marketplaces.",
      );
      expect(
        within(settings).getByRole("button", {
          name: "Open Plugins for the in-app browser",
        }),
      ).toBeVisible();
    });

  it("does not force Browser into a run that did not select the plugin", async () => {
      prepareSignedInRun();

      const { user } = await renderApp();
      await startMockRun(user, "Check the app without adding capabilities");

      const threadStart = mocks.codexRpcMock.mock.calls.find(
        ([, method]) => method === "thread/start",
      );
      const turnStart = mocks.codexRpcMock.mock.calls.find(
        ([, method]) => method === "turn/start",
      );
      expect(JSON.stringify(threadStart?.[2])).not.toContain(
        "shell_environment_policy",
      );
      expect(JSON.stringify(turnStart?.[2])).not.toContain(
        "control-in-app-browser",
      );
    });

  it("does not force-refresh skills when an ordinary run starts", async () => {
      prepareSignedInRun();

      const { user } = await renderApp();
      await startMockRun(user, "Verify the local app");

      expect(
        mocks.listCodexSkillsMock.mock.calls.some(
          ([, options]) => options?.forceReload === true,
        ),
      ).toBe(false);
      expect(
        mocks.codexRpcMock.mock.calls.some(
          ([, method]) => method === "turn/start",
        ),
      ).toBe(true);
    });

  it("generates a concise chat title without delaying the initial turn", async () => {
      prepareSignedInRun();
      let resolveTitle!: (value: { title: string }) => void;
      mocks.generateChatTitleMock.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveTitle = resolve;
        }),
      );
      const pendingChat = {
        ...workspaceChatFixture({
          id: 401,
          title: "Generating title...",
          status: "running",
        }),
        title_generation_state: "generating" as const,
      };
      mocks.createChatMock.mockResolvedValueOnce(pendingChat);
      mocks.listWorkspaceChatsMock.mockResolvedValue([pendingChat]);

      const { user } = await renderApp();
      await startMockRun(
        user,
        "Investigate and fix OAuth callback failures in the desktop app",
      );

      expect(mocks.createChatMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Investigate and fix OAuth callback failures in",
          generateTitle: true,
        }),
      );
      await waitFor(() =>
        expect(mocks.generateChatTitleMock).toHaveBeenCalledWith({
          workspacePath: workspace.path,
          accountId: 7,
          model: null,
          initialPrompt:
            "Investigate and fix OAuth callback failures in the desktop app",
        }),
      );
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "turn/start",
        expect.any(Object),
      );

      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(banner).getByRole("button", { name: /open chat history/i }),
      );
      const drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      expect(within(drawer).getByText("Generating title...")).toBeInTheDocument();

      await act(async () => {
        resolveTitle({ title: "**Repair OAuth Callback Handling.**" });
      });
      await waitFor(() =>
        expect(mocks.completeChatTitleGenerationMock).toHaveBeenCalledWith(
          401,
          "Repair OAuth Callback Handling",
        ),
      );
      expect(
        within(drawer).getByText("Repair OAuth Callback Handling"),
      ).toBeInTheDocument();
    });

  it("recovers interrupted title generation once during startup", async () => {
      await renderApp();

      expect(mocks.recoverAbandonedRunsMock).toHaveBeenCalledTimes(1);
      expect(
        mocks.recoverInterruptedChatTitleGenerationsMock,
      ).toHaveBeenCalledTimes(1);
      expect(
        mocks.recoverAbandonedRunsMock.mock.invocationCallOrder[0],
      ).toBeLessThan(mocks.listWorkspacesMock.mock.invocationCallOrder[0] ?? 0);
      expect(mocks.generateChatTitleMock).not.toHaveBeenCalled();
    });

  it("hydrates persisted workspaces when optional startup recovery fails", async () => {
      mocks.recoverInterruptedKanbanAttemptsMock.mockRejectedValueOnce(
        new Error("Kanban recovery unavailable"),
      );

      await renderApp();

      const workspaceNav = screen.getByRole("navigation", {
        name: "Workspaces",
      });
      expect(
        within(workspaceNav).getByRole("button", { name: workspace.label }),
      ).toHaveAttribute("aria-current", "page");
      expect(
        screen.getByLabelText(/Codex account|Sign in to Codex/),
      ).toBeInTheDocument();
    });

  it("falls back once when AI title generation fails", async () => {
      const warning = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      prepareSignedInRun();
      mocks.generateChatTitleMock.mockRejectedValueOnce(
        new Error("Title generation unavailable"),
      );

      try {
        const { user } = await renderApp();
        await startMockRun(user, "Repair the desktop OAuth callback flow");

        await waitFor(() =>
          expect(mocks.failChatTitleGenerationMock).toHaveBeenCalledWith(401),
        );
        expect(mocks.generateChatTitleMock).toHaveBeenCalledTimes(1);
        expect(mocks.completeChatTitleGenerationMock).not.toHaveBeenCalled();
        expect(warning).toHaveBeenCalledWith(
          "AI chat title generation failed for chat 401; using the prompt-based fallback.",
          expect.any(Error),
        );
      } finally {
        warning.mockRestore();
      }
    });

  it("uses Ask for approval for new threads and turns by default", async () => {
      prepareSignedInRun();

      const { user } = await renderApp();
      expect(screen.getByRole("combobox", { name: "Access" })).toHaveTextContent(
        "Ask for approval",
      );

      await startMockRun(user, "Run with native approvals");
      const threadStart = mocks.codexRpcMock.mock.calls.find(
        (call) => call[1] === "thread/start",
      );
      const turnStart = mocks.codexRpcMock.mock.calls.find(
        (call) => call[1] === "turn/start",
      );
      expect(threadStart?.[2]).toEqual(
        expect.objectContaining({
          approvalPolicy: "untrusted",
          approvalsReviewer: "user",
          permissions: ASK_FOR_APPROVAL_PERMISSION_PROFILE,
        }),
      );
      expect(turnStart?.[2]).toEqual(
        expect.objectContaining({
          approvalPolicy: "untrusted",
          approvalsReviewer: "user",
          permissions: ASK_FOR_APPROVAL_PERMISSION_PROFILE,
        }),
      );
      expect(mocks.createRunMock).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalPolicy: "untrusted",
          sandbox: "workspace-write",
        }),
      );
    });

  it("sends and persists Full access on every turn", async () => {
      prepareSignedInRun();
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

      const { user } = await renderApp();
      await user.click(screen.getByRole("combobox", { name: "Access" }));
      await user.click(screen.getByRole("option", { name: "Full access" }));
      expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/full access removes/i));

      await startMockRun(user, "First guarded turn");
      const threadStart = mocks.codexRpcMock.mock.calls.find(
        (call) => call[1] === "thread/start",
      );
      const firstTurnStart = mocks.codexRpcMock.mock.calls.find(
        (call) => call[1] === "turn/start",
      );
      expect(threadStart?.[2]).toEqual(
        expect.objectContaining({
          approvalPolicy: "never",
          approvalsReviewer: "user",
          permissions: ":danger-full-access",
        }),
      );
      expect(firstTurnStart?.[2]).toEqual(
        expect.objectContaining({
          approvalPolicy: "never",
          approvalsReviewer: "user",
          permissions: ":danger-full-access",
        }),
      );
      expect(mocks.createRunMock).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalPolicy: "never",
          sandbox: "danger-full-access",
        }),
      );
      expect(JSON.parse(localStorage.getItem("orchestrator.codex-access.v2")!)).toEqual({
        accessMode: "full-access",
      });
      expect(screen.getByRole("combobox", { name: "Access" })).toBeEnabled();

      await emitCodexNotification({
        method: "turn/completed",
        params: { turn: { id: "turn-1", status: "completed", durationMs: 1000 } },
      });
      await user.type(screen.getByLabelText("Prompt"), "Follow-up guarded turn");
      await user.click(screen.getByRole("button", { name: /run codex/i }));
      await waitFor(() =>
        expect(
          mocks.codexRpcMock.mock.calls.filter((call) => call[1] === "turn/start"),
        ).toHaveLength(2),
      );
      const secondTurnStart = mocks.codexRpcMock.mock.calls.filter(
        (call) => call[1] === "turn/start",
      )[1];
      expect(secondTurnStart[2]).toEqual(
        expect.objectContaining({
          approvalPolicy: "never",
          approvalsReviewer: "user",
          permissions: ":danger-full-access",
        }),
      );
    });

  it("starts a Full-access Goal after Codex verifies the thread permission profile", async () => {
      prepareSignedInRun();
      vi.spyOn(window, "confirm").mockReturnValue(true);
      mocks.codexRpcMock.mockImplementation(
        async (_accountId: number, method: string) => {
          if (method === "thread/start") {
            return {
              thread: { id: "thread-1" },
              approvalPolicy: "never",
              activePermissionProfile: {
                id: ":danger-full-access",
              },
            };
          }
          return {};
        },
      );

      const { user } = await renderApp();
      await user.click(screen.getByRole("combobox", { name: "Access" }));
      await user.click(screen.getByRole("option", { name: "Full access" }));
      await user.click(screen.getByRole("button", { name: "Goal mode" }));
      await startMockRun(user, "Complete the Goal safely");

      await waitFor(() =>
        expect(mocks.updateRunMock).toHaveBeenCalledWith(
          202,
          expect.objectContaining({
            codexTurnId: "turn-1",
            status: "running",
          }),
        ),
      );
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "thread/start",
        expect.objectContaining({ permissions: ":danger-full-access" }),
      );
      expect(mocks.setThreadGoalMock).toHaveBeenCalledWith(
        7,
        "thread-1",
        "Complete the Goal safely",
      );
      expect(
        mocks.codexRpcMock.mock.calls.filter((call) => call[1] === "turn/start"),
      ).toHaveLength(0);
      expect(mocks.codexRpcMock).not.toHaveBeenCalledWith(
        7,
        "turn/interrupt",
        expect.any(Object),
      );
      expect(screen.queryByText(/sandbox mismatch/i)).not.toBeInTheDocument();
    });

  it("fails closed before a turn when the thread reports a different permission profile", async () => {
      prepareSignedInRun();
      mocks.codexRpcMock.mockImplementation(
        async (_accountId: number, method: string) => {
          if (method === "thread/start") {
            return {
              thread: { id: "thread-1" },
              approvalPolicy: "untrusted",
              activePermissionProfile: { id: ":danger-full-access" },
            };
          }
          if (method === "turn/start") {
            return { turn: { id: "turn-1" } };
          }
          return {};
        },
      );

      const { user } = await renderApp();
      await user.type(screen.getByLabelText("Prompt"), "Do not weaken access");
      await user.click(screen.getByRole("button", { name: /run codex/i }));

      expect(
        await screen.findByText(/stopped to avoid a sandbox mismatch/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/update codex and retry/i)).toBeInTheDocument();
      expect(
        mocks.codexRpcMock.mock.calls.some((call) => call[1] === "turn/start"),
      ).toBe(false);
      expect(
        mocks.codexRpcMock.mock.calls.some(
          (call) => call[1] === "turn/interrupt",
        ),
      ).toBe(false);
    });

  it("requires confirmation before enabling Full access", async () => {
      prepareSignedInRun();
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

      const { user } = await renderApp();
      await user.click(screen.getByRole("combobox", { name: "Access" }));
      await user.click(screen.getByRole("option", { name: "Full access" }));

      expect(confirm).toHaveBeenCalledWith(
        expect.stringMatching(/disables native approval prompts/i),
      );
      expect(screen.getByRole("combobox", { name: "Access" })).toHaveTextContent(
        "Ask for approval",
      );
      expect(localStorage.getItem("orchestrator.codex-access.v2")).toBeNull();
    });

  it("reuses the same Codex thread for follow-up prompts in one chat", async () => {
      prepareSignedInRun();

      const { user } = await renderApp();
      await startMockRun(user, "First prompt");
      await emitCodexNotification({
        method: "turn/completed",
        params: { turn: { status: "completed", durationMs: 1000 } },
      });

      await user.type(screen.getByLabelText("Prompt"), "Follow-up prompt");
      await user.click(screen.getByRole("button", { name: /run codex/i }));
      await waitFor(() =>
        expect(
          mocks.codexRpcMock.mock.calls.filter((call) => call[1] === "turn/start"),
        ).toHaveLength(2),
      );

      const threadStarts = mocks.codexRpcMock.mock.calls.filter(
        (call) => call[1] === "thread/start",
      );
      const turnStarts = mocks.codexRpcMock.mock.calls.filter(
        (call) => call[1] === "turn/start",
      );
      expect(threadStarts).toHaveLength(1);
      expect(turnStarts[1]?.[2]).toEqual(
        expect.objectContaining({ threadId: "thread-1" }),
      );
      expect(mocks.createChatMock).toHaveBeenCalledTimes(1);
      expect(mocks.createTaskMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ chatId: 401, turnIndex: 2 }),
      );
      expect(mocks.createRunMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ chatId: 401, turnIndex: 2 }),
      );
    });

  it("hands an idle chat to another account on a fresh thread", async () => {
      prepareSignedInRun();
      mocks.listCodexAccountsMock.mockResolvedValue([
        signedInAccount,
        signedInAccount2,
      ]);
      mocks.readCodexAccountMock.mockImplementation(async (accountId: number) => ({
        account: {
          type: "chatgpt",
          email:
            accountId === signedInAccount2.id
              ? signedInAccount2.email
              : signedInAccount.email,
          planType:
            accountId === signedInAccount2.id
              ? signedInAccount2.plan_type
              : signedInAccount.plan_type,
        },
        requiresOpenaiAuth: true,
      }));
      mocks.listCodexModelsMock.mockResolvedValue([defaultCodexModel]);
      const historicalChat = workspaceChatFixture({
        id: 451,
        title: "Build Snake controls",
        codex_thread_id: "thread-account-7",
        turn_count: 2,
      });
      const historicalRuns = [
        workspaceRunFixture({
          id: 351,
          chat_id: historicalChat.id,
          turn_index: 1,
          original_prompt: "Build responsive Snake controls",
          final_message: "Prepared a focused implementation plan.",
          completed_plan_text: "# Plan\n\nAdd keyboard and touch controls.",
          plan_review_state: "approved",
          run_intent: "plan",
        }),
        workspaceRunFixture({
          id: 352,
          chat_id: historicalChat.id,
          turn_index: 2,
          original_prompt: "Implement the plan.",
          final_message: "Implemented the control system.",
          run_intent: "plan-implementation",
        }),
      ];
      mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
      mocks.getChatWithRunsMock.mockResolvedValue(
        workspaceChatWithRunsFixture(historicalChat, historicalRuns),
      );
      mocks.codexRpcMock.mockImplementation(
        async (accountId: number, method: string) => {
          if (method === "thread/start") {
            expect(accountId).toBe(8);
            return { thread: { id: "thread-account-8" } };
          }
          if (method === "turn/start") {
            expect(accountId).toBe(8);
            return { turn: { id: "turn-account-8" } };
          }
          return {};
        },
      );

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(banner).getByRole("button", { name: /open chat history/i }),
      );
      const drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      await user.click(
        within(drawer).getByRole("button", { name: /build snake controls/i }),
      );
      await screen.findByText("Build responsive Snake controls");

      await user.click(screen.getByRole("combobox", { name: "Run account" }));
      await user.click(
        screen.getByRole("option", { name: "personal@example.com" }),
      );
      const handoffDialog = await screen.findByRole("dialog", {
        name: "Switch account for this chat?",
      });
      expect(handoffDialog).toHaveTextContent(/fresh Codex thread/i);
      await user.click(
        within(handoffDialog).getByRole("button", { name: "Switch account" }),
      );
      await waitFor(() =>
        expect(
          screen.getByRole("combobox", { name: "Run account" }),
        ).toHaveTextContent("personal@example.com"),
      );

      await user.type(screen.getByLabelText("Prompt"), "Polish gamepad input");
      await user.keyboard("{Enter}");

      await waitFor(() =>
        expect(mocks.activateChatAccountHandoffMock).toHaveBeenCalledWith({
          chatId: 451,
          expectedProfileKey: "account:7",
          expectedThreadId: "thread-account-7",
          accountId: 8,
          profileKey: "account:8",
          codexThreadId: "thread-account-8",
          status: "running",
        }),
      );
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        8,
        "thread/start",
        expect.any(Object),
      );
      expect(mocks.codexRpcMock).not.toHaveBeenCalledWith(
        8,
        "thread/resume",
        expect.objectContaining({ threadId: "thread-account-7" }),
      );
      const handoffTurn = mocks.codexRpcMock.mock.calls.find(
        (call) =>
          call[0] === 8 &&
          call[1] === "turn/start" &&
          (call[2] as { threadId?: string })?.threadId === "thread-account-8",
      );
      const handoffContext = (
        handoffTurn?.[2] as {
          additionalContext?: Record<string, { value?: string }>;
        }
      )?.additionalContext?.["chat:previous-turns"]?.value;
      expect(handoffContext).toContain("Build responsive Snake controls");
      expect(handoffContext).toContain("Add keyboard and touch controls");
      expect(handoffContext).toContain("Implemented the control system");
      expect(handoffContext).not.toContain("User: Implement the plan.");
    });

  it("fails the queued handoff without changing the current chat owner", async () => {
      prepareSignedInRun();
      mocks.listCodexAccountsMock.mockResolvedValue([
        signedInAccount,
        signedInAccount2,
      ]);
      mocks.readCodexAccountMock.mockImplementation(async (accountId: number) => ({
        account: {
          type: "chatgpt",
          email:
            accountId === signedInAccount2.id
              ? signedInAccount2.email
              : signedInAccount.email,
          planType:
            accountId === signedInAccount2.id
              ? signedInAccount2.plan_type
              : signedInAccount.plan_type,
        },
        requiresOpenaiAuth: true,
      }));
      mocks.listCodexModelsMock.mockResolvedValue([defaultCodexModel]);
      mocks.activateChatAccountHandoffMock.mockResolvedValue(false);
      const historicalChat = workspaceChatFixture({
        id: 452,
        title: "Keep original ownership",
        codex_thread_id: "thread-account-7",
      });
      const historicalRun = workspaceRunFixture({
        id: 353,
        chat_id: historicalChat.id,
        turn_index: 1,
        original_prompt: "Create the initial implementation",
        final_message: "Created the initial implementation.",
      });
      mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
      mocks.getChatWithRunsMock.mockResolvedValue(
        workspaceChatWithRunsFixture(historicalChat, [historicalRun]),
      );
      mocks.codexRpcMock.mockImplementation(
        async (accountId: number, method: string) => {
          if (method === "thread/start") {
            expect(accountId).toBe(8);
            return { thread: { id: "thread-account-8" } };
          }
          if (method === "turn/start") {
            return { turn: { id: "turn-account-8" } };
          }
          return {};
        },
      );

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(banner).getByRole("button", { name: /open chat history/i }),
      );
      const drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      await user.click(
        within(drawer).getByRole("button", {
          name: /keep original ownership/i,
        }),
      );
      await screen.findByText("Create the initial implementation");

      await user.click(screen.getByRole("combobox", { name: "Run account" }));
      await user.click(
        screen.getByRole("option", { name: "personal@example.com" }),
      );
      const handoffDialog = await screen.findByRole("dialog", {
        name: "Switch account for this chat?",
      });
      await user.click(
        within(handoffDialog).getByRole("button", { name: "Switch account" }),
      );

      const prompt = screen.getByLabelText("Prompt");
      await user.type(prompt, "Retry this handoff");
      await user.keyboard("{Enter}");

      await waitFor(() =>
        expect(mocks.codexRpcMock).toHaveBeenCalledWith(
          8,
          "turn/interrupt",
          {
            threadId: "thread-account-8",
            turnId: "turn-account-8",
          },
        ),
      );
      expect(prompt).toHaveValue("");
      expect(screen.queryByText("Queue paused")).not.toBeInTheDocument();
      expect(screen.getByText("Queued")).toBeInTheDocument();
      expect(mocks.failPromptQueueItemMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringMatching(/persist|ownership|activate/i),
      );
      expect(mocks.updateChatMock).not.toHaveBeenCalledWith(
        452,
        expect.objectContaining({ status: "failed" }),
      );
    });
});
