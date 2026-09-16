import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appServices,
  emitCodexNotification,
  emitCodexServerRequest,
  getMocks,
  holdNextAnimationFrames,
  prepareDefaults,
  prepareSignedInRun,
  renderApp,
  startMockRun,
} from "./test/appRuntimeHarness";

const mocks = getMocks();
let visible = true;
async function setVisible(value: boolean) {
  await act(async () => {
    visible = value;
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  mocks.listeners.clear();
  vi.clearAllMocks();
  mocks.virtuosoState = { ranges: [{ startIndex: 0, endIndex: 0 }], scrollTop: 0 };
  localStorage.clear();
  prepareDefaults();
  prepareSignedInRun();
  visible = true;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visible ? "visible" : "hidden");
});
afterEach(() => {
  cleanup();
  appServices?.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("background presentation updates", () => {
  it("keeps hidden output authoritative without publishing it and catches up on return", async () => {
    const { user } = await renderApp();
    await startMockRun(user, "Inspect the background output");
    await setVisible(false);
    vi.useFakeTimers();
    const control = [...appServices.activeRuns.values()][0];
    expect(control).toBeDefined();
    for (const delta of ["Hidden ", "stream ", "output"]) {
      await emitCodexNotification({
        method: "item/agentMessage/delta",
        params: { threadId: "thread-1", turnId: "turn-1", itemId: "hidden-output", delta },
      });
    }
    await act(async () => vi.advanceTimersByTimeAsync(100));
    expect(control.runView.agentMessagesById["hidden-output"].text).toBe("Hidden stream output");
    expect(screen.queryByText("Hidden stream output")).not.toBeInTheDocument();
    const elapsed = control.runView.elapsedMs;
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(control.runView.elapsedMs).toBe(elapsed);
    await setVisible(true);
    expect(screen.getByText("Hidden stream output")).toBeInTheDocument();
    expect(control.runView.elapsedMs).toBeGreaterThanOrEqual(elapsed + 10_000);
  });

  it("flushes hidden deltas before completion, persists and notifies without any frames", async () => {
    mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue("allowed");
    const { user } = await renderApp();
    await startMockRun(user, "Finish the hidden task");
    const frames = holdNextAnimationFrames();
    await setVisible(false);
    const gitCallsBefore = mocks.listWorkspaceGitStatusMock.mock.calls.length;
    await emitCodexNotification({
      method: "item/agentMessage/delta",
      params: { itemId: "final-hidden", delta: "Finished while hidden." },
    });
    // Omit text so the completed item must consume the queued streaming delta.
    await emitCodexNotification({
      method: "item/completed",
      params: { item: { type: "agentMessage", id: "final-hidden", phase: "final_answer" } },
    });
    await emitCodexNotification({
      method: "turn/completed",
      params: { turn: { id: "turn-1", status: "completed", durationMs: 1234 } },
    });
    await waitFor(() => expect(mocks.updateRunMock).toHaveBeenCalledWith(202, expect.objectContaining({
      status: "completed", durationMs: 1234, finalMessage: "Finished while hidden.",
    })));
    await waitFor(() => expect(mocks.sendAgentNotificationMock).toHaveBeenCalledWith(expect.objectContaining({
      title: "Response complete", target: expect.objectContaining({ kind: "response-completed", runId: 202 }),
    })));
    expect(mocks.listWorkspaceGitStatusMock.mock.calls.length).toBeGreaterThan(gitCallsBefore);
    await setVisible(true);
    expect(screen.getByLabelText("Run summary")).toHaveTextContent("Finished while hidden.");
    frames.restore();
  });

  it("continues an eligible queued prompt while hidden with suspended animation frames", async () => {
    const { user } = await renderApp();
    await startMockRun(user, "Start the active task");
    await user.type(screen.getByLabelText("Prompt"), "Continue in the background");
    await user.click(screen.getByRole("button", { name: "Add prompt to queue" }));
    const frames = holdNextAnimationFrames();
    await setVisible(false);
    await emitCodexNotification({
      method: "turn/completed",
      params: { threadId: "thread-1", turnId: "turn-1", turn: { id: "turn-1", status: "completed", durationMs: 100 } },
    });
    await waitFor(() => expect(mocks.codexRpcMock.mock.calls.filter(([, method]) => method === "turn/start")).toHaveLength(2));
    const secondStart = mocks.codexRpcMock.mock.calls.filter(([, method]) => method === "turn/start")[1];
    expect(secondStart[2].input[0].text).toBe("Continue in the background");
    frames.restore();
  });

  it("handles approval requests immediately and flushes their preceding hidden output", async () => {
    const { user } = await renderApp();
    await startMockRun(user, "Request an approval");
    const frames = holdNextAnimationFrames();
    await setVisible(false);
    await emitCodexNotification({
      method: "item/agentMessage/delta",
      params: { itemId: "before-approval", delta: "Approval context" },
    });
    await emitCodexServerRequest({
      id: 91,
      method: "item/commandExecution/requestApproval",
      params: { threadId: "thread-1", turnId: "turn-1", itemId: "command-1", command: "git status", cwd: "/repo/orchestrator" },
    });
    const control = [...appServices.activeRuns.values()][0];
    expect(control.runView.agentMessagesById["before-approval"].text).toBe("Approval context");
    expect(control.runView.approvalRequests).toHaveLength(1);
    frames.restore();
  });
});
