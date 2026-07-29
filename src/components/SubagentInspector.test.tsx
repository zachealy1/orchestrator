import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  replaceConversationSubagents,
  type SubagentRecord,
  type SubagentTranscript,
} from "../lib/subagents";
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
            text: "**Inspection underway**",
            phase: "commentary",
          },
          {
            id: "command",
            kind: "activity",
            activityKind: "command",
            label: "Shell command",
            status: "completed",
          },
        ],
      },
    ],
  };
}

function renderInspector(id: string) {
  const conversationKey = `chat:${id}`;
  const subagent = record(id);
  replaceConversationSubagents(conversationKey, [subagent]);
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
    ...render(
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
});
