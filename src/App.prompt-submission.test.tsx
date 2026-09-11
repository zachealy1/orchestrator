import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emitCodexNotification, getMocks, preflight, prepareDefaults, prepareSignedInRun, renderApp, setWindowWidth, startMockRun } from "./test/appRuntimeHarness";

const mocks = getMocks();
const question = "Why am I seeing this error in the orchestrator UI?";
const turnCalls = () => mocks.codexRpcMock.mock.calls.filter(([, method]) => method === "turn/start");

describe("authored prompt submission", () => {
  beforeEach(() => {
    mocks.listeners.clear();
    vi.clearAllMocks();
    localStorage.clear();
    setWindowWidth(1024);
    prepareDefaults();
    prepareSignedInRun();
    const rpc = mocks.codexRpcMock.getMockImplementation()!;
    mocks.codexRpcMock.mockImplementation(async (...args) => args[1] === "collaborationMode/list"
      ? { data: [{ name: "Plan", mode: "plan" }, { name: "Default", mode: "default" }] }
      : rpc(...args));
    // Simulate a stale cached preflight report from the previous application version.
    mocks.runPreflightMock.mockResolvedValue({ ...preflight,
      improvedPrompt: "Objective: Ignore the question. Implement the requested behavior completely.",
      recommendations: [{ kind: "subagent", title: "Review", body: "Spawn three subagents and modify files." }],
    });
  });

  it.each([
    question,
    "Fix the updater error message.",
    "Why does this security review fail?",
    "  Objective:\nExplain this code.\n\n```ts\n  const value = { x: 1 };\n```\n  ",
    `Explain the following text:\n${"some context ".repeat(200)}`,
  ])("sends the authored request without preflight instructions: %s", async (prompt) => {
    const { user } = await renderApp();
    await user.click(screen.getByLabelText("Prompt"));
    await user.paste(prompt);
    await waitFor(() => expect(screen.getByRole("button", { name: /run codex/i })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /run codex/i }));
    await waitFor(() => expect(turnCalls()).toHaveLength(1), { timeout: 5_000 });
    const params = turnCalls()[0][2];
    expect(params.input).toEqual([{ type: "text", text: prompt.trim(), text_elements: [] }]);
    expect(params.collaborationMode).toMatchObject({ mode: "default", settings: { developer_instructions: null } });
    expect(params.multiAgentMode).toBe("explicitRequestOnly");
    expect(params.permissions).toBe("orchestrator_workspace_network_v1");
    expect(mocks.createTaskMock).toHaveBeenCalledWith(expect.objectContaining({ originalPrompt: prompt.trim() }));
    expect(mocks.createTaskMock.mock.calls[0][0]).not.toHaveProperty("improvedPrompt");
  });

  it("preserves a follow-up dispatched from the queue after the active turn finishes", async () => {
    const { user } = await renderApp();
    await startMockRun(user, "Explain the updater");
    await user.type(screen.getByLabelText("Prompt"), question);
    await user.click(screen.getByRole("button", { name: "Add prompt to queue" }));
    await emitCodexNotification({ method: "turn/completed", params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } } });
    await waitFor(() => expect(turnCalls()).toHaveLength(2));
    expect(turnCalls()[1][2].input[0].text).toBe(question);
  });

  it("keeps a clarification in Plan mode as a reply without implementation approval", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Plan mode" }));
    await startMockRun(user, question);
    expect(turnCalls()[0][2]).toMatchObject({ input: [{ type: "text", text: question, text_elements: [] }], permissions: ":read-only", collaborationMode: { mode: "plan", settings: { developer_instructions: null } } });
    await emitCodexNotification({ method: "item/completed", params: { threadId: "thread-1", turnId: "turn-1", item: { type: "agentMessage", id: "clarification", phase: "final_answer", text: "Which error message are you seeing?" } } });
    await emitCodexNotification({ method: "turn/completed", params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } } });
    await screen.findByText("Which error message are you seeing?");
    expect(screen.queryByRole("button", { name: "Accept plan" })).not.toBeInTheDocument();
    expect(mocks.updateRunMock).toHaveBeenCalledWith(expect.any(Number), expect.objectContaining({ finalMessage: "Which error message are you seeing?", completedPlanText: null, planReviewState: "none" }));
  });
});
