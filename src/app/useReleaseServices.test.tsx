import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppServices } from "../runtime/AppServices";
import type { AppUpdateState } from "../generated/tauri";
import { initialUpdateState, BUG_REPORT_URL } from "../features/updates/UpdateController";
import { useReleaseServices } from "./useReleaseServices";

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
});
