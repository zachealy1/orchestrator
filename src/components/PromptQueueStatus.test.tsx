import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { createQueuedPromptSnapshot } from "../lib/promptQueue";
import { createRunExecutionSettings } from "../lib/runExecutionSettings";
import type { PromptQueueItem } from "../types";
import { PromptQueueStatus } from "./PromptQueueStatus";

vi.mock("react-virtuoso", () => ({
  Virtuoso: ({
    data,
    itemContent,
    className,
  }: {
    data: PromptQueueItem[];
    itemContent: (index: number, item: PromptQueueItem) => React.ReactNode;
    className?: string;
  }) => (
    <div className={className}>
      {data.map((item, index) => (
        <div key={item.id}>{itemContent(index, item)}</div>
      ))}
    </div>
  ),
}));

const settings = createRunExecutionSettings({
  accountId: 7,
  profileKey: "account:7",
  selectedBranch: "main",
  mode: "run",
  intent: "normal",
  accessMode: "ask-for-approval",
  computerUseEnabled: true,
  model: "gpt-5.6",
  reasoningEffort: "medium",
  useOss: false,
  ossProvider: "ollama",
  contextFiles: [],
  selectedSkills: [],
  goalMode: false,
});

function queueItem(
  id: string,
  status: PromptQueueItem["status"] = "queued",
): PromptQueueItem {
  const contextFingerprint = {
    version: 1 as const,
    workspacePath: "/workspace",
    branch: "main",
    headCommit: "abc",
    worktreeFingerprint: "clean",
    profileKey: "account:7" as const,
    threadId: "thread-1",
    conversationRevision: 1,
    files: [],
  };
  return {
    id,
    clientMessageId: `message-${id}`,
    workspaceId: 1,
    chatId: 2,
    position: 0,
    sendNowPriority: null,
    autoSendEnabled: true,
    prompt: "Implement durable prompt queuing",
    snapshot: createQueuedPromptSnapshot({
      prompt: "Implement durable prompt queuing",
      executionSettings: settings,
      contextFingerprint,
    }),
    status,
    linkedRunId: status === "active" ? 11 : null,
    linkedTurnId: status === "active" ? "turn-1" : null,
    error: status === "failed" ? "Codex stopped before accepting the turn." : null,
    staleReasons: [],
    createdAt: "2026-07-26T10:00:00Z",
    updatedAt: "2026-07-26T10:00:00Z",
    acceptedAt: status === "active" ? "2026-07-26T10:00:01Z" : null,
    completedAt: null,
  };
}

function renderQueue(
  overrides: Partial<React.ComponentProps<typeof PromptQueueStatus>> = {},
) {
  const props: React.ComponentProps<typeof PromptQueueStatus> = {
    items: [queueItem("queue-1")],
    actionPendingItemId: null,
    onEdit: vi.fn(),
    onRemove: vi.fn(),
    onRetry: vi.fn(),
    onAutoSendChange: vi.fn(),
    onSendNow: vi.fn(),
    onReorder: vi.fn(),
    ...overrides,
  };
  return {
    props,
    user: userEvent.setup(),
    ...render(<PromptQueueStatus {...props} />),
  };
}

describe("PromptQueueStatus", () => {
  it("shows a compact preview and accessible icon-only actions", async () => {
    const { user, props } = renderQueue();

    await user.click(screen.getByRole("button", { name: /queue/i }));
    const queueRegion = screen.getByRole("region", { name: "Prompt queue" });
    expect(
      queueRegion.querySelector(".prompt-queue-item-disclosure"),
    ).not.toBeInTheDocument();
    expect(
      queueRegion.querySelector(".prompt-queue-item-expanded"),
    ).not.toBeInTheDocument();

    const toolbar = screen.getByRole("toolbar", {
      name: /Actions for queued prompt/i,
    });
    const edit = within(toolbar).getByRole("button", {
      name: "Edit queued prompt",
    });
    const sendNow = within(toolbar).getByRole("button", {
      name: "Send queued prompt now",
    });
    const remove = within(toolbar).getByRole("button", {
      name: "Remove queued prompt",
    });

    expect(edit).toHaveTextContent("");
    expect(remove).toHaveTextContent("");
    await user.hover(edit);
    const tooltip = screen.getByRole("tooltip", {
      name: "Edit queued prompt",
    });
    expect(tooltip.parentElement).toBe(document.body);
    expect(tooltip).toHaveClass("prompt-queue-portal-tooltip");
    expect(edit).toHaveAttribute("aria-describedby", tooltip.id);
    await user.unhover(edit);
    expect(
      screen.queryByRole("tooltip", { name: "Edit queued prompt" }),
    ).not.toBeInTheDocument();
    await user.click(sendNow);
    expect(props.onSendNow).toHaveBeenCalledWith(props.items[0]);
  });

  it("holds and restores automatic sending without removing the item", async () => {
    const heldItem = {
      ...queueItem("queue-1"),
      autoSendEnabled: false,
    };
    const { user, props, rerender } = renderQueue();

    await user.click(screen.getByRole("button", { name: /queue/i }));
    const hold = screen.getByRole("button", {
      name: "Skip automatic sending",
    });
    expect(hold.querySelector(".lucide-pause")).toBeInTheDocument();
    await user.click(hold);
    expect(props.onAutoSendChange).toHaveBeenCalledWith(props.items[0], false);

    rerender(
      <PromptQueueStatus
        {...props}
        items={[heldItem]}
      />,
    );
    expect(screen.getAllByText("Held").length).toBeGreaterThan(0);
    const restore = screen.getByRole("button", {
      name: "Restore automatic sending",
    });
    expect(restore.querySelector(".lucide-play")).toBeInTheDocument();
    await user.click(restore);
    expect(props.onAutoSendChange).toHaveBeenCalledWith(heldItem, true);
  });

  it("does not render queue-level paused controls", async () => {
    const { user } = renderQueue({
      items: [
        {
          ...queueItem("queue-1"),
          autoSendEnabled: false,
        },
      ],
    });

    expect(screen.queryByText("Queue paused")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Resume queue" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /queued/i }));
    expect(
      screen.queryByText("Queue processing is paused."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Restore automatic sending" }),
    ).toBeInTheDocument();
  });

  it("disables mutation and reordering for the active item", async () => {
    const active = queueItem("active-1", "active");
    const { user } = renderQueue({ items: [active] });

    await user.click(screen.getByRole("button", { name: /queue/i }));

    expect(
      screen.getByRole("button", { name: /reorder queued prompt/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Edit queued prompt" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Remove queued prompt" }),
    ).not.toBeInTheDocument();
  });

  it("exposes keyboard-sortable handles and instructions", async () => {
    const { user } = renderQueue({
      items: [queueItem("queue-1"), { ...queueItem("queue-2"), position: 1 }],
    });

    await user.click(screen.getByRole("button", { name: /queue/i }));
    const handles = screen.getAllByRole("button", {
      name: /reorder queued prompt/i,
    });

    expect(handles).toHaveLength(2);
    expect(handles[0]).toHaveAttribute("aria-roledescription", "sortable");
    expect(
      screen.getByText(/Press Space to lift a queued prompt/i),
    ).toBeInTheDocument();
  });
});
