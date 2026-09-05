import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type WorkspaceRunFixture,
  emitCodexNotification,
  getMocks,
  prepareDefaults,
  prepareSignedInRun,
  renderApp,
  setWindowWidth,
  startMockRun,
  workspaceChatFixture,
  workspaceChatWithRunsFixture,
  workspaceRunFixture,
} from "./test/appRuntimeHarness";

const mocks = getMocks();

describe("Plan output recovery", () => {
  beforeEach(() => {
    mocks.listeners.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
    localStorage.clear();
    setWindowWidth(1024);
    document.documentElement.removeAttribute("data-theme");
    prepareDefaults();
  });

  it("persists a plain final answer from a Plan-mode turn as a reviewable plan", async () => {
    prepareSignedInRun();
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string) => {
        if (method === "collaborationMode/list") {
          return {
            data: [
              { name: "Plan", mode: "plan", reasoning_effort: "medium" },
              { name: "Default", mode: "default" },
            ],
          };
        }
        if (method === "thread/start") {
          return { thread: { id: "thread-plain-plan" } };
        }
        if (method === "turn/start") {
          return { turn: { id: "turn-plain-plan" } };
        }
        return {};
      },
    );
    const markdown = [
      "# Implementation plan",
      "",
      "1. Scaffold the game.",
      "2. Add the first playable level.",
    ].join("\n");
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: /plan mode/i }));
    await startMockRun(user, "Plan a game in this repository");

    await emitCodexNotification({
      method: "item/completed",
      params: {
        threadId: "thread-plain-plan",
        turnId: "turn-plain-plan",
        item: {
          type: "agentMessage",
          id: "plain-plan-message",
          phase: "final_answer",
          text: markdown,
        },
      },
    });
    await emitCodexNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-plain-plan",
        turnId: "turn-plain-plan",
        turn: {
          id: "turn-plain-plan",
          status: "completed",
          durationMs: 100,
        },
      },
    });

    const plan = await screen.findByLabelText("Codex plan");
    expect(
      within(plan).getByRole("heading", { name: "Implementation plan" }),
    ).toBeInTheDocument();
    for (const name of ["Accept plan", "Update plan", "Reject plan"]) {
      expect(within(plan).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.queryByLabelText("Run summary")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.updateRunMock).toHaveBeenCalledWith(
        202,
        expect.objectContaining({
          status: "completed",
          finalMessage: "",
          collaborationMode: "plan",
          runIntent: "plan",
          completedPlanItemId: "plain-plan-message",
          completedPlanText: markdown,
          planReviewState: "available",
          error: null,
        }),
      ),
    );
  });

  it("restores a reviewable plan from a run rejected by the old protocol gate", async () => {
    prepareSignedInRun();
    const markdown = [
      "# Implementation plan",
      "",
      "1. Scaffold the game.",
      "2. Add the first playable level.",
    ].join("\n");
    const chat = {
      ...workspaceChatFixture({
        id: 437,
        title: "Plan a game in this repository",
      }),
      collaboration_mode: "plan",
    };
    const run = {
      ...workspaceRunFixture({
        id: 337,
        chat_id: chat.id,
        original_prompt: "Plan a game in this repository",
        final_message: markdown,
      }),
      status: "failed",
      error: '"Codex completed the Plan-mode card without a reviewable plan."',
      collaboration_mode: "plan",
      run_intent: "plan",
      completed_plan_item_id: null,
      completed_plan_text: null,
      plan_review_state: "none",
    } satisfies WorkspaceRunFixture;
    mocks.listWorkspaceChatsMock.mockResolvedValue([chat]);
    mocks.getChatWithRunsMock.mockResolvedValue(
      workspaceChatWithRunsFixture(chat, [run]),
    );
    mocks.listLocalChatTranscriptMock.mockResolvedValue([run]);

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
        name: /plan a game in this repository/i,
      }),
    );

    const plan = await screen.findByLabelText("Codex plan");
    for (const name of ["Accept plan", "Update plan", "Reject plan"]) {
      expect(within(plan).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.queryByLabelText("Run error")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Run summary")).not.toBeInTheDocument();
  });
});
