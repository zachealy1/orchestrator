import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMocks,
  defaultCodexModel,
  prepareDefaults,
  prepareSignedInRun,
  renderApp,
  setWindowWidth,
} from "./test/appRuntimeHarness";

const mocks = getMocks();

describe("queue recovery across asynchronous setup settlement", () => {
  beforeEach(() => {
    mocks.listeners.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
    localStorage.clear();
    setWindowWidth(1024);
    document.documentElement.removeAttribute("data-theme");
    mocks.virtuosoState = { ranges: [{ startIndex: 0, endIndex: 0 }], scrollTop: 0 };
    prepareDefaults();
  });

  it("does not let a cancelled in-flight setup fail its replacement retry", async () => {
    prepareSignedInRun();
    let rejectOldPreflight!: (error: Error) => void;
    mocks.runPreflightMock.mockReturnValueOnce(new Promise((_resolve, reject) => {
      rejectOldPreflight = reject;
    }));
    const { user } = await renderApp();
    await user.type(screen.getByLabelText("Prompt"), "Retry after stopping an in-flight setup");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(mocks.runPreflightMock).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: /stop codex/i }));
    await user.click(screen.getByRole("button", { name: /open prompt queue/i }));
    await user.click(screen.getByRole("button", { name: "Retry queued prompt" }));
    await waitFor(() => expect(mocks.createRunMock).toHaveBeenCalledTimes(1));
    const failedBeforeOldSettlement = mocks.failPromptQueueItemMock.mock.calls.length;
    await act(async () => rejectOldPreflight(new Error("Old cancelled preflight failed late")));
    expect(mocks.failPromptQueueItemMock).toHaveBeenCalledTimes(failedBeforeOldSettlement);
    expect(screen.queryByText("Old cancelled preflight failed late")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /stop codex/i })).toBeEnabled();
    expect(screen.getAllByLabelText("Submitted prompt")).toHaveLength(1);
    await waitFor(() => expect(mocks.codexRpcMock.mock.calls.find(([, method]) => method === "turn/start")?.[2].input[0].text).toBe("Retry after stopping an in-flight setup"));
  });

  it("runs an edited held item explicitly without restoring automatic sending", async () => {
    prepareSignedInRun();
    mocks.listCodexModelsMock.mockResolvedValue([defaultCodexModel]);
    let rejectPreflight!: (error: Error) => void;
    mocks.runPreflightMock.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectPreflight = reject; }));
    const { user } = await renderApp();
    await user.click(screen.getByRole("combobox", { name: "Agent" }));
    await user.click(await screen.findByRole("option", { name: defaultCodexModel.displayName }));
    await user.type(screen.getByLabelText("Prompt"), "Held recovery test{Enter}");
    await waitFor(() => expect(mocks.runPreflightMock).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: /stop codex/i }));
    await act(async () => rejectPreflight(new Error("Stopped setup settled")));
    await user.click(screen.getByRole("button", { name: /open prompt queue/i }));
    await user.click(screen.getByRole("button", { name: "Skip automatic sending" }));
    await user.click(screen.getByRole("button", { name: "Edit queued prompt" }));
    await user.clear(screen.getByLabelText("Prompt"));
    await user.type(screen.getByLabelText("Prompt"), "Explicit held-item recovery");
    await user.click(screen.getByRole("button", { name: "Save queued prompt" }));
    await waitFor(() => expect(screen.getByLabelText("Prompt")).toHaveValue(""));
    expect(mocks.createRunMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Run next queued prompt" }));
    await waitFor(() => expect(mocks.createRunMock).toHaveBeenCalledOnce());
    expect(mocks.prioritizePromptQueueItemMock).toHaveBeenCalledOnce();
    expect([...mocks.promptQueueItems.values()][0].autoSendEnabled).toBe(false);
    expect(mocks.setPromptQueueItemAutoSendMock).not.toHaveBeenCalledWith(expect.any(String), true);
  });
});
