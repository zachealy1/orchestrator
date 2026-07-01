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

    const liveOutput = screen.getByLabelText("Live run output");

    expect(screen.queryByText("You")).not.toBeInTheDocument();
    expect(screen.queryByText("Codex")).not.toBeInTheDocument();
    const submittedPrompt = screen.getByLabelText("Submitted prompt");
    expect(submittedPrompt).toHaveTextContent("Objective:");
    expect(submittedPrompt).toHaveTextContent("Fix the failing auth tests");
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
                  text: "I will inspect the current styling first.",
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

    expect(screen.getByLabelText("Submitted prompt")).toHaveTextContent("Finish the task");
    expect(
      within(summary).queryByText("I will inspect the current styling first."),
    ).not.toBeInTheDocument();
    expect(within(summary).getByText("Updated:")).toBeInTheDocument();
    expect(within(summary).getByText("src/App.css")).toBeInTheDocument();
    const traceTrigger = screen.getByLabelText("Run trace");
    expect(traceTrigger.tagName.toLowerCase()).toBe("summary");
    expect(traceTrigger.querySelector(".run-trace-chevron")).toHaveClass(
      "lucide-chevron-right",
    );
    expect(within(traceTrigger).getByText("2m 3s")).toBeInTheDocument();
    expect(within(traceTrigger).getByText("69,839 tokens")).toBeInTheDocument();
    expect(screen.queryByText("2m 3s • 69,839 tokens")).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText("App-server stream")).getByText(
        "I will inspect the current styling first.",
      ),
    ).toBeInTheDocument();
  });

  it("renders grouped edited files and commands", () => {
    const { container } = render(
      <TaskChatTranscript
        entries={[
          {
            workspaceId: 1,
            runId: 2,
            taskId: 3,
            prompt: "Update the transcript",
            submittedAt: "2026-06-30T17:30:00Z",
            status: "running",
            runView: {
              ...emptyRunView,
              status: "running",
              editedFiles: [
                {
                  path: "src/App.css",
                  name: "App.css",
                  additions: 11,
                  deletions: 0,
                  status: "modified",
                },
                {
                  path: "src/components/TaskChatTranscript.tsx",
                  name: "TaskChatTranscript.tsx",
                  additions: 3,
                  deletions: 2,
                  status: "modified",
                },
              ],
              commands: [
                {
                  id: "cmd-1",
                  command: "npm test -- --run src/components/TaskChatTranscript.test.tsx",
                  status: "completed",
                  durationMs: 1000,
                  output: "",
                },
                {
                  id: "cmd-2",
                  command: "npm test -- --run src/App.auth.test.tsx",
                  status: "completed",
                  durationMs: 12_000,
                  output: "",
                },
              ],
              streamEvents: [
                {
                  id: "message-1",
                  kind: "message",
                  text: "I updated the transcript view.",
                  timestamp: "2026-06-30T17:30:01Z",
                },
                {
                  id: "command-1",
                  kind: "command",
                  text: "npm test output",
                  timestamp: "2026-06-30T17:30:02Z",
                },
              ],
            },
          },
        ]}
        onResolveRequest={vi.fn()}
      />,
    );

    const activityGroups = screen.getByLabelText("Run activity groups");

    expect(within(activityGroups).getByText("Edited 2 files")).toBeInTheDocument();
    expect(within(activityGroups).getByText("Ran 2 commands")).toBeInTheDocument();
    expect(within(activityGroups).getByText("App.css")).toBeInTheDocument();
    expect(within(activityGroups).getByText("+11")).toBeInTheDocument();
    expect(within(activityGroups).getByText("-2")).toBeInTheDocument();
    expect(
      within(activityGroups).getByText(
        "npm test -- --run src/components/TaskChatTranscript.test.tsx",
      ),
    ).toBeInTheDocument();
    expect(within(activityGroups).getByText("for 12s")).toBeInTheDocument();
    expect(screen.getByText("I updated the transcript view.")).toBeInTheDocument();
    expect(screen.queryByText("npm test output")).not.toBeInTheDocument();
    expect(container.querySelector(".activity-file-name")).not.toBeNull();
    expect(container.querySelector(".activity-additions")).not.toBeNull();
    expect(container.querySelector(".activity-deletions")).not.toBeNull();
  });
});
