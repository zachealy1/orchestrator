import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emitCodexNotification, getMocks, prepareDefaults, prepareKanbanRun,
  prepareSignedInRun, renderApp, setWindowWidth, startMockRun,
  workspaceChatFixture, workspaceChatWithRunsFixture,
} from "./test/appRuntimeHarness";
import { createRunExecutionSettings } from "./lib/runExecutionSettings";

const mocks = getMocks();
const originalPath = "/repo/orchestrator/README.md";
const executionPath = "/repo/.codex-kanban/card-run-control-test/orchestrator/README.md";
const originalPrompt = `Add search examples to [README.md](${originalPath}:1)`;
const executionPrompt = `Add search examples to [README.md](${executionPath}:1)`;

async function prepareMentionRun(goalMode = false) {
  prepareKanbanRun();
  const settings = createRunExecutionSettings({
    accountId: 0, profileKey: "default", selectedBranch: null,
    mode: "run", intent: "normal", accessMode: "ask-for-approval",
    computerUseEnabled: false, model: null, reasoningEffort: null,
    contextFiles: [{ path: originalPath, name: "README.md", source: "search" }],
    selectedSkills: [], goalMode,
  });
  mocks.kanbanLaunchCardOverrides = { executionSettingsJson: JSON.stringify(settings) };
  const claimed = await mocks.claimKanbanAttemptMock();
  mocks.claimKanbanAttemptMock.mockResolvedValue({
    ...claimed, attempt: { ...claimed.attempt, prompt: originalPrompt },
  });
  mocks.readDefaultCodexFileMock.mockImplementation(async (path: string) => {
    if (path === executionPath) return "README from the card branch";
    throw new Error("The original file must not be read");
  });
}

async function launchMentionRun() {
  const rendered = await renderApp();
  await rendered.user.click(await screen.findByRole("radio", { name: "Kanban" }));
  await rendered.user.click(screen.getByRole("button", { name: "Start test Kanban agent" }));
  return rendered;
}

describe("application isolated file context", () => {
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

  it.each([false, true])("sends worktree references and content while preserving saved mentions (Goal: %s)", async (goalMode) => {
    await prepareMentionRun(goalMode);
    await launchMentionRun();
    await waitFor(() => expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "running" }),
    ));
    expect(mocks.readDefaultCodexFileMock).toHaveBeenCalledExactlyOnceWith(executionPath);
    expect(mocks.prepareImageAttachmentMock).not.toHaveBeenCalledWith(originalPath);
    const context = {
      [`file:${executionPath}`]: {
        kind: "untrusted", value: `File: ${executionPath}\n\nREADME from the card branch`,
      },
    };
    if (goalMode) {
      expect(mocks.prepareGoalContextMock).toHaveBeenCalledWith(expect.objectContaining({
        objective: executionPrompt, contextJson: expect.stringContaining(executionPath),
      }));
    } else {
      expect(mocks.codexDefaultProfileRpcMock).toHaveBeenCalledWith("turn/start", expect.objectContaining({
        cwd: "/repo/.codex-kanban/card-run-control-test",
        input: [{ type: "text", text: executionPrompt, text_elements: [] }],
        additionalContext: expect.objectContaining(context),
      }));
    }
    const saved = mocks.createRunMock.mock.calls[0]?.[0];
    expect(JSON.parse(saved.executionSettingsJson).contextFiles).toEqual([
      { path: originalPath, name: "README.md", source: "search" },
    ]);
    expect(mocks.createTaskMock).toHaveBeenCalledWith(expect.objectContaining({ originalPrompt }));
  });

  it("fails before turn/start when the worktree README is missing without reading the source copy", async () => {
    await prepareMentionRun();
    mocks.readDefaultCodexFileMock.mockRejectedValue(new Error("File not found"));
    await launchMentionRun();
    await waitFor(() => expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining(`Attachment README.md (${originalPath}) is unavailable in the isolated worktree at ${executionPath}`),
      }),
    ));
    expect(mocks.readDefaultCodexFileMock).toHaveBeenCalledExactlyOnceWith(executionPath);
    expect(mocks.codexDefaultProfileRpcMock.mock.calls.some(([method]) => method === "turn/start")).toBe(false);
  });

  it("resolves the original mention again when retrying with a repaired worktree binding", async () => {
    await prepareMentionRun();
    mocks.readDefaultCodexFileMock.mockRejectedValue(new Error("File not found"));
    const { user } = await launchMentionRun();
    await waitFor(() => expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    ));
    const bindings = await mocks.loadKanbanGitBindingsMock();
    const repairedRoot = `${bindings[0].executionRoot}/repaired-repo`;
    mocks.loadKanbanGitBindingsMock.mockResolvedValue([{ ...bindings[0], worktreePath: repairedRoot }]);
    mocks.readDefaultCodexFileMock.mockResolvedValue("Repaired worktree README");
    await user.click(screen.getByRole("button", { name: "Start test Kanban agent" }));
    await waitFor(() => expect(mocks.codexDefaultProfileRpcMock).toHaveBeenCalledWith(
      "turn/start", expect.objectContaining({
        input: [{ type: "text", text: `Add search examples to [README.md](${repairedRoot}/README.md:1)`, text_elements: [] }],
        additionalContext: expect.objectContaining({
          [`file:${repairedRoot}/README.md`]: expect.objectContaining({ value: expect.stringContaining("Repaired worktree README") }),
        }),
      }),
    ));
    expect(mocks.readDefaultCodexFileMock).not.toHaveBeenCalledWith(originalPath);
    expect(mocks.createTaskMock.mock.calls.every(([task]) => task.originalPrompt === originalPrompt)).toBe(true);
  });

  it("resolves queued steering against the active card bindings", async () => {
    await prepareMentionRun();
    const { user } = await launchMentionRun();
    await waitFor(() => expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "running" }),
    ));
    const chat = workspaceChatFixture({ id: 777, profile_key: "default", codex_thread_id: "thread-1", status: "running" });
    mocks.getChatRecordMock.mockResolvedValue(chat);
    mocks.getChatWithRunsMock.mockResolvedValue(workspaceChatWithRunsFixture(chat, []));
    await user.click(screen.getByRole("button", { name: "Open test Kanban conversation" }));
    mocks.openDialogMock.mockResolvedValue([originalPath]);
    await user.type(screen.getByLabelText("Prompt"), originalPrompt.replace(/\[/g, "[["));
    await user.click(screen.getByRole("button", { name: "Add files" }));
    await user.click(screen.getByRole("button", { name: "Add prompt to queue" }));
    await user.click(screen.getByRole("button", { name: /^Queue/ }));
    await user.click(screen.getByRole("button", { name: "Send queued prompt now" }));
    await waitFor(() => expect(mocks.codexDefaultProfileRpcMock).toHaveBeenCalledWith(
      "turn/steer", expect.objectContaining({
        input: [{ type: "text", text: executionPrompt, text_elements: [] }],
        additionalContext: expect.objectContaining({
          [`file:${executionPath}`]: expect.objectContaining({ value: expect.stringContaining("README from the card branch") }),
        }),
      }),
    ));
    expect(mocks.readDefaultCodexFileMock).not.toHaveBeenCalledWith(originalPath);
  });

  it("uses persisted continuation bindings when a queued follow-up starts", async () => {
    prepareSignedInRun();
    const { user } = await renderApp();
    await startMockRun(user, "Initial task");
    const bindings = await mocks.loadKanbanGitBindingsMock();
    mocks.listChatWorktreeBindingsMock.mockResolvedValue(bindings);
    mocks.openDialogMock.mockResolvedValue([originalPath]);
    mocks.readCodexFileMock.mockImplementation(async (_accountId: number, path: string) => {
      if (path === executionPath) return "Continuation branch README";
      throw new Error("Unexpected source read");
    });
    await user.type(screen.getByLabelText("Prompt"), originalPrompt.replace(/\[/g, "[["));
    await user.click(screen.getByRole("button", { name: "Add files" }));
    await user.click(screen.getByRole("button", { name: "Add prompt to queue" }));
    await emitCodexNotification({ method: "turn/completed", params: {
      threadId: "thread-1", turn: { id: "turn-1", status: "completed" },
    } });
    await waitFor(() => expect(mocks.codexRpcMock.mock.calls.filter(([, method]) => method === "turn/start")).toHaveLength(2));
    const turn = mocks.codexRpcMock.mock.calls.filter(([, method]) => method === "turn/start")[1][2];
    expect(turn.cwd).toBe(bindings[0].executionRoot);
    expect(turn.input[0].text).toBe(executionPrompt);
    expect(turn.additionalContext[`file:${executionPath}`].value).toContain("Continuation branch README");
    expect(mocks.readCodexFileMock).not.toHaveBeenCalledWith(expect.anything(), originalPath);
  });
});
