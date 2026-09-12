import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppServices } from "../runtime/AppServices";
import type { AppUpdateState } from "../generated/tauri";
import { initialUpdateState, BUG_REPORT_URL } from "../features/updates/UpdateController";
import { useReleaseServices } from "./useReleaseServices";
import { CodexAccountCard } from "../features/accounts/CodexAccountCard";
import { useAccountController } from "../features/accounts/useAccountController";

const mocks = vi.hoisted(() => ({
  state: vi.fn(), check: vi.fn(), download: vi.fn(), install: vi.fn(),
  listen: vi.fn(), unlisten: vi.fn(), openUrl: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: mocks.openUrl }));
vi.mock("../generated/tauri", () => ({ commands: {
  appUpdateState: mocks.state, appUpdateCheck: mocks.check,
  appUpdateDownload: mocks.download, appUpdateInstall: mocks.install,
} }));
vi.mock("../features/engine/useEngineController", () => ({ useEngineController: () => ({ error: null, status: null }) }));

function fixture(signedIn = false) {
  const notices = { notices: [], publish: vi.fn(), dismiss: vi.fn() };
  const close = vi.fn();
  const services = {} as AppServices;
  return { notices, close, ...renderHook(({ signedIn }) =>
    useReleaseServices(services, notices, vi.fn(), () => false, close, signedIn),
  { initialProps: { signedIn } }) };
}

function AccountMenu() {
  const account = useAccountController();
  const close = () => account.setAccountMenuOpen(false);
  const { update, reportBug } = useReleaseServices({} as AppServices,
    { notices: [], publish: vi.fn(), dismiss: vi.fn() }, vi.fn(), () => false, close, true);
  return <CodexAccountCard model={{
    authRow: { title: "test@example.com", subtitle: "Plus", avatarLabel: "T", tone: "signed-in" },
    signedIn: true, menuOpen: account.accountMenuOpen, accounts: [], selectedAccountId: 1,
    activeRunAccountIds: new Set(), runIsActive: false, loginState: "idle", showCancelLogin: false,
    containerRef: account.accountMenuContainerRef, update,
  }} actions={{
    setMenuOpen: account.setAccountMenuOpen, selectAccount: close, addAccount: close,
    manageAccounts: close, refreshAccount: close, reportBug, logout: close, login: vi.fn(), cancelLogin: vi.fn(),
  }} />;
}

describe("release services authentication", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    mocks.state.mockResolvedValue(initialUpdateState);
    mocks.check.mockResolvedValue(initialUpdateState);
    mocks.listen.mockResolvedValue(mocks.unlisten);
    mocks.openUrl.mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  it("does not check for updates or open support while signed out", async () => {
    const { result } = fixture();
    await act(async () => {
      result.current.update.act();
      result.current.reportBug();
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
    });
    expect(mocks.state).not.toHaveBeenCalled();
    expect(mocks.check).not.toHaveBeenCalled();
    expect(mocks.listen).not.toHaveBeenCalled();
    expect(mocks.openUrl).not.toHaveBeenCalled();
  });

  it("enables checks and support after login and stops timers and stale actions after logout", async () => {
    vi.useFakeTimers();
    const { result, rerender, notices } = fixture();
    await act(async () => rerender({ signedIn: true }));
    expect(mocks.check).toHaveBeenCalledOnce();
    await act(async () => result.current.reportBug());
    expect(mocks.openUrl).toHaveBeenCalledWith(BUG_REPORT_URL);
    await act(async () => vi.advanceTimersByTime(6 * 60 * 60 * 1000));
    expect(mocks.check).toHaveBeenCalledTimes(2);
    const staleActions = result.current;
    await act(async () => rerender({ signedIn: false }));
    expect(mocks.unlisten).toHaveBeenCalledOnce();
    expect(notices.dismiss).toHaveBeenCalledWith("application-update");
    mocks.check.mockClear(); mocks.openUrl.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(6 * 60 * 60 * 1000);
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
      staleActions.update.act();
      staleActions.reportBug();
    });
    expect(mocks.check).not.toHaveBeenCalled();
    expect(mocks.openUrl).not.toHaveBeenCalled();
  });

  it("does not announce an update that finishes checking after logout", async () => {
    let finish!: (value: AppUpdateState) => void;
    mocks.check.mockReturnValue(new Promise<AppUpdateState>((resolve) => { finish = resolve; }));
    const { rerender, notices } = fixture(true);
    await waitFor(() => expect(mocks.check).toHaveBeenCalledOnce());
    rerender({ signedIn: false });
    await act(async () => finish({ ...initialUpdateState, phase: "available", version: "0.2.0-beta.3" }));
    expect(notices.publish).not.toHaveBeenCalled();
  });

  it.each(["trigger", "escape", "outside", "menu action"])("clears update feedback when the account menu closes via %s", async (dismissal) => {
    const user = userEvent.setup();
    render(<AccountMenu />);
    await waitFor(() => expect(mocks.check).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "Codex account" }));
    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Orchestrator is up to date.");

    if (dismissal === "trigger") await user.click(screen.getByRole("button", { name: "Codex account" }));
    else if (dismissal === "escape") await user.keyboard("{Escape}");
    else if (dismissal === "outside") await user.click(document.body);
    else await user.click(screen.getByRole("button", { name: "Manage accounts" }));
    expect(screen.queryByRole("button", { name: "Check for updates" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Codex account" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Orchestrator is up to date.");
  });

  it.each([false, true])("does not restore feedback from a check started before dismissal (reopen before completion: %s)", async (reopenFirst) => {
    const user = userEvent.setup();
    render(<AccountMenu />);
    await waitFor(() => expect(mocks.check).toHaveBeenCalledOnce());
    let finish!: (value: AppUpdateState) => void;
    mocks.check.mockReturnValueOnce(new Promise<AppUpdateState>((resolve) => { finish = resolve; }));
    await user.click(screen.getByRole("button", { name: "Codex account" }));
    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
    await user.keyboard("{Escape}");
    if (reopenFirst) await user.click(screen.getByRole("button", { name: "Codex account" }));
    await act(async () => finish(initialUpdateState));
    if (!reopenFirst) await user.click(screen.getByRole("button", { name: "Codex account" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeEnabled();
  });

  it("preserves download progress and the available update across dismissal", async () => {
    const user = userEvent.setup();
    const available = { ...initialUpdateState, phase: "available", version: "0.2.0-beta.3" } as AppUpdateState;
    mocks.check.mockResolvedValue(available);
    let finish!: (value: AppUpdateState) => void;
    mocks.download.mockReturnValueOnce(new Promise<AppUpdateState>((resolve) => { finish = resolve; }));
    render(<AccountMenu />);
    await screen.findByLabelText("App update available");
    await user.click(screen.getByRole("button", { name: "Codex account" }));
    await user.click(screen.getByRole("button", { name: /Download update/ }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Codex account" }));
    expect(screen.getByRole("button", { name: /Downloading….*0.2.0-beta.3/ })).toBeDisabled();
    expect(screen.getByRole("progressbar", { name: "Update download" })).toBeInTheDocument();
    await act(async () => finish({ ...available, phase: "ready" }));
    expect(screen.getByRole("button", { name: /Install and restart.*0.2.0-beta.3/ })).toBeEnabled();
    expect(mocks.download).toHaveBeenCalledOnce();
    expect(mocks.install).not.toHaveBeenCalled();
  });
});
