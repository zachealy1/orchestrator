import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { emptyRunView } from "../lib/codexEventReducer";
import { ORCHESTRATOR_PROMPT_CONTEXT_MIME } from "../types";
import {
  TaskChatTranscript,
  type TaskChatEntry,
} from "./TaskChatTranscript";

function setElementScrollMetrics(
  element: HTMLElement,
  metrics: { scrollHeight: number; clientHeight: number },
) {
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    value: metrics.scrollHeight,
  });
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    value: metrics.clientHeight,
  });
}

function historyEntry(turnIndex: number): TaskChatEntry {
  return {
    clientId: `history-${turnIndex}`,
    workspaceId: 1,
    chatId: 401,
    turnIndex,
    runId: turnIndex,
    taskId: turnIndex,
    prompt: `Prompt ${turnIndex}`,
    submittedAt: "2026-06-30T17:30:00Z",
    status: "completed",
    runView: {
      ...emptyRunView,
      status: "completed",
      finalMessage: `Completed turn ${turnIndex}.`,
    },
  };
}

describe("TaskChatTranscript", () => {
  it("renders only a bounded window of turns for a large historical chat", async () => {
    const entries: TaskChatEntry[] = Array.from({ length: 500 }, (_, index) => ({
      clientId: `chat-${index + 1}`,
      workspaceId: 1,
      chatId: 401,
      turnIndex: index + 1,
      runId: index + 1,
      taskId: index + 1,
      prompt: `Prompt ${index + 1}`,
      submittedAt: "2026-06-30T17:30:00Z",
      status: "completed",
      runView: {
        ...emptyRunView,
        status: "completed",
        finalMessage: `Completed turn ${index + 1}.`,
      },
    }));

    const { container } = render(
      <TaskChatTranscript entries={entries} onResolveRequest={vi.fn()} />,
    );

    expect(await screen.findByText("Prompt 500")).toBeInTheDocument();
    expect(container.querySelectorAll(".task-chat-virtual-row").length).toBeLessThan(
      40,
    );
    expect(screen.queryByText("Prompt 1")).not.toBeInTheDocument();
    const spacer = container.querySelector<HTMLElement>(
      ".task-chat-virtual-spacer",
    );
    expect(Number.parseFloat(spacer?.style.height ?? "0")).toBeGreaterThan(
      100_000,
    );
  });

  it("stays at the most recent turn when older history pages are prepended", () => {
    const latestEntries = Array.from({ length: 20 }, (_, index) =>
      historyEntry(index + 46),
    );
    const olderEntries = Array.from({ length: 45 }, (_, index) =>
      historyEntry(index + 1),
    );
    const { rerender } = render(
      <TaskChatTranscript entries={latestEntries} onResolveRequest={vi.fn()} />,
    );
    const transcript = screen.getByLabelText("Task chat transcript");
    setElementScrollMetrics(transcript, {
      scrollHeight: 24_000,
      clientHeight: 600,
    });
    transcript.scrollTop = 0;

    rerender(
      <TaskChatTranscript
        entries={[...olderEntries, ...latestEntries]}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(transcript.scrollTop).toBe(24_000);
  });

  it("opens a single-page historical chat at its most recent turn", () => {
    const latestEntries = Array.from({ length: 12 }, (_, index) =>
      historyEntry(index + 1),
    );
    const { rerender } = render(
      <TaskChatTranscript entries={[]} onResolveRequest={vi.fn()} />,
    );
    const transcript = screen.getByLabelText("Task chat transcript");
    setElementScrollMetrics(transcript, {
      scrollHeight: 8_000,
      clientHeight: 600,
    });

    rerender(
      <TaskChatTranscript entries={latestEntries} onResolveRequest={vi.fn()} />,
    );

    expect(transcript.scrollTop).toBe(8_000);
  });

  it("honors a new drawer scroll request when chats have equal turn counts", () => {
    const firstChatEntries = Array.from({ length: 12 }, (_, index) =>
      historyEntry(index + 1),
    );
    const secondChatEntries = firstChatEntries.map((entry) => ({
      ...entry,
      clientId: `second-${entry.turnIndex}`,
      chatId: 402,
      prompt: `Second chat prompt ${entry.turnIndex}`,
    }));
    const { rerender } = render(
      <TaskChatTranscript
        entries={firstChatEntries}
        onResolveRequest={vi.fn()}
        scrollToLatestRequest={1}
      />,
    );
    const transcript = screen.getByLabelText("Task chat transcript");
    setElementScrollMetrics(transcript, {
      scrollHeight: 8_000,
      clientHeight: 600,
    });
    transcript.scrollTop = 0;

    rerender(
      <TaskChatTranscript
        entries={secondChatEntries}
        onResolveRequest={vi.fn()}
        scrollToLatestRequest={2}
      />,
    );

    expect(transcript.scrollTop).toBe(8_000);
  });

  it("does not return to the latest turn after the user scrolls up during hydration", () => {
    const latestEntries = Array.from({ length: 20 }, (_, index) =>
      historyEntry(index + 46),
    );
    const olderEntries = Array.from({ length: 45 }, (_, index) =>
      historyEntry(index + 1),
    );
    const { rerender } = render(
      <TaskChatTranscript entries={latestEntries} onResolveRequest={vi.fn()} />,
    );
    const transcript = screen.getByLabelText("Task chat transcript");
    setElementScrollMetrics(transcript, {
      scrollHeight: 24_000,
      clientHeight: 600,
    });
    transcript.scrollTop = 1_000;
    fireEvent.scroll(transcript);

    rerender(
      <TaskChatTranscript
        entries={[...olderEntries, ...latestEntries]}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(transcript.scrollTop).not.toBe(24_000);
  });

  it("renders submitted prompts and live output with real-time metrics", () => {
    render(
      <TaskChatTranscript
        entries={[
          {
            clientId: "chat-1",
            workspaceId: 1,
            chatId: 401,
            turnIndex: 1,
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

  it("renders an animated preparing state before app-server output starts", () => {
    const { container } = render(
      <TaskChatTranscript
        entries={[
          {
            clientId: "chat-1",
            workspaceId: 1,
            chatId: 401,
            turnIndex: 1,
            runId: null,
            taskId: null,
            prompt: "Fix slow submission",
            submittedAt: "2026-06-30T17:30:00Z",
            status: "connecting",
            runView: {
              ...emptyRunView,
              status: "connecting",
              startedAt: "2026-06-30T17:30:00Z",
            },
          },
        ]}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Submitted prompt")).toHaveTextContent(
      "Fix slow submission",
    );
    expect(screen.getByLabelText("Preparing run")).toHaveTextContent(
      "Preparing run...",
    );
    expect(container.querySelector(".stream-loading-dots")).not.toBeNull();
  });

  it("does not force-scroll to the bottom when live output updates after the user scrolls up", () => {
    const entry = {
      clientId: "chat-1",
      workspaceId: 1,
      chatId: 401,
      turnIndex: 1,
      runId: 2,
      taskId: 3,
      prompt: "Run a long task",
      submittedAt: "2026-06-30T17:30:00Z",
      status: "running" as const,
      runView: {
        ...emptyRunView,
        status: "running" as const,
        streamEvents: [
          {
            id: "message-1",
            kind: "message" as const,
            text: "First update",
            timestamp: "2026-06-30T17:30:01Z",
          },
        ],
      },
    };
    const { rerender } = render(
      <TaskChatTranscript entries={[entry]} onResolveRequest={vi.fn()} />,
    );
    const transcript = screen.getByLabelText("Task chat transcript");
    setElementScrollMetrics(transcript, {
      scrollHeight: 1000,
      clientHeight: 200,
    });
    transcript.scrollTop = 200;
    fireEvent.scroll(transcript);

    rerender(
      <TaskChatTranscript
        entries={[
          {
            ...entry,
            runView: {
              ...entry.runView,
              streamEvents: [
                ...entry.runView.streamEvents,
                {
                  id: "message-2",
                  kind: "message",
                  text: "Second update",
                  timestamp: "2026-06-30T17:30:02Z",
                },
              ],
            },
          },
        ]}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(transcript.scrollTop).toBe(200);
  });

  it("cancels a pending follow-to-bottom frame when the user scrolls away", () => {
    let pendingFrame: FrameRequestCallback | null = null;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        pendingFrame = callback;
        return 91;
      }),
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      vi.fn(() => {
        pendingFrame = null;
      }),
    );

    try {
      const entry = {
        clientId: "chat-1",
        workspaceId: 1,
        chatId: 401,
        turnIndex: 1,
        runId: 2,
        taskId: 3,
        prompt: "Run a long task",
        submittedAt: "2026-06-30T17:30:00Z",
        status: "running" as const,
        runView: {
          ...emptyRunView,
          status: "running" as const,
          streamEvents: [
            {
              id: "message-1",
              kind: "message" as const,
              text: "First update",
              timestamp: "2026-06-30T17:30:01Z",
            },
          ],
        },
      };
      const { rerender } = render(
        <TaskChatTranscript entries={[entry]} onResolveRequest={vi.fn()} />,
      );
      const transcript = screen.getByLabelText("Task chat transcript");
      setElementScrollMetrics(transcript, {
        scrollHeight: 1000,
        clientHeight: 200,
      });
      transcript.scrollTop = 790;
      fireEvent.scroll(transcript);

      rerender(
        <TaskChatTranscript
          entries={[
            {
              ...entry,
              runView: {
                ...entry.runView,
                streamEvents: [
                  ...entry.runView.streamEvents,
                  {
                    id: "message-2",
                    kind: "message",
                    text: "Second update",
                    timestamp: "2026-06-30T17:30:02Z",
                  },
                ],
              },
            },
          ]}
          onResolveRequest={vi.fn()}
        />,
      );

      expect(pendingFrame).not.toBeNull();
      transcript.scrollTop = 200;
      fireEvent.scroll(transcript);
      expect(pendingFrame).toBeNull();
      expect(transcript.scrollTop).toBe(200);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("continues following live output when the user is already near the bottom", async () => {
    const entry = {
      clientId: "chat-1",
      workspaceId: 1,
      chatId: 401,
      turnIndex: 1,
      runId: 2,
      taskId: 3,
      prompt: "Run a long task",
      submittedAt: "2026-06-30T17:30:00Z",
      status: "running" as const,
      runView: {
        ...emptyRunView,
        status: "running" as const,
        streamEvents: [
          {
            id: "message-1",
            kind: "message" as const,
            text: "First update",
            timestamp: "2026-06-30T17:30:01Z",
          },
        ],
      },
    };
    const { rerender } = render(
      <TaskChatTranscript entries={[entry]} onResolveRequest={vi.fn()} />,
    );
    const transcript = screen.getByLabelText("Task chat transcript");
    setElementScrollMetrics(transcript, {
      scrollHeight: 1000,
      clientHeight: 200,
    });
    transcript.scrollTop = 760;
    fireEvent.scroll(transcript);

    rerender(
      <TaskChatTranscript
        entries={[
          {
            ...entry,
            runView: {
              ...entry.runView,
              streamEvents: [
                ...entry.runView.streamEvents,
                {
                  id: "message-2",
                  kind: "message",
                  text: "Second update",
                  timestamp: "2026-06-30T17:30:02Z",
                },
              ],
            },
          },
        ]}
        onResolveRequest={vi.fn()}
      />,
    );

    await waitFor(() => expect(transcript.scrollTop).toBe(1000));
  });

  it("allows the latest completed prompt to be edited and rerun", () => {
    const onEditPrompt = vi.fn();
    render(
      <TaskChatTranscript
        entries={[
          {
            clientId: "chat-1",
            workspaceId: 1,
            chatId: 401,
            turnIndex: 1,
            runId: 2,
            taskId: 3,
            prompt: "Original prompt",
            submittedAt: "2026-06-30T17:30:00Z",
            status: "completed",
            runView: {
              ...emptyRunView,
              status: "completed",
              finalMessage: "Done.",
            },
          },
        ]}
        editablePromptEntryId="chat-1"
        onEditPrompt={onEditPrompt}
        onResolveRequest={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit prompt" }));
    fireEvent.change(screen.getByLabelText("Edit submitted prompt"), {
      target: { value: "Edited prompt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run edited prompt" }));

    expect(onEditPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "chat-1" }),
      "Edited prompt",
    );
  });

  it("does not expose prompt editing for non-latest or running entries", () => {
    render(
      <TaskChatTranscript
        entries={[
          {
            clientId: "chat-1",
            workspaceId: 1,
            chatId: 401,
            turnIndex: 1,
            runId: 2,
            taskId: 3,
            prompt: "Older prompt",
            submittedAt: "2026-06-30T17:30:00Z",
            status: "completed",
            runView: {
              ...emptyRunView,
              status: "completed",
              finalMessage: "Done.",
            },
          },
          {
            clientId: "chat-2",
            workspaceId: 1,
            chatId: 401,
            turnIndex: 2,
            runId: 4,
            taskId: 5,
            prompt: "Running prompt",
            submittedAt: "2026-06-30T17:31:00Z",
            status: "running",
            runView: {
              ...emptyRunView,
              status: "running",
            },
          },
        ]}
        editablePromptEntryId="chat-2"
        onEditPrompt={vi.fn()}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Edit prompt" })).not.toBeInTheDocument();
  });

  it("cancels prompt editing without changing the submitted prompt", () => {
    render(
      <TaskChatTranscript
        entries={[
          {
            clientId: "chat-1",
            workspaceId: 1,
            chatId: 401,
            turnIndex: 1,
            runId: 2,
            taskId: 3,
            prompt: "Original prompt",
            submittedAt: "2026-06-30T17:30:00Z",
            status: "completed",
            runView: {
              ...emptyRunView,
              status: "completed",
              finalMessage: "Done.",
            },
          },
        ]}
        editablePromptEntryId="chat-1"
        onEditPrompt={vi.fn()}
        onResolveRequest={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit prompt" }));
    fireEvent.change(screen.getByLabelText("Edit submitted prompt"), {
      target: { value: "Edited prompt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel prompt edit" }));

    expect(screen.getByLabelText("Submitted prompt")).toHaveTextContent(
      "Original prompt",
    );
    expect(screen.queryByLabelText("Edit submitted prompt")).not.toBeInTheDocument();
  });

  it("renders submitted inline file references as previewable links", () => {
    const onOpenFileLink = vi.fn(() => true);
    render(
      <TaskChatTranscript
        entries={[
          {
            clientId: "chat-1",
            workspaceId: 1,
            chatId: 401,
            turnIndex: 1,
            runId: null,
            taskId: null,
            prompt: "Delete the TXT hello-world.txt file",
            contextFiles: [
              {
                path: "/repo/hello-world.txt",
                name: "hello-world.txt",
                source: "search",
                status: "ready",
              },
            ],
            submittedAt: "2026-06-30T17:30:00Z",
            status: "connecting",
            runView: {
              ...emptyRunView,
              status: "connecting",
              startedAt: "2026-06-30T17:30:00Z",
            },
          },
        ]}
        onResolveRequest={vi.fn()}
        onOpenFileLink={onOpenFileLink}
      />,
    );

    const submittedPrompt = screen.getByLabelText("Submitted prompt");
    const fileLink = within(submittedPrompt).getByRole("link", {
      name: "hello-world.txt",
    });

    expect(fileLink).toHaveClass("submitted-inline-file");
    expect(within(fileLink).getByText("TXT")).toBeInTheDocument();

    fireEvent.click(fileLink);

    expect(onOpenFileLink).toHaveBeenCalledWith("/repo/hello-world.txt");
  });

  it("copies submitted inline file references with context metadata", () => {
    const clipboardData = {
      setData: vi.fn(),
    };
    render(
      <TaskChatTranscript
        entries={[
          {
            clientId: "chat-1",
            workspaceId: 1,
            chatId: 401,
            turnIndex: 1,
            runId: null,
            taskId: null,
            prompt: "Delete the TXT hello-world.txt file",
            contextFiles: [
              {
                path: "/repo/hello-world.txt",
                name: "hello-world.txt",
                source: "search",
                status: "ready",
              },
            ],
            submittedAt: "2026-06-30T17:30:00Z",
            status: "connecting",
            runView: {
              ...emptyRunView,
              status: "connecting",
              startedAt: "2026-06-30T17:30:00Z",
            },
          },
        ]}
        onResolveRequest={vi.fn()}
      />,
    );

    fireEvent.copy(screen.getByLabelText("Submitted prompt"), { clipboardData });

    expect(clipboardData.setData).toHaveBeenCalledWith(
      "text/plain",
      "Delete the TXT hello-world.txt file",
    );
    const rawPayload = clipboardData.setData.mock.calls.find(
      ([type]) => type === ORCHESTRATOR_PROMPT_CONTEXT_MIME,
    )?.[1];
    if (typeof rawPayload !== "string") {
      throw new Error("Missing prompt context clipboard payload");
    }
    expect(JSON.parse(rawPayload)).toMatchObject({
      version: 1,
      prompt: "Delete the TXT hello-world.txt file",
      files: [
        {
          path: "/repo/hello-world.txt",
          name: "hello-world.txt",
          source: "search",
          status: "ready",
        },
      ],
    });
  });

  it("renders completed summaries as markdown and collapses the stream trace", async () => {
    render(
      <TaskChatTranscript
        entries={[
          {
            clientId: "chat-1",
            workspaceId: 1,
            chatId: 401,
            turnIndex: 1,
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
    fireEvent.click(traceTrigger);
    const stream = await screen.findByLabelText("App-server stream");
    expect(
      within(stream).getByText(
        "I will inspect the current styling first.",
      ),
    ).toBeInTheDocument();
    expect(
      within(stream).queryByText(
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
            clientId: "chat-1",
            workspaceId: 1,
            chatId: 401,
            turnIndex: 1,
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

    const previewLink = screen.getByRole("link", { name: "hello-world.txt" });
    expect(previewLink).toHaveClass("markdown-preview-link");
    expect(within(previewLink).queryByText("Preview")).not.toBeInTheDocument();

    fireEvent.click(previewLink);

    expect(onOpenFileLink).toHaveBeenCalledWith("/repo/hello-world.txt");
  });

  it("does not render an empty trace dropdown when only final-answer text was streamed", () => {
    render(
      <TaskChatTranscript
        entries={[
          {
            clientId: "chat-1",
            workspaceId: 1,
            chatId: 401,
            turnIndex: 1,
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
            clientId: "chat-1",
            workspaceId: 1,
            chatId: 401,
            turnIndex: 1,
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
