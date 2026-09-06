import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { createQueuedPromptSnapshot } from "../lib/promptQueue";
import { createRunExecutionSettings } from "../lib/runExecutionSettings";
import type { PromptQueueItem } from "../features/queue/types";
import { OrchestratorTooltipLayer } from "./OrchestratorTooltipLayer";
import { PromptQueueStatus } from "./PromptQueueStatus";

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
  contextFiles: [],
  selectedSkills: [],
  goalMode: false,
});

function queueItem(
  id: string,
  status: PromptQueueItem["status"] = "queued",
): PromptQueueItem {
  const contextFingerprint = {
    version: 2 as const,
    workspacePath: "/workspace",
    repositories: [
      {
        repositoryPath: "/workspace",
        branch: "main",
        headCommit: "abc",
        worktreeFingerprint: "clean",
      },
    ],
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
    ...render(
      <>
        <PromptQueueStatus {...props} />
        <OrchestratorTooltipLayer />
      </>,
    ),
  };
}

describe("PromptQueueStatus", () => {
  it("shows a compact preview and accessible icon-only actions", async () => {
    const { user, props } = renderQueue();

    const toggle = screen.getByRole("button", { name: /queue/i });
    const row = toggle.closest(".prompt-queue-status-row");
    expect(row).toHaveClass("composer-strip-row");
    expect(row).toHaveAttribute("data-tone", "neutral");
    expect(
      Array.from(toggle.children).map((element) => element.className),
    ).toEqual([
      "composer-strip-icon",
      "composer-strip-primary",
      "composer-strip-end",
    ]);
    expect(
      Array.from(
        toggle.querySelector(".composer-strip-primary")!.children,
      ).map((element) => element.className),
    ).toEqual([
      "composer-strip-title",
      "composer-strip-description",
    ]);
    expect(
      Array.from(
        toggle.querySelector(".composer-strip-end")!.children,
      ).map((element) => element.className),
    ).toEqual([
      "composer-strip-trailing",
    ]);

    await user.click(toggle);
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
    expect(sendNow).toHaveAttribute(
      "data-tooltip",
      "Send now; steer the active agent when one is running",
    );
    await user.hover(edit);
    const tooltip = await screen.findByRole("tooltip", {
      name: "Edit queued prompt",
    });
    expect(tooltip.parentElement).toBe(document.body);
    expect(tooltip).toHaveClass("orchestrator-tooltip");
    expect(edit).toHaveAttribute("aria-describedby", tooltip.id);
    await user.unhover(edit);
    await waitFor(() =>
      expect(
        screen.queryByRole("tooltip", { name: "Edit queued prompt" }),
      ).not.toBeInTheDocument(),
    );
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
    expect(
      document.querySelector(".prompt-queue-status-row"),
    ).toHaveAttribute("data-tone", "muted");
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
    await user.click(screen.getByRole("button", { name: /prompt queue/i }));
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

  it("keeps double-digit counts and long prompts in the shared truncating slots", () => {
    const longPrompt =
      "Implement a deliberately long queued prompt that must remain accessible while the compact composer strip truncates it visually";
    const items = Array.from({ length: 12 }, (_, index) => ({
      ...queueItem(`queue-${index + 1}`),
      position: index,
      prompt: index === 0 ? longPrompt : `Queued prompt ${index + 1}`,
      snapshot: createQueuedPromptSnapshot({
        prompt: index === 0 ? longPrompt : `Queued prompt ${index + 1}`,
        executionSettings: settings,
        contextFingerprint: queueItem(`queue-${index + 1}`).snapshot
          .contextFingerprint,
      }),
    }));

    renderQueue({ items });

    expect(screen.queryByText("12 prompts")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /12 prompts/i }),
    ).toBeInTheDocument();
    expect(screen.getByTitle(longPrompt)).toHaveClass(
      "composer-strip-description",
    );
  });
});
