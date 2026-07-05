import { fireEvent, render, screen, within } from "@testing-library/react";
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
              finalMessageItemId: "final-1",
              agentMessagesById: {
                "commentary-1": {
                  text: "I will inspect the current styling first.",
                  phase: "commentary",
                },
                "final-1": {
                  text: "Removed the border from the submitted chat message styling.\n\nUpdated:\n\n- `src/App.css`",
                  phase: "final_answer",
                },
              },
              streamEvents: [
                {
                  id: "message-1",
                  kind: "message",
                  text: "I will inspect the current styling first.",
                  timestamp: "2026-06-30T17:30:01Z",
                  activityIds: ["commentary-1"],
                },
                {
                  id: "message-2",
                  kind: "message",
                  text: "Removed the border from the submitted chat message styling.\n\nUpdated:\n\n- `src/App.css`",
                  timestamp: "2026-06-30T17:30:02Z",
                  activityIds: ["final-1"],
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
    expect(
      within(screen.getByLabelText("App-server stream")).queryByText(
        "Removed the border from the submitted chat message styling.",
      ),
    ).not.toBeInTheDocument();
  });

  it("routes markdown file links through the app file preview handler", () => {
    const onOpenFileLink = vi.fn(() => true);
    render(
      <TaskChatTranscript
        entries={[
          {
            workspaceId: 1,
            runId: 2,
            taskId: 3,
            prompt: "Add a line",
            submittedAt: "2026-06-30T17:30:00Z",
            status: "completed",
            runView: {
              ...emptyRunView,
              status: "completed",
              finalMessage: "Updated [hello-world.txt](/repo/hello-world.txt).",
            },
          },
        ]}
        onResolveRequest={vi.fn()}
        onOpenFileLink={onOpenFileLink}
      />,
    );

    fireEvent.click(screen.getByRole("link", { name: "hello-world.txt" }));

    expect(onOpenFileLink).toHaveBeenCalledWith("/repo/hello-world.txt");
  });

  it("does not render an empty trace dropdown when only final-answer text was streamed", () => {
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
              finalMessage: "Done.",
              finalMessageItemId: "final-1",
              agentMessagesById: {
                "final-1": {
                  text: "Done.",
                  phase: "final_answer",
                },
              },
              streamEvents: [
                {
                  id: "message-1",
                  kind: "message",
                  text: "Done.",
                  timestamp: "2026-06-30T17:30:01Z",
                  activityIds: ["final-1"],
                },
              ],
            },
          },
        ]}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("Run trace")).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("Run summary")).getByText("Done.")).toBeInTheDocument();
  });

  it("renders grouped edited files and commands in stream order", () => {
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
                  text: "I will inspect the files first.",
                  timestamp: "2026-06-30T17:30:01Z",
                },
                {
                  id: "file-1",
                  kind: "file",
                  text: "Edited 2 files",
                  timestamp: "2026-06-30T17:30:02Z",
                  activityIds: [
                    "src/App.css",
                    "src/components/TaskChatTranscript.tsx",
                  ],
                },
                {
                  id: "message-2",
                  kind: "message",
                  text: "The transcript view is updated.",
                  timestamp: "2026-06-30T17:30:03Z",
                },
                {
                  id: "command-1",
                  kind: "command",
                  text: "npm test output",
                  timestamp: "2026-06-30T17:30:04Z",
                  activityIds: ["cmd-1", "cmd-2"],
                },
              ],
            },
          },
        ]}
        onResolveRequest={vi.fn()}
      />,
    );

    const activityGroups = screen.getAllByLabelText("Run activity groups");
    const editedGroup = activityGroups[0];
    const commandGroup = activityGroups[1];
    const editedDetails = editedGroup.querySelector("details.edited-files");
    const commandDetails = commandGroup.querySelector("details.command-runs");

    expect(within(editedGroup).getByText("Edited 2 files")).toBeInTheDocument();
    expect(within(commandGroup).getByText("Ran 2 commands")).toBeInTheDocument();
    expect(editedDetails).toBeInstanceOf(HTMLDetailsElement);
    expect(commandDetails).toBeInstanceOf(HTMLDetailsElement);
    expect((editedDetails as HTMLDetailsElement).open).toBe(false);
    expect((commandDetails as HTMLDetailsElement).open).toBe(false);
    expect(within(editedGroup).getByText("App.css")).toBeInTheDocument();
    expect(within(editedGroup).getByText("+11")).toBeInTheDocument();
    expect(within(editedGroup).getByText("-2")).toBeInTheDocument();
    expect(
      within(commandGroup).getByText(
        "npm test -- --run src/components/TaskChatTranscript.test.tsx",
      ),
    ).toBeInTheDocument();
    expect(within(commandGroup).getByText("for 12s")).toBeInTheDocument();
    const firstMessage = screen.getByText("I will inspect the files first.");
    const secondMessage = screen.getByText("The transcript view is updated.");
    expect(
      firstMessage.compareDocumentPosition(editedGroup) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      editedGroup.compareDocumentPosition(secondMessage) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      secondMessage.compareDocumentPosition(commandGroup) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText("npm test output")).not.toBeInTheDocument();
    expect(container.querySelector(".activity-file-name")).not.toBeNull();
    expect(container.querySelector(".activity-additions")).not.toBeNull();
    expect(container.querySelector(".activity-deletions")).not.toBeNull();
  });
});
