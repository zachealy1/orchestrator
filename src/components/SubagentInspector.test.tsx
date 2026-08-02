import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import type { SubagentRecord, SubagentTranscript } from "../lib/subagents";
import { AppServices } from "../runtime/AppServices";
import { renderWithAppServices } from "../test/renderWithAppServices";
import { SubagentInspector } from "./SubagentInspector";

vi.mock("react-virtuoso", () => ({
  Virtuoso: ({
    data,
    itemContent,
    className,
  }: {
    data: Array<{ id: string }>;
    itemContent: (
      index: number,
      item: { id: string },
    ) => React.ReactNode;
    className?: string;
  }) => (
    <div className={className}>
      {data.map((item, index) => (
        <div key={item.id}>{itemContent(index, item)}</div>
      ))}
    </div>
  ),
}));

function record(id: string): SubagentRecord {
  return {
    id,
    ownerClientId: "owner",
    workspaceId: 1,
    chatId: 2,
    runId: 3,
    parentTurnId: "parent-turn",
    profileKey: "account:7",
    accountId: 7,
    rootThreadId: "root",
    parentThreadId: "root",
    childThreadId: `thread-${id}`,
    childTurnId: `turn-${id}`,
    spawnItemId: `spawn-${id}`,
    task: "Inspect the API",
    depth: 1,
    status: "running",
    statusBeforeAttention: null,
    agentStatus: "running",
    needsAttention: false,
    error: null,
    finalResult: null,
    startedAt: "2026-07-29T10:00:00.000Z",
    updatedAt: "2026-07-29T10:01:00.000Z",
    completedAt: null,
  };
}

function transcript(threadId: string): SubagentTranscript {
  return {
    threadId,
    status: "active",
    activeTurnId: "turn-child",
    turns: [
      {
        id: "turn-child",
        status: "running",
        startedAt: null,
        completedAt: null,
        items: [
          { id: "user", kind: "user", text: "Inspect the API" },
          {
            id: "assistant",
            kind: "assistant",
            text: "Inspection underway",
            phase: "commentary",
          },
          {
            id: "command",
            kind: "activity",
            activityKind: "command",
            label: "Shell command",
            status: "completed",
          },
          {
            id: "final",
            kind: "assistant",
            text: "**Inspection complete**",
            phase: "final_answer",
          },
        ],
      },
    ],
  };
}

function renderInspector(id: string) {
  const services = new AppServices();
  const conversationKey = `chat:${id}`;
  const subagent = record(id);
  services.subagents.replaceConversation(conversationKey, [subagent]);
  const onLoadTranscript = vi
    .fn()
    .mockResolvedValue(transcript(subagent.childThreadId));
  const onSteer = vi.fn().mockResolvedValue(undefined);
  const onStop = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  return {
    subagent,
    onLoadTranscript,
    onSteer,
    onStop,
    user,
    ...renderWithAppServices(
      <SubagentInspector
        conversationKey={conversationKey}
        subagentId={subagent.id}
        parentEntry={null}
        parentRunView={null}
        onClose={vi.fn()}
        onLoadTranscript={onLoadTranscript}
        onResolveRequest={vi.fn()}
        onAnswerUserInput={vi.fn()}
        onSteer={onSteer}
        onStop={onStop}
      />,
      {},
      services,
    ),
  };
}

describe("SubagentInspector", () => {
  it("loads a projected transcript lazily and sends text steering", async () => {
    const { user, subagent, onLoadTranscript, onSteer } =
      renderInspector("steer");

    await waitFor(() =>
      expect(onLoadTranscript).toHaveBeenCalledWith(subagent),
    );
    expect(
      await screen.findByText("Inspection underway"),
    ).toBeInTheDocument();
    expect(screen.getByText("Shell command")).toBeInTheDocument();
    expect(screen.queryByLabelText("Subagent task")).toBeNull();
    expect(screen.getByLabelText("Submitted prompt")).toHaveClass(
      "submitted-prompt",
    );
    expect(screen.getByText("Inspection underway")).toHaveClass(
      "stream-message",
    );
    expect(
      screen.getByText("Shell command").closest(".stream-event"),
    ).not.toBeNull();
    expect(
      screen.getByText("Inspection complete").closest(".run-summary"),
    ).toHaveClass("markdown-summary");

    const input = screen.getByRole("textbox", {
      name: "Send instruction to subagent",
    });
    await user.type(input, "Check the error path{enter}");
    expect(onSteer).toHaveBeenCalledWith(
      expect.objectContaining({ id: "steer" }),
      "Check the error path",
    );
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("uses Shift+Enter for a newline and confirms descendant-aware stopping", async () => {
    const { user, onSteer, onStop } = renderInspector("stop");
    await screen.findByText("Inspection underway");
    const input = screen.getByRole("textbox", {
      name: "Send instruction to subagent",
    });
    await user.type(input, "Line one{shift>}{enter}{/shift}Line two");
    expect(onSteer).not.toHaveBeenCalled();
    expect(input).toHaveValue("Line one\nLine two");

    await user.click(screen.getByRole("button", { name: "Stop subagent" }));
    const dialog = screen.getByRole("dialog", {
      name: "Stop this subagent?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Stop subagent" }),
    );
    expect(onStop).toHaveBeenCalledWith(
      expect.objectContaining({ id: "stop" }),
    );
  });

  it("renders icon-action tooltips in a viewport portal", async () => {
    const { user } = renderInspector("tooltip");
    await screen.findByText("Inspection underway");
    const inspector = screen.getByLabelText(
      "Subagent inspector: Inspect the API",
    );
    const stop = screen.getByRole("button", { name: "Stop subagent" });

    await user.hover(stop);

    const tooltip = await screen.findByRole("tooltip", {
      name: "Stop subagent",
    });
    expect(inspector.contains(tooltip)).toBe(false);
    expect(tooltip.parentElement).toBe(document.body);
  });

  it("refreshes visible app-server output as an active child advances", async () => {
    const { subagent, onLoadTranscript, services } = renderInspector("stream");
    await screen.findByText("Inspection underway");
    onLoadTranscript.mockResolvedValue({
      ...transcript(subagent.childThreadId),
      turns: [
        {
          ...transcript(subagent.childThreadId).turns[0],
          items: [
            {
              id: "assistant-update",
              kind: "assistant",
              text: "Checking another endpoint",
              phase: "commentary",
            },
          ],
        },
      ],
    });

    act(() => {
      services.subagents.replaceConversation("chat:stream", [
        {
          ...subagent,
          updatedAt: "2026-07-29T10:02:00.000Z",
        },
      ]);
    });

    expect(
      await screen.findByText("Checking another endpoint", undefined, {
        timeout: 1_500,
      }),
    ).toHaveClass("stream-message");
    expect(onLoadTranscript).toHaveBeenCalledTimes(2);
  });
});
