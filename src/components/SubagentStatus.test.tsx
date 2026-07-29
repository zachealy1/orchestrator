import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { SubagentRecord } from "../lib/subagents";
import { SubagentStatus } from "./SubagentStatus";

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

function record(
  id: string,
  status: SubagentRecord["status"],
): SubagentRecord {
  return {
    id,
    ownerClientId: "owner",
    workspaceId: 1,
    chatId: 2,
    runId: 3,
    parentTurnId: "parent-turn-123456",
    profileKey: "account:7",
    accountId: 7,
    rootThreadId: "root",
    parentThreadId: "root",
    childThreadId: `thread-${id}`,
    childTurnId: status === "running" ? `turn-${id}` : null,
    spawnItemId: `spawn-${id}`,
    task: `Inspect ${id}`,
    depth: 1,
    status,
    statusBeforeAttention: null,
    agentStatus: status,
    needsAttention: status === "needs-attention",
    error: status === "failed" ? "Failed" : null,
    finalResult: status === "completed" ? "Done" : null,
    startedAt: "2026-07-29T10:00:00.000Z",
    updatedAt: "2026-07-29T10:01:00.000Z",
    completedAt:
      status === "completed" || status === "failed"
        ? "2026-07-29T10:01:00.000Z"
        : null,
  };
}

function Harness({
  records,
  onInspect,
}: {
  records: SubagentRecord[];
  onInspect: (record: SubagentRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <SubagentStatus
      records={records}
      open={open}
      onOpenChange={setOpen}
      onInspect={onInspect}
    />
  );
}

describe("SubagentStatus", () => {
  it("shows persistent conversation counts and grouped inspector choices", async () => {
    const user = userEvent.setup();
    const onInspect = vi.fn();
    render(
      <Harness
        records={[record("active", "running"), record("done", "completed")]}
        onInspect={onInspect}
      />,
    );

    const toggle = screen.getByRole("button", { name: /Subagents/i });
    expect(toggle).toHaveTextContent("1 active · 1 completed");
    await user.click(toggle);

    const region = screen.getByRole("region", { name: "Subagents" });
    expect(within(region).getByText("Active")).toBeInTheDocument();
    expect(
      Array.from(
        region.querySelectorAll(".subagent-status-section-heading"),
      ).some((heading) => heading.textContent?.includes("Completed")),
    ).toBe(true);
    await user.click(
      within(region).getByRole("button", {
        name: /Inspect active.*Open inspector/i,
      }),
    );
    expect(onInspect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "active" }),
    );
    expect(screen.queryByRole("region", { name: "Subagents" })).toBeNull();
  });

  it("keeps completed records visible and surfaces attention", () => {
    const { rerender } = render(
      <Harness records={[record("done", "completed")]} onInspect={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /Subagents/i })).toHaveTextContent(
      "0 active · 1 completed",
    );

    rerender(
      <Harness
        records={[record("attention", "needs-attention")]}
        onInspect={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Subagents/i })).toHaveTextContent(
      "1 needs attention",
    );
  });
});
