import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { addSteerPrompt, emptyRunView, settleSteerPrompt } from "../lib/codexEventReducer";
import { ORCHESTRATOR_PROMPT_CONTEXT_MIME } from "../features/composer/types";
import {
  TaskChatTurn,
  type TaskChatEntry,
  type TranscriptTurnActions,
  type TranscriptTurnModel,
} from "./TaskChatTurn";
import { renderWithAppServices } from "../test/renderWithAppServices";
import { AppServices } from "../runtime/AppServices";

function render(ui: ReactElement, services = new AppServices()) {
  return renderWithAppServices(ui, {}, services);
}

type FlatTaskChatTurnProps = TranscriptTurnModel & TranscriptTurnActions;

function TestTaskChatTurn({
  entry,
  editable,
  editing,
  editingPrompt,
  fileUndoDisabled,
  planExpanded,
  editedFilesExpanded,
  ...actions
}: FlatTaskChatTurnProps) {
  return (
    <TaskChatTurn
      model={{
        entry,
        editable,
        editing,
        editingPrompt,
        fileUndoDisabled,
        planExpanded,
        editedFilesExpanded,
      }}
      actions={actions}
    />
  );
}

type TestTranscriptProps = {
  entries: TaskChatEntry[];
  onResolveRequest: TranscriptTurnActions["onResolveRequest"];
  editablePromptEntryId?: string | null;
  onEditPrompt?: (entry: TaskChatEntry, prompt: string) => void;
  onOpenTranscriptLink?: (href: string) => boolean;
};

function TaskChatTranscript({
  entries,
  onResolveRequest,
  editablePromptEntryId = null,
  onEditPrompt,
  onOpenTranscriptLink,
}: TestTranscriptProps) {
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingPrompt, setEditingPrompt] = useState("");
  return (
    <div aria-label="Task chat transcript">
      {entries.map((entry) => (
        <TestTaskChatTurn
          key={entry.clientId}
          entry={entry}
          editable={
            entry.clientId === editablePromptEntryId &&
            entry.status !== "connecting" &&
            entry.status !== "running"
          }
          editing={entry.clientId === editingEntryId}
          editingPrompt={editingPrompt}
          onEditingPromptChange={setEditingPrompt}
          onSubmitEdit={(selectedEntry, prompt) => {
            onEditPrompt?.(selectedEntry, prompt);
            setEditingEntryId(null);
          }}
          onCancelEdit={() => setEditingEntryId(null)}
          onStartEdit={(selectedEntry) => {
            setEditingEntryId(selectedEntry.clientId);
            setEditingPrompt(selectedEntry.prompt);
          }}
          onResolveRequest={onResolveRequest}
          onOpenTranscriptLink={onOpenTranscriptLink}
        />
      ))}
    </div>
  );
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

describe("TaskChatTurn", () => {
  it("keeps a pending steer between streamed output and retains it between completed activity sections", async () => {
    let runView = addSteerPrompt({
      ...emptyRunView,
      status: "running",
      streamEvents: [{ id: "before", kind: "message", text: "Before steering", timestamp: "2026-09-11T12:00:00Z" }],
    }, { id: "steer:1", text: "Focus on the tests", timestamp: "2026-09-11T12:00:00Z", contextFiles: [] });
    runView = {
      ...runView,
      streamEvents: [...runView.streamEvents, { id: "after", kind: "message", text: "After steering", timestamp: "2026-09-11T12:00:00Z" }],
    };
    const entry = { ...historyEntry(1), status: runView.status, runView };
    const { rerender } = render(<TaskChatTranscript entries={[entry]} onResolveRequest={vi.fn()} />);
    const prompt = screen.getByLabelText("Additional submitted prompt");
    expect(prompt).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Sending…");
    expect(screen.getByText("Before steering").compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(prompt.compareDocumentPosition(screen.getByText("After steering")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(prompt.closest(".task-chat-run")?.querySelector(":scope > .submitted-prompt-stack")).not.toContainElement(prompt);

    const completedView = { ...settleSteerPrompt(runView, "steer:1", true), status: "completed" as const, finalMessage: "All done" };
    rerender(<TaskChatTranscript entries={[{ ...entry, status: "completed", runView: completedView }]} onResolveRequest={vi.fn()} />);
    const completedPrompt = screen.getByLabelText("Additional submitted prompt");
    expect(completedPrompt).toBeVisible();
    expect(completedPrompt).toHaveAttribute("aria-busy", "false");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Run metrics")).toHaveLength(1);
    expect(screen.getAllByText("All done")).toHaveLength(1);
    expect(screen.queryByText("Before steering")).not.toBeInTheDocument();
    expect(screen.queryByText("After steering")).not.toBeInTheDocument();
    const before = screen.getByLabelText("Activity 1");
    const after = screen.getByLabelText("Activity 2");
    expect(before.compareDocumentPosition(completedPrompt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(completedPrompt.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(before);
    expect(await screen.findByText("Before steering")).toBeVisible();
    expect(screen.queryByText("After steering")).not.toBeInTheDocument();
    fireEvent.click(after);
    expect(await screen.findByText("After steering")).toBeVisible();
    fireEvent.click(before);
    await waitFor(() => expect(screen.queryByText("Before steering")).not.toBeInTheDocument());
    expect(screen.getByText("After steering")).toBeVisible();
    expect(completedPrompt).toBeVisible();
  });

  it("keeps consecutive steers visible without empty activity dropdowns", () => {
    let runView = addSteerPrompt(emptyRunView, { id: "steer:1", text: "First steer", timestamp: "2026-09-11T12:00:00Z", contextFiles: [] });
    runView = addSteerPrompt(runView, { id: "steer:2", text: "Second steer", timestamp: "2026-09-11T12:00:00Z", contextFiles: [] });
    runView = settleSteerPrompt(settleSteerPrompt(runView, "steer:1", true), "steer:2", true);
    render(<TaskChatTranscript entries={[{ ...historyEntry(1), runView: { ...runView, status: "completed", finalMessage: "Done" } }]} onResolveRequest={vi.fn()} />);
    expect(screen.getAllByLabelText("Additional submitted prompt").map((prompt) => prompt.textContent)).toEqual(["First steer", "Second steer"]);
    expect(screen.queryByLabelText(/^Activity \d/)).not.toBeInTheDocument();
  });

  it("preserves steer images, file links, and rich clipboard context", async () => {
    const services = new AppServices();
    services.imageAttachments.set("/tmp/steer.png", Promise.resolve({
      path: "/tmp/steer.png", mimeType: "image/png", width: 100, height: 100,
      thumbnailDataUrl: "data:image/png;base64,preview",
    }));
    const contextFiles = [
      { path: "/tmp/steer.png", name: "steer.png", source: "picker" as const, mediaKind: "image" as const },
      { path: "/src/app.ts", name: "app.ts", source: "search" as const },
    ];
    const text = "Use /src/app.ts with this picture";
    const runView = settleSteerPrompt(addSteerPrompt(emptyRunView, {
      id: "steer:1", text, timestamp: "2026-09-11T12:00:00Z", contextFiles,
    }), "steer:1", true);
    render(<TaskChatTranscript entries={[{ ...historyEntry(1), runView: { ...runView, status: "running" } }]} onResolveRequest={vi.fn()} />, services);
    expect(await screen.findByRole("img", { name: "steer.png" })).toHaveAttribute("src", "data:image/png;base64,preview");
    expect(screen.getByRole("link", { name: /app.ts/ })).toHaveClass("submitted-inline-file");
    const setData = vi.fn();
    fireEvent.copy(screen.getByLabelText("Additional submitted prompt"), { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith("text/plain", text);
    expect(setData).toHaveBeenCalledWith(ORCHESTRATOR_PROMPT_CONTEXT_MIME, expect.any(String));
    const payload = JSON.parse(setData.mock.calls.find(([type]) => type === ORCHESTRATOR_PROMPT_CONTEXT_MIME)![1]);
    expect(payload.files).toEqual(contextFiles.filter((file) => file.source === "search"));
  });

it("renders generated images and generation failures as standalone transcript items", () => {
    const entry: TaskChatEntry = {
      ...historyEntry(1),
      runView: {
        ...historyEntry(1).runView,
        generatedImageOrder: ["image-ready", "image-failed"],
        generatedImagesById: {
          "image-ready": {
            id: "image-ready",
            threadId: "thread-images",
            status: "completed",
            savedPath: null,
            result: "cHJldmlldw==",
            error: null,
          },
          "image-failed": {
            id: "image-failed",
            threadId: "thread-images",
            status: "failed",
            savedPath: null,
            result: null,
            error: "Image generation usage limit reached.",
          },
        },
      },
    };

    render(
      <TaskChatTranscript
        entries={[entry]}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(screen.getByRole("img", { name: "Generated image 1" })).toHaveAttribute(
      "src",
      "data:image/png;base64,cHJldmlldw==",
    );
    expect(screen.getByText("Image generation usage limit reached.")).toBeInTheDocument();
  });

it("renders local Markdown images through the native preview bridge", async () => {
    const localPath =
      "/Users/test/Library/Application Support/com.example/artifacts/design.jpg";
    const services = new AppServices();
    services.imageAttachments.set(
      localPath,
      Promise.resolve({
        path: localPath,
        mimeType: "image/jpeg",
        width: 1512,
        height: 827,
        thumbnailDataUrl: "data:image/png;base64,markdown-preview",
      }),
    );
    const entry: TaskChatEntry = {
      ...historyEntry(1),
      runView: {
        ...historyEntry(1).runView,
        finalMessage:
          "![Application design](</Users/test/Library/Application Support/com.example/artifacts/design.jpg>)",
      },
    };

    render(
      <TaskChatTranscript entries={[entry]} onResolveRequest={vi.fn()} />,
      services,
    );

    expect(
      await screen.findByRole("img", { name: "Application design" }),
    ).toHaveAttribute("src", "data:image/png;base64,markdown-preview");
  });

it("uses the local Markdown image renderer when reopening a prepared summary", async () => {
    const localPath = "/Users/test/artifacts/reopened.png";
    const services = new AppServices();
    services.imageAttachments.set(
      localPath,
      Promise.resolve({
        path: localPath,
        mimeType: "image/png",
        width: 800,
        height: 600,
        thumbnailDataUrl: "data:image/png;base64,reopened-preview",
      }),
    );
    const entry: TaskChatEntry = {
      ...historyEntry(1),
      runView: {
        ...historyEntry(1).runView,
        finalMessage: "![Reopened design](/Users/test/artifacts/reopened.png)",
      },
      preparedSummary: {
        kind: "html",
        html: '<p><img src="/Users/test/artifacts/reopened.png" alt="Reopened design"></p>',
        sourceHash: "prepared-image",
      },
    };

    render(
      <TaskChatTranscript entries={[entry]} onResolveRequest={vi.fn()} />,
      services,
    );

    expect(
      await screen.findByRole("img", { name: "Reopened design" }),
    ).toHaveAttribute("src", "data:image/png;base64,reopened-preview");
  });

it("renders submitted, steered, and assistant web URLs as clickable links", () => {
    const onOpenTranscriptLink = vi.fn(() => true);
    const entry: TaskChatEntry = {
      ...historyEntry(1),
      prompt: "Open https://example.com/input.",
      runView: {
        ...historyEntry(1).runView,
        streamEvents: [{
          id: "steer-1", kind: "steer", delivery: "sent", contextFiles: [],
          text: "Then visit https://example.com/follow-up.", timestamp: "2026-06-30T17:31:00Z",
        }],
        finalMessage: "Results are at https://example.com/result.",
      },
    };

    render(
      <TaskChatTranscript
        entries={[entry]}
        onResolveRequest={vi.fn()}
        onOpenTranscriptLink={onOpenTranscriptLink}
      />,
    );

    const inputLink = screen.getByRole("link", {
      name: "https://example.com/input",
    });
    const steeredLink = screen.getByRole("link", {
      name: "https://example.com/follow-up",
    });
    const resultLink = screen.getByRole("link", {
      name: "https://example.com/result",
    });
    expect(inputLink).toHaveClass("submitted-web-link");
    expect(steeredLink).toHaveClass("submitted-web-link");
    expect(resultLink).toHaveClass("markdown-external-link");

    fireEvent.click(inputLink);
    fireEvent.click(steeredLink);
    fireEvent.click(resultLink);

    expect(onOpenTranscriptLink).toHaveBeenNthCalledWith(
      1,
      "https://example.com/input",
    );
    expect(onOpenTranscriptLink).toHaveBeenNthCalledWith(
      2,
      "https://example.com/follow-up",
    );
    expect(onOpenTranscriptLink).toHaveBeenNthCalledWith(
      3,
      "https://example.com/result",
    );
  });

it("keeps URLs inside submitted code spans as plain text", () => {
    render(
      <TaskChatTranscript
        entries={[
          {
            ...historyEntry(1),
            prompt: "Keep `https://example.com/not-a-link` as code.",
          },
        ]}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("link", {
        name: "https://example.com/not-a-link",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Submitted prompt")).toHaveTextContent(
      "https://example.com/not-a-link",
    );
  });

it("renders prepared historical HTML instead of parsing the raw summary on mount", () => {
    const entry = {
      ...historyEntry(1),
      runView: {
        ...historyEntry(1).runView,
        finalMessage: "Raw summary that should not be mounted.",
      },
      preparedSummary: {
        kind: "html" as const,
        html: "<h2>Prepared summary</h2><p>Rendered before publication.</p>",
        sourceHash: "prepared",
      },
    };

    render(
      <TestTaskChatTurn
        entry={entry}
        editable={false}
        editing={false}
        editingPrompt=""
        onEditingPromptChange={vi.fn()}
        onSubmitEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onStartEdit={vi.fn()}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Prepared summary" })).toBeInTheDocument();
    expect(screen.getByText("Rendered before publication.")).toBeInTheDocument();
    expect(screen.queryByText("Raw summary that should not be mounted.")).toBeNull();
  });

it("delegates prepared historical file links to the preview handler", () => {
    const onOpenTranscriptLink = vi.fn(() => true);
    const entry = {
      ...historyEntry(1),
      preparedSummary: {
        kind: "html" as const,
        html: '<p>Updated <a class="markdown-preview-link" href="/repo/App.tsx">App.tsx</a>.</p>',
        sourceHash: "prepared-link",
      },
    };

    render(
      <TestTaskChatTurn
        entry={entry}
        editable={false}
        editing={false}
        editingPrompt=""
        onEditingPromptChange={vi.fn()}
        onSubmitEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onStartEdit={vi.fn()}
        onResolveRequest={vi.fn()}
        onOpenTranscriptLink={onOpenTranscriptLink}
      />,
    );

    fireEvent.click(screen.getByRole("link", { name: "App.tsx" }));
    expect(onOpenTranscriptLink).toHaveBeenCalledWith("/repo/App.tsx");
  });

it("renders live app-server file links as Markdown", () => {
    const onOpenTranscriptLink = vi.fn(() => true);
    const entry: TaskChatEntry = {
      ...historyEntry(1),
      status: "running",
      runView: {
        ...emptyRunView,
        status: "running",
        streamEvents: [
          {
            id: "message-1",
            kind: "message",
            text:
              "Added [batman.txt](/Users/test/Library/Application Support/com.example/card/batman.txt).",
            timestamp: "2026-08-10T10:00:00.000Z",
          },
        ],
      },
    };

    render(
      <TestTaskChatTurn
        entry={entry}
        editable={false}
        editing={false}
        editingPrompt=""
        onEditingPromptChange={vi.fn()}
        onSubmitEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onStartEdit={vi.fn()}
        onResolveRequest={vi.fn()}
        onOpenTranscriptLink={onOpenTranscriptLink}
      />,
    );

    const link = screen.getByRole("link", { name: "batman.txt" });
    expect(link).toHaveClass("markdown-preview-link");
    expect(screen.queryByText(/\[batman\.txt\]/)).toBeNull();
    fireEvent.click(link);
    expect(onOpenTranscriptLink).toHaveBeenCalledWith(
      "/Users/test/Library/Application%20Support/com.example/card/batman.txt",
    );
  });

it("uses one stable Markdown response while the final answer completes", () => {
  const incomplete = [
    "First paragraph.",
    "",
    "Second paragraph.",
    "",
    "- One",
    "- Updated [favicon.svg](/repo/public/favicon.svg",
  ].join("\n");
  const complete = `${incomplete})`;
  const runningEntry: TaskChatEntry = {
    ...historyEntry(1),
    status: "running",
    runView: {
      ...emptyRunView,
      status: "running",
      agentMessagesById: {
        "final-1": { text: incomplete, phase: "final_answer" },
      },
      streamEvents: [
        {
          id: "message-1",
          kind: "message",
          text: incomplete,
          timestamp: "2026-08-21T12:00:00.000Z",
          activityIds: ["final-1"],
        },
      ],
    },
  };
  const actions: TranscriptTurnActions = {
    onEditingPromptChange: vi.fn(),
    onSubmitEdit: vi.fn(),
    onCancelEdit: vi.fn(),
    onStartEdit: vi.fn(),
    onResolveRequest: vi.fn(),
  };
  const result = render(
    <TestTaskChatTurn
      entry={runningEntry}
      editable={false}
      editing={false}
      editingPrompt=""
      {...actions}
    />,
  );

  const liveResponse = screen.getByLabelText("Run summary");
  expect(liveResponse).toHaveClass(
    "run-summary",
    "markdown-summary",
    "assistant-markdown-message",
  );
  expect(liveResponse).toHaveTextContent("Updated favicon.svg");
  expect(liveResponse).not.toHaveTextContent("/repo/public/favicon.svg");
  expect(screen.queryByLabelText("App-server stream")).toBeNull();
  expect(within(liveResponse).queryByRole("link", { name: "favicon.svg" })).toBeNull();

  result.rerender(
    <TestTaskChatTurn
      entry={{
        ...runningEntry,
        status: "completed",
        runView: {
          ...runningEntry.runView,
          status: "completed",
          finalMessage: complete,
          finalMessageItemId: "final-1",
          agentMessagesById: {
            "final-1": { text: complete, phase: "final_answer" },
          },
          streamEvents: [
            {
              ...runningEntry.runView.streamEvents[0]!,
              text: complete,
            },
          ],
        },
      }}
      editable={false}
      editing={false}
      editingPrompt=""
      {...actions}
    />,
  );

  const completedResponse = screen.getByLabelText("Run summary");
  expect(completedResponse).toBe(liveResponse);
  expect(
    within(completedResponse).getByRole("link", { name: "favicon.svg" }),
  ).toHaveAttribute("href", "/repo/public/favicon.svg");
  expect(screen.getAllByText("First paragraph.")).toHaveLength(1);
});

it("uses completed-summary whitespace rules while the final answer streams", () => {
  const text = [
    "First paragraph.",
    "",
    "Second paragraph.",
    "",
    "- First item",
    "- Second item",
  ].join("\n");
  const entry: TaskChatEntry = {
    ...historyEntry(1),
    status: "running",
    runView: {
      ...emptyRunView,
      status: "running",
      agentMessagesById: {
        "final-1": { text, phase: "final_answer" },
      },
      streamEvents: [
        {
          id: "message-1",
          kind: "message",
          text,
          timestamp: "2026-08-21T12:00:00.000Z",
          activityIds: ["final-1"],
        },
      ],
    },
  };

  render(
    <TestTaskChatTurn
      entry={entry}
      editable={false}
      editing={false}
      editingPrompt=""
      onEditingPromptChange={vi.fn()}
      onSubmitEdit={vi.fn()}
      onCancelEdit={vi.fn()}
      onStartEdit={vi.fn()}
      onResolveRequest={vi.fn()}
    />,
  );

  const response = screen.getByLabelText("Run summary");
  expect(response.querySelectorAll(":scope > p")).toHaveLength(2);
  expect(response.querySelectorAll(":scope > ul")).toHaveLength(1);
  expect(response).toHaveClass("markdown-summary");
});

it("renders a completed web preview between the summary and edited files", async () => {
    const onOpenWebPreview = vi.fn().mockResolvedValue(undefined);
    const entry: TaskChatEntry = {
      ...historyEntry(1),
      runView: {
        ...historyEntry(1).runView,
        webPreview: {
          version: 1,
          url: "http://localhost:5173/",
          origin: "http://localhost:5173",
          detectedAt: "2026-07-24T12:00:00.000Z",
          sourceCommandId: "command-1",
          availability: "available",
        },
        editedFiles: [
          {
            path: "/repo/src/App.tsx",
            name: "App.tsx",
            status: "modified",
            additions: 4,
            deletions: 1,
          },
        ],
      },
    };

    const { container } = render(
      <TestTaskChatTurn
        entry={entry}
        editable={false}
        editing={false}
        editingPrompt=""
        onEditingPromptChange={vi.fn()}
        onSubmitEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onStartEdit={vi.fn()}
        onResolveRequest={vi.fn()}
        onOpenWebPreview={onOpenWebPreview}
      />,
    );

    expect(screen.getByText("Web preview")).toBeInTheDocument();
    expect(screen.getByText("Website")).toBeInTheDocument();
    const summary = container.querySelector(".run-summary");
    const preview = container.querySelector(".web-preview-card");
    const edits = container.querySelector(".edited-files-summary");
    expect(summary).not.toBeNull();
    expect(preview).not.toBeNull();
    expect(preview?.tagName).toBe("BUTTON");
    expect(edits).not.toBeNull();
    expect(screen.queryByText("Open in browser")).not.toBeInTheDocument();
    expect(
      preview?.querySelector(".web-preview-action-icon"),
    ).toHaveClass("transcript-summary-action-slot");
    expect(edits?.querySelector(".edited-files-action")).toHaveClass(
      "transcript-summary-action-slot",
    );
    expect(
      summary!.compareDocumentPosition(preview!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      preview!.compareDocumentPosition(edits!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Open web preview in browser" }),
    );
    await waitFor(() =>
      expect(onOpenWebPreview).toHaveBeenCalledWith(
        entry,
        entry.runView.webPreview,
      ),
    );
  });

it("keeps an unavailable web preview retryable without changing its geometry", async () => {
    const onOpenWebPreview = vi
      .fn()
      .mockRejectedValue(new Error("listener closed"));
    const entry: TaskChatEntry = {
      ...historyEntry(1),
      runView: {
        ...historyEntry(1).runView,
        webPreview: {
          version: 1,
          url: "http://localhost:3000/",
          origin: "http://localhost:3000",
          detectedAt: "2026-07-24T12:00:00.000Z",
          sourceCommandId: "command-2",
          availability: "unchecked",
        },
      },
    };

    render(
      <TestTaskChatTurn
        entry={entry}
        editable={false}
        editing={false}
        editingPrompt=""
        onEditingPromptChange={vi.fn()}
        onSubmitEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onStartEdit={vi.fn()}
        onResolveRequest={vi.fn()}
        onOpenWebPreview={onOpenWebPreview}
      />,
    );

    const button = screen.getByRole("button", {
      name: "Open web preview in browser",
    });
    fireEvent.click(button);
    await screen.findByText("Preview unavailable");
    expect(button).toBeEnabled();
  });

it.each(["plan", "plan-revision"] as const)(
  "does not render a web preview for %s turns",
  (intent) => {
    const entry: TaskChatEntry = {
      ...historyEntry(1),
      runView: {
        ...historyEntry(1).runView,
        nativePlan: {
          ...historyEntry(1).runView.nativePlan,
          intent,
        },
        webPreview: {
          version: 1,
          url: "http://localhost:5173/",
          origin: "http://localhost:5173",
          detectedAt: "2026-08-20T12:00:00.000Z",
          sourceCommandId: "command-plan-preview",
          availability: "unavailable",
        },
      },
    };

    render(
      <TestTaskChatTurn
        entry={entry}
        editable={false}
        editing={false}
        editingPrompt=""
        onEditingPromptChange={vi.fn()}
        onSubmitEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onStartEdit={vi.fn()}
        onResolveRequest={vi.fn()}
        onOpenWebPreview={vi.fn()}
      />,
    );

    expect(screen.queryByText("Web preview")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open web preview in browser" }),
    ).not.toBeInTheDocument();
  },
);

it("retains web previews for plan implementation turns", () => {
    const entry: TaskChatEntry = {
      ...historyEntry(1),
      runView: {
        ...historyEntry(1).runView,
        nativePlan: {
          ...historyEntry(1).runView.nativePlan,
          intent: "plan-implementation",
        },
        webPreview: {
          version: 1,
          url: "http://localhost:5173/",
          origin: "http://localhost:5173",
          detectedAt: "2026-08-20T12:00:00.000Z",
          sourceCommandId: "command-implementation-preview",
          availability: "available",
        },
      },
    };

    render(
      <TestTaskChatTurn
        entry={entry}
        editable={false}
        editing={false}
        editingPrompt=""
        onEditingPromptChange={vi.fn()}
        onSubmitEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onStartEdit={vi.fn()}
        onResolveRequest={vi.fn()}
        onOpenWebPreview={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Open web preview in browser" }),
    ).toBeInTheDocument();
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
                turnTokens: 734,
                turnCachedInputTokens: 200,
                contextTokens: 900,
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
            historicalActivity: {
              source: "persisted-run",
              runId: 2,
              status: "loaded",
              nextCursor: "older-activity",
              error: null,
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
    expect(within(liveOutput).getByText("Working for 1m 5s")).toBeInTheDocument();
    expect(within(liveOutput).getByText("734 tokens")).toBeInTheDocument();
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
    const onOpenTranscriptLink = vi.fn(() => true);
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
            prompt: "Delete the [hello-world.txt](/repo/hello-world.txt:1) file",
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
        onOpenTranscriptLink={onOpenTranscriptLink}
      />,
    );

    const submittedPrompt = screen.getByLabelText("Submitted prompt");
    const fileLink = within(submittedPrompt).getByRole("link", {
      name: "hello-world.txt",
    });

    expect(fileLink).toHaveClass("submitted-inline-file");
    expect(within(fileLink).getByText("TXT")).toBeInTheDocument();

    fireEvent.click(fileLink);

    expect(onOpenTranscriptLink).toHaveBeenCalledWith("/repo/hello-world.txt:1");
  });

it("restores the inline file appearance from persisted Markdown alone", () => {
    render(
      <TaskChatTranscript
        entries={[
          {
            clientId: "history-chat-1",
            workspaceId: 1,
            chatId: 401,
            turnIndex: 1,
            runId: 301,
            taskId: 101,
            prompt: "Update [hello-world.txt](/repo/hello-world.txt:1)",
            submittedAt: "2026-06-30T17:30:00Z",
            status: "completed",
            runView: {
              ...emptyRunView,
              status: "completed",
              finalMessage: "Done.",
            },
          },
        ]}
        onResolveRequest={vi.fn()}
      />,
    );

    const submittedPrompt = screen.getByLabelText("Submitted prompt");
    const fileLink = within(submittedPrompt).getByRole("link", {
      name: "hello-world.txt",
    });
    expect(within(fileLink).getByText("TXT")).toBeInTheDocument();
    expect(fileLink).toHaveAttribute("href", "/repo/hello-world.txt:1");
    expect(submittedPrompt).not.toHaveTextContent("[hello-world.txt](");
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
            prompt: "Delete the [hello-world.txt](/repo/hello-world.txt:1) file",
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
      "Delete the [hello-world.txt](/repo/hello-world.txt:1) file",
    );
    const rawPayload = clipboardData.setData.mock.calls.find(
      ([type]) => type === ORCHESTRATOR_PROMPT_CONTEXT_MIME,
    )?.[1];
    if (typeof rawPayload !== "string") {
      throw new Error("Missing prompt context clipboard payload");
    }
    expect(JSON.parse(rawPayload)).toMatchObject({
      version: 1,
      prompt: "Delete the [hello-world.txt](/repo/hello-world.txt:1) file",
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
              elapsedMs: 6_726_000,
              tokenUsage: {
                totalTokens: 69839,
                inputTokens: 69000,
                cachedInputTokens: 0,
                outputTokens: 800,
                reasoningOutputTokens: 39,
                turnTokens: 69839,
                turnCachedInputTokens: 0,
                contextTokens: 68000,
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
    expect(within(traceTrigger).getByText("Worked for 1hr 52m 6s")).toBeInTheDocument();
    expect(within(traceTrigger).getByText("69,839 tokens")).toBeInTheDocument();
    expect(
      screen.queryByText("1hr 52m 6s • 69,839 tokens"),
    ).not.toBeInTheDocument();
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
    expect(screen.queryByText("Load older activity")).not.toBeInTheDocument();
  });

it("does not label cumulative thread usage as a completed turn total", () => {
    render(
      <TaskChatTranscript
        entries={[
          {
            clientId: "chat-unknown-turn-usage",
            workspaceId: 1,
            chatId: 401,
            turnIndex: 2,
            runId: 2,
            taskId: 3,
            prompt: "Continue an imported thread",
            submittedAt: "2026-06-30T17:30:00Z",
            status: "completed",
            runView: {
              ...emptyRunView,
              status: "completed",
              tokenUsage: {
                totalTokens: 173_959,
                inputTokens: 171_922,
                cachedInputTokens: 131_968,
                outputTokens: 2_037,
                reasoningOutputTokens: 103,
                turnTokens: null,
                turnCachedInputTokens: null,
                contextTokens: 18_757,
                modelContextWindow: 258_400,
              },
              finalMessage: "Completed the imported-thread request.",
            },
          },
        ]}
        onResolveRequest={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Run metrics")).toHaveTextContent(
      "Token usage unavailable",
    );
    expect(screen.queryByText("173,959 tokens")).not.toBeInTheDocument();
  });

it("routes markdown file links through the app file preview handler", () => {
    const onOpenTranscriptLink = vi.fn(() => true);
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
        onOpenTranscriptLink={onOpenTranscriptLink}
      />,
    );

    const previewLink = screen.getByRole("link", { name: "hello-world.txt" });
    expect(previewLink).toHaveClass("markdown-preview-link");
    expect(within(previewLink).queryByText("Preview")).not.toBeInTheDocument();

    fireEvent.click(previewLink);

    expect(onOpenTranscriptLink).toHaveBeenCalledWith("/repo/hello-world.txt");
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

it("keeps the edited-files summary hidden while command activity is running", () => {
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
    const commandGroup = activityGroups[0];
    const commandDetails = commandGroup.querySelector("details.command-runs");

    expect(screen.queryByLabelText("Edited 2 files")).not.toBeInTheDocument();
    expect(within(commandGroup).getByText("Ran 2 commands")).toBeInTheDocument();
    expect(commandDetails).toBeInstanceOf(HTMLDetailsElement);
    expect((commandDetails as HTMLDetailsElement).open).toBe(false);
    expect(
      within(commandGroup).getByText(
        "npm test -- --run src/components/TaskChatTranscript.test.tsx",
      ),
    ).toBeInTheDocument();
    expect(within(commandGroup).getByText("for 12s")).toBeInTheDocument();
    const firstMessage = screen.getByText("I will inspect the files first.");
    const secondMessage = screen.getByText("The transcript view is updated.");
    expect(
      firstMessage.compareDocumentPosition(secondMessage) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      secondMessage.compareDocumentPosition(commandGroup) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText("npm test output")).not.toBeInTheDocument();
  expect(container.querySelector("details.edited-files")).toBeNull();
  });

  it("shows active and failed tools while collapsing completed tool activity", () => {
    const activities = {
      "tool-running": {
        id: "tool-running",
        category: "browser" as const,
        server: "playwright",
        tool: "browser_snapshot",
        label: "Inspecting the current browser page",
        status: "running" as const,
        startedAt: "2026-06-30T17:30:01Z",
        completedAt: null,
        durationMs: null,
        safeDetails: [{ label: "Origin", value: "http://localhost:3000" }],
      },
      "tool-completed": {
        id: "tool-completed",
        category: "github" as const,
        server: "codex_apps",
        tool: "github.get_pr_info",
        label: "Read pull request details",
        status: "completed" as const,
        startedAt: null,
        completedAt: null,
        durationMs: 900,
        safeDetails: [{ label: "Repository", value: "openai/orchestrator" }],
      },
      "tool-completed-2": {
        id: "tool-completed-2",
        category: "github" as const,
        server: "codex_apps",
        tool: "github.list_prs",
        label: "Listed pull requests",
        status: "completed" as const,
        startedAt: null,
        completedAt: null,
        durationMs: 400,
        safeDetails: [],
      },
      "tool-failed": {
        id: "tool-failed",
        category: "browser" as const,
        server: "playwright",
        tool: "browser_take_screenshot",
        label: "Could not capture a page screenshot",
        status: "failed" as const,
        startedAt: null,
        completedAt: null,
        durationMs: 200,
        safeDetails: [],
      },
    };
    render(
      <TaskChatTranscript
        entries={[
          {
            ...historyEntry(1),
            status: "running",
            runView: {
              ...emptyRunView,
              status: "running",
              toolActivitiesById: activities,
              toolActivityOrder: [
                "tool-running",
                "tool-completed",
                "tool-completed-2",
                "tool-failed",
              ],
              streamEvents: [
                {
                  id: "tool-running-event",
                  kind: "activity",
                  text: "Using tools",
                  timestamp: "2026-06-30T17:30:01Z",
                  activityIds: ["tool-running"],
                },
                {
                  id: "tool-completed-event",
                  kind: "activity",
                  text: "Completed mcpToolCall",
                  timestamp: "2026-06-30T17:30:02Z",
                  activityIds: ["tool-completed"],
                },
                {
                  id: "tool-completed-2-event",
                  kind: "activity",
                  text: "Completed mcpToolCall",
                  timestamp: "2026-06-30T17:30:03Z",
                  activityIds: ["tool-completed-2"],
                },
                {
                  id: "tool-failed-event",
                  kind: "activity",
                  text: "Completed mcpToolCall",
                  timestamp: "2026-06-30T17:30:04Z",
                  activityIds: ["tool-failed"],
                },
              ],
            },
          },
        ]}
        onResolveRequest={vi.fn()}
      />,
    );

    const activeToolRow = screen
      .getByText("Inspecting the current browser page")
      .closest(".tool-activity-row");
    expect(activeToolRow).toBeVisible();
    expect(activeToolRow?.querySelector(".tool-activity-icon svg")).not.toBeNull();
    expect(activeToolRow?.querySelector(".tool-activity-icon .spin")).toBeNull();
    expect(screen.getByText("Could not capture a page screenshot")).toBeVisible();
    expect(screen.getByText("Used 2 github tools")).toBeVisible();
    expect(screen.getByText("Read pull request details")).toBeInTheDocument();
    expect(screen.getByText("openai/orchestrator")).toBeInTheDocument();
    expect(screen.queryByText(/mcpToolCall|Started|Completed/u)).not.toBeInTheDocument();
  });

  it("collapses recovered retries with completed tool activity", () => {
    const recoveredLabel =
      "Recovered after retry: inspect the game menu and runtime logs";
    render(
      <TaskChatTranscript
        entries={[
          {
            ...historyEntry(1),
            status: "running",
            runView: {
              ...emptyRunView,
              status: "running",
              toolActivitiesById: {
                failed: {
                  id: "failed",
                  category: "browser",
                  server: "node-repl",
                  tool: "js",
                  label: recoveredLabel,
                  status: "recovered",
                  startedAt: null,
                  completedAt: null,
                  durationMs: 2332,
                  safeDetails: [],
                },
                completed: {
                  id: "completed",
                  category: "browser",
                  server: "node-repl",
                  tool: "js",
                  label: "Inspected the game menu and runtime logs",
                  status: "completed",
                  startedAt: null,
                  completedAt: null,
                  durationMs: 7657,
                  safeDetails: [],
                },
              },
              toolActivityOrder: ["failed", "completed"],
              streamEvents: [
                {
                  id: "failed-event",
                  kind: "activity",
                  text: "Could not inspect the game menu and runtime logs",
                  timestamp: "2026-09-05T07:15:13Z",
                  activityIds: ["failed"],
                },
                {
                  id: "completed-event",
                  kind: "activity",
                  text: "Inspected the game menu and runtime logs",
                  timestamp: "2026-09-05T07:15:21Z",
                  activityIds: ["completed"],
                },
              ],
            },
          },
        ]}
        onResolveRequest={vi.fn()}
      />,
    );

    const summary = screen.getByText("Used 1 browser tool · 1 retry recovered");
    expect(summary).toBeVisible();
    expect(screen.getByText(recoveredLabel)).not.toBeVisible();
    expect(
      screen.queryByText("Could not inspect the game menu and runtime logs"),
    ).not.toBeInTheDocument();

    fireEvent.click(summary);
    expect(screen.getByText(recoveredLabel)).toBeVisible();
    expect(screen.getByText(recoveredLabel).closest(".tool-activity-row")).toHaveClass(
      "is-recovered",
    );
  });

it("reviews files, expands long lists, and confirms an exact edit undo", async () => {
    const onReviewEditedFile = vi.fn();
    const onUndoEditedFiles = vi.fn().mockResolvedValue(undefined);
    const files = [
      {
        path: "src/App.tsx",
        name: "App.tsx",
        additions: 4,
        deletions: 1,
        status: "modified" as const,
      },
      {
        path: "src/components/TaskChatTranscript.tsx",
        name: "TaskChatTranscript.tsx",
        additions: 20,
        deletions: 3,
        status: "modified" as const,
      },
      {
        path: "src/components/a-very-long-directory-name/EditedFilesSummary.tsx",
        name: "EditedFilesSummary.tsx",
        additions: 40,
        deletions: 0,
        status: "added" as const,
      },
      {
        path: "src/App.css",
        name: "App.css",
        additions: 12,
        deletions: 2,
        status: "modified" as const,
      },
    ];
    const entry: TaskChatEntry = {
      ...historyEntry(1),
      runView: {
        ...historyEntry(1).runView,
        editedFiles: files,
        latestDiff: "diff --git a/src/App.tsx b/src/App.tsx\n",
      },
    };

    render(
      <TestTaskChatTurn
        entry={entry}
        editable={false}
        editing={false}
        editingPrompt=""
        onEditingPromptChange={vi.fn()}
        onSubmitEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onStartEdit={vi.fn()}
        onResolveRequest={vi.fn()}
        onReviewEditedFile={onReviewEditedFile}
        onUndoEditedFiles={onUndoEditedFiles}
      />,
    );

    const summary = screen.getByLabelText("Edited 4 files");
    const summaryTitle = within(summary).getByText("Edited 4 files");
    expect(summaryTitle.tagName).toBe("SPAN");
    expect(summaryTitle.closest("strong")).toBeNull();
    expect(within(summary).getByText("+76")).toBeInTheDocument();
    expect(within(summary).getByText("-6")).toBeInTheDocument();
    expect(within(summary).queryByRole("button", { name: "Review" })).toBeNull();
    expect(within(summary).queryByText("src/App.css")).toBeNull();
    expect(
      within(summary).getByRole("button", {
        name: "Review src/components/a-very-long-directory-name/EditedFilesSummary.tsx",
      }),
    ).toHaveAttribute(
      "title",
      "src/components/a-very-long-directory-name/EditedFilesSummary.tsx",
    );

    fireEvent.click(within(summary).getByRole("button", { name: "Show 1 more file" }));
    expect(within(summary).getByText("src/App.css")).toBeInTheDocument();
    expect(within(summary).getByRole("button", { name: "Show fewer files" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    fireEvent.click(
      within(summary).getByRole("button", { name: "Review src/App.tsx" }),
    );
    await waitFor(() => expect(onReviewEditedFile).toHaveBeenCalledWith(entry, files[0]));

    const undoButton = within(summary).getByRole("button", {
      name: "Undo file changes",
    });
    expect(undoButton).toHaveTextContent("");
    expect(undoButton).toHaveAttribute("data-tooltip", "Undo these file changes");
    expect(undoButton).not.toHaveAttribute("title");
    fireEvent.click(undoButton);
    expect(
      within(summary).queryByText(
        "Undo the changes represented by this summary?",
      ),
    ).toBeNull();
    const undoDialog = screen.getByRole("dialog", { name: "Undo changes?" });
    expect(undoDialog).toHaveClass("confirmation-dialog");
    expect(undoDialog.parentElement).toHaveClass("modal-backdrop");
    expect(
      within(undoDialog).getByText(
        "Undo the changes represented by this summary?",
      ),
    ).toBeInTheDocument();
    const keepChangesButton = within(undoDialog).getByRole("button", {
      name: "Keep changes",
    });
    expect(keepChangesButton).toHaveTextContent("");
    expect(keepChangesButton).toHaveAttribute("data-tooltip", "Keep changes");
    const confirmUndoButton = within(undoDialog).getByRole("button", {
      name: "Undo changes",
    });
    expect(confirmUndoButton).toHaveTextContent("");
    expect(confirmUndoButton).toHaveAttribute("data-tooltip", "Undo changes");
    fireEvent.click(keepChangesButton);
    expect(
      screen.queryByRole("dialog", { name: "Undo changes?" }),
    ).not.toBeInTheDocument();
    expect(onUndoEditedFiles).not.toHaveBeenCalled();

    fireEvent.click(undoButton);
    const backdropDialog = screen.getByRole("dialog", {
      name: "Undo changes?",
    });
    fireEvent.mouseDown(backdropDialog.parentElement as HTMLElement);
    expect(
      screen.queryByRole("dialog", { name: "Undo changes?" }),
    ).not.toBeInTheDocument();

    fireEvent.click(undoButton);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Undo changes?" }),
    ).not.toBeInTheDocument();

    fireEvent.click(undoButton);
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Undo changes?" }),
      ).getByRole("button", { name: "Undo changes" }),
    );

    await waitFor(() => expect(onUndoEditedFiles).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole("dialog", { name: "Undo changes?" }),
    ).not.toBeInTheDocument();
    expect(within(summary).queryByText("Changes undone.")).toBeNull();
    expect(
      within(summary).getByRole("button", { name: "File changes undone" }),
    ).toBeDisabled();
  });

it("keeps an edit summary actionable when its guarded undo fails", async () => {
    const onUndoEditedFiles = vi
      .fn()
      .mockRejectedValue(new Error("These files changed after the saved edit"));
    const entry: TaskChatEntry = {
      ...historyEntry(1),
      runView: {
        ...historyEntry(1).runView,
        editedFiles: [
          {
            path: "src/App.tsx",
            name: "App.tsx",
            additions: 1,
            deletions: 1,
            status: "modified",
          },
        ],
        latestDiff: "diff --git a/src/App.tsx b/src/App.tsx\n",
      },
    };

    render(
      <TestTaskChatTurn
        entry={entry}
        editable={false}
        editing={false}
        editingPrompt=""
        onEditingPromptChange={vi.fn()}
        onSubmitEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onStartEdit={vi.fn()}
        onResolveRequest={vi.fn()}
        onUndoEditedFiles={onUndoEditedFiles}
      />,
    );

    const summary = screen.getByLabelText("Edited 1 file");
    fireEvent.click(
      within(summary).getByRole("button", { name: "Undo file changes" }),
    );
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Undo changes?" }),
      ).getByRole("button", { name: "Undo changes" }),
    );

    expect(
      await within(summary).findByText("These files changed after the saved edit"),
    ).toHaveAttribute("role", "alert");
    expect(onUndoEditedFiles).toHaveBeenCalledTimes(1);
    expect(
      within(summary).getByRole("button", { name: "Undo file changes" }),
    ).toBeEnabled();
  });
});
