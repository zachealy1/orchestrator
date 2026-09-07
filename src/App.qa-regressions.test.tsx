import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMocks,
  prepareDefaults,
  prepareSignedInRun,
  renderApp,
  setWindowWidth,
  startMockRun,
  workspace,
  workspaceChatFixture,
  workspaceChatWithRunsFixture,
  workspaceRunFixture,
} from "./test/appRuntimeHarness";
import { createRunExecutionSettings } from "./lib/runExecutionSettings";
import { GENERATED_IMAGE_HANDLING_POLICY } from "./lib/nativePlanMode";

const mocks = getMocks();
const followUp = "What exact marker did you return in the prior turn?";

async function openGoalContinuation() {
  prepareSignedInRun();
  const source = workspaceChatFixture({ id: 701, title: "Completed QA Goal" });
  const run = workspaceRunFixture({
    chat_id: source.id,
    original_prompt: "Reply QA_R2_GOAL_OK and complete the goal.",
    final_message: "QA_R2_GOAL_OK",
    execution_settings_json: JSON.stringify(createRunExecutionSettings({
      accountId: 7, profileKey: "account:7", selectedRepositoryPath: workspace.path,
      selectedBranch: "main", mode: "run", intent: "normal",
      accessMode: "full-access", computerUseEnabled: false,
      model: "previous-model", reasoningEffort: "high",
      contextFiles: [], selectedSkills: [], goalMode: true,
    })),
  });
  mocks.listWorkspaceChatsMock.mockImplementation(async () => [
    source, ...mocks.promptQueueChats.values(),
  ]);
  mocks.getChatWithRunsMock.mockImplementation(async (id: number) =>
    id === source.id ? workspaceChatWithRunsFixture(source, [run]) : {
      chat: mocks.promptQueueChats.get(id), runs: [],
    },
  );
  mocks.createChatMock.mockImplementation(async (input) => {
    const chat = {
      ...workspaceChatFixture({ id: 702, title: input.title, turn_count: 0 }),
      codex_thread_id: null,
      continued_from_chat_id: input.continuedFromChatId,
      continuation_kind: input.continuationKind,
      continuation_settings_json: input.continuationSettingsJson,
      continuation_snapshot_json: JSON.stringify(input.continuationSnapshot),
      continuation_turn_count: input.continuationSnapshot.turns.length,
    };
    mocks.promptQueueChats.set(chat.id, chat);
    return chat;
  });
  const { user } = await renderApp();
  expect(screen.getByRole("button", { name: "Goal mode" })).toHaveAttribute("aria-pressed", "false");
  await user.click(screen.getByRole("button", { name: /open chat history/i }));
  const drawer = await screen.findByRole("complementary", { name: "Workspace chat history" });
  const row = within(drawer).getByText(source.title).closest(".history-run-item")!;
  fireEvent.contextMenu(row, { clientX: 120, clientY: 140 });
  await user.click(screen.getByRole("menuitem", { name: "Continue in new chat" }));
  await screen.findByText("QA_R2_GOAL_OK");
  return user;
}

describe("manual QA regressions", () => {
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

  it("R2-004: does not replay a dismissed Git success when switching workspaces", async () => {
    const other = { ...workspace, id: 2, path: "/repo/qa-other", label: "qa-other" };
    mocks.listWorkspacesMock.mockResolvedValue([workspace, other]);
    mocks.generateWorkspaceCommitMessageMock.mockResolvedValue({ message: "QA change", source: "codex" });
    mocks.listWorkspaceGitStatusMock.mockImplementation(async (workspacePath: string) => ({
      workspacePath, gitRoot: workspacePath, currentBranch: "qa-test",
      aheadCount: 0, hasUpstream: true, hasOrigin: true, canPush: true,
      files: [{
        path: `${workspacePath}/QA.txt`, relativePath: "QA.txt", oldRelativePath: null,
        indexStatus: "M", worktreeStatus: " ", statusKind: "modified", badge: "M",
      }],
    }));
    const { user } = await renderApp();
    const commit = async () => {
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(await within(banner).findByRole("button", { name: /commit or push/i }));
      await user.click(within(screen.getByRole("dialog", { name: "Commit or push" })).getByRole("button", { name: /^commit and push$/i }));
      await screen.findByRole("status", { name: "Commit and push complete" });
    };
    await commit();
    await user.click(screen.getByRole("button", { name: "Dismiss Commit and push complete" }));
    const navigation = screen.getByRole("navigation", { name: "Workspaces" });
    for (let cycle = 0; cycle < 2; cycle += 1) {
      await user.click(within(navigation).getByTitle(other.label));
      await user.click(within(navigation).getByTitle(workspace.label));
      expect(screen.queryByRole("status", { name: "Commit and push complete" })).toBeNull();
    }
    expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledOnce();
    expect(mocks.pushWorkspaceBranchMock).toHaveBeenCalledOnce();
    await commit();
    expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledTimes(2);
    expect(mocks.pushWorkspaceBranchMock).toHaveBeenCalledTimes(2);
  });

  it("R2-006: continues a completed Goal normally using the visible settings and prior answer", async () => {
    const user = await openGoalContinuation();
    expect(screen.getByRole("button", { name: "Goal mode" })).toHaveAttribute("aria-pressed", "false");
    await startMockRun(user, followUp);
    expect(mocks.setThreadGoalMock).not.toHaveBeenCalled();
    const queued = mocks.enqueuePromptQueueItemMock.mock.calls[0][0];
    expect(queued.snapshot.executionSettings).toMatchObject({
      goalMode: false, mode: "run", intent: "normal", accessMode: "ask-for-approval",
    });
    expect(queued.snapshot.executionSettings.model).not.toBe("previous-model");
    const turnCalls = mocks.codexRpcMock.mock.calls.filter(([, method]) => method === "turn/start");
    expect(turnCalls).toHaveLength(1);
    expect(turnCalls[0][2].additionalContext["chat:previous-turns"].value).toContain("QA_R2_GOAL_OK");
    expect(mocks.createRunMock).toHaveBeenCalledWith(expect.objectContaining({
      executionSettingsJson: expect.stringContaining('"goalMode":false'),
    }));
  });

  it("R2-006: delivers prior context before an explicitly enabled Goal starts", async () => {
    const user = await openGoalContinuation();
    await user.click(screen.getByRole("button", { name: "Goal mode" }));
    await startMockRun(user, followUp);
    expect(mocks.setThreadGoalMock).toHaveBeenCalledWith(7, "thread-1", followUp);
    const contextCallIndex = mocks.codexRpcMock.mock.calls.findIndex(([, method, params]) =>
      method === "thread/settings/update" &&
      params.collaborationMode.settings.developer_instructions.includes("QA_R2_GOAL_OK"),
    );
    expect(contextCallIndex).toBeGreaterThanOrEqual(0);
    expect(mocks.codexRpcMock.mock.invocationCallOrder[contextCallIndex]).toBeLessThan(
      mocks.setThreadGoalMock.mock.invocationCallOrder[0],
    );
    expect(mocks.codexRpcMock.mock.calls[contextCallIndex][2].collaborationMode.settings.developer_instructions).toContain(GENERATED_IMAGE_HANDLING_POLICY);
    expect(mocks.codexRpcMock.mock.calls.some(([, method]) => method === "turn/start")).toBe(false);
  });

  it("R2-006: refuses to activate a Goal if delivering its context fails", async () => {
    const user = await openGoalContinuation();
    const rpc = mocks.codexRpcMock.getMockImplementation()!;
    mocks.codexRpcMock.mockImplementation(async (...args) => {
      const [, method, params] = args;
      if (method === "thread/settings/update" && params.collaborationMode.settings.developer_instructions.includes("QA_R2_GOAL_OK")) {
        throw new Error("Context delivery failed");
      }
      return rpc(...args);
    });
    await user.click(screen.getByRole("button", { name: "Goal mode" }));
    await user.type(screen.getByLabelText("Prompt"), followUp);
    await user.click(screen.getByRole("button", { name: /run codex/i }));
    await waitFor(() => expect(mocks.failPromptQueueItemMock).toHaveBeenCalledWith(
      expect.any(String), expect.stringContaining("Context delivery failed"),
    ));
    expect(mocks.setThreadGoalMock).not.toHaveBeenCalled();
  });
});
