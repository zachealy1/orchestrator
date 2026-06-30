import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { emptyRunView } from "../lib/codexEventReducer";
import { TaskChatTranscript } from "./TaskChatTranscript";

describe("TaskChatTranscript", () => {
  it("renders submitted prompts and live output with real-time metrics", () => {
    render(
      <TaskChatTranscript
        entries={[
          {
            workspaceId: 1,
            runId: 2,
            taskId: 3,
            prompt: "Objective:\nFix the failing auth tests",
            submittedAt: "2026-06-30T17:30:00Z",
            status: "running",
            runView: {
              ...emptyRunView,
              status: "running",
              elapsedMs: 65_000,
              tokenUsage: {
                totalTokens: 1234,
                inputTokens: 1000,
                cachedInputTokens: 400,
                outputTokens: 200,
                reasoningOutputTokens: 34,
                modelContextWindow: 128000,
              },
              streamEvents: [
                {
                  id: "message-1",
                  kind: "message",
                  text: "I am updating the auth flow.",
                  timestamp: "2026-06-30T17:30:01Z",
                },
                {
                  id: "command-1",
                  kind: "command",
                  text: "Ran npm test",
                  timestamp: "2026-06-30T17:30:02Z",
                },
              ],
            },
          },
        ]}
        onResolveRequest={vi.fn()}
      />,
    );

    const submittedPrompt = screen.getByLabelText("Submitted prompt");
    const liveOutput = screen.getByLabelText("Live run output");

    expect(screen.queryByText("You")).not.toBeInTheDocument();
    expect(screen.queryByText("Codex")).not.toBeInTheDocument();
    expect(submittedPrompt).toHaveClass("chat-message-body");
    expect(submittedPrompt).toHaveTextContent("Objective:");
    expect(submittedPrompt.textContent).toContain("\nFix the failing auth tests");
    expect(liveOutput.closest(".chat-bubble")).toBeNull();
    expect(within(liveOutput).getByText("1m 5s")).toBeInTheDocument();
    expect(within(liveOutput).getByText("1,234 tokens")).toBeInTheDocument();
    expect(within(liveOutput).getByText("I am updating the auth flow.")).toBeInTheDocument();
    expect(within(liveOutput).getByText("Ran npm test")).toBeInTheDocument();
  });

  it("renders completed summaries as markdown and collapses the stream trace", () => {
    render(
      <TaskChatTranscript
        entries={[
          {
            workspaceId: 1,
            runId: 2,
            taskId: 3,
            prompt: "Finish the task",
            submittedAt: "2026-06-30T17:30:00Z",
            status: "completed",
            runView: {
              ...emptyRunView,
              status: "completed",
              elapsedMs: 123_000,
              tokenUsage: {
                totalTokens: 69839,
                inputTokens: 69000,
                cachedInputTokens: 0,
                outputTokens: 800,
                reasoningOutputTokens: 39,
                modelContextWindow: 128000,
              },
              finalMessage:
                "Removed the border from the submitted chat message styling.\n\nUpdated:\n\n- `src/App.css`",
              streamEvents: [
                {
                  id: "message-1",
                  kind: "message",
                  text: "Removed the border.",
                  timestamp: "2026-06-30T17:30:01Z",
                },
              ],
            },
          },
        ]}
        onResolveRequest={vi.fn()}
      />,
    );

    const summary = screen.getByLabelText("Run summary");

    expect(summary.closest(".chat-bubble")).toBeNull();
    expect(within(summary).getByText("Updated:")).toBeInTheDocument();
    expect(within(summary).getByText("src/App.css")).toBeInTheDocument();
    expect(screen.getByText("2m 3s • 69,839 tokens")).toBeInTheDocument();
    expect(screen.getByLabelText("App-server stream")).toBeInTheDocument();
  });
});
