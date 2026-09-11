import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { emptyRunView } from "../lib/codexEventReducer";
import { renderHistoricalMarkdown } from "../lib/historicalMarkdown";
import { markdownTableFixture } from "../test/markdownTableFixture";
import { renderWithAppServices } from "../test/renderWithAppServices";
import { TaskChatTurn, type TaskChatEntry } from "./TaskChatTurn";

function entry(text = markdownTableFixture): TaskChatEntry {
  return {
    clientId: "table-turn",
    workspaceId: 1,
    chatId: 1,
    turnIndex: 1,
    runId: 1,
    taskId: 1,
    prompt: "Compare the results",
    submittedAt: "2026-09-11T12:00:00Z",
    status: "completed",
    runView: { ...emptyRunView, status: "completed", finalMessage: text },
  };
}

function turn(value: TaskChatEntry, onOpenTranscriptLink = vi.fn(() => true)) {
  return (
    <TaskChatTurn
      model={{ entry: value, editable: false, editing: false, editingPrompt: "" }}
      actions={{
        onEditingPromptChange: vi.fn(),
        onSubmitEdit: vi.fn(),
        onCancelEdit: vi.fn(),
        onStartEdit: vi.fn(),
        onResolveRequest: vi.fn(),
        onOpenTranscriptLink,
      }}
    />
  );
}

function checkTable() {
  const scroller = screen.getByRole("region", { name: "Table" });
  expect(scroller).toHaveAttribute("tabindex", "0");
  const table = within(scroller).getByRole("table");
  expect(table).toHaveClass("markdown-table");
  expect(within(table).getAllByRole("columnheader")).toHaveLength(4);
  expect(within(table).getAllByRole("row")).toHaveLength(3);
  expect(within(table).getAllByRole("cell")).toHaveLength(8);
  expect(
    within(table).getByRole("cell", { name: "a|b" }).firstChild?.nodeName,
  ).toBe("CODE");
  expect(within(table).getByText("Ready").tagName).toBe("STRONG");
  const alignment = (cell: HTMLElement) =>
    cell.style.textAlign || cell.getAttribute("align");
  expect(
    within(table).getAllByRole("columnheader").slice(0, 3).map(alignment),
  ).toEqual(["left", "center", "right"]);
  expect(
    within(table).getAllByRole("cell").slice(0, 3).map(alignment),
  ).toEqual(["left", "center", "right"]);
  return table;
}

describe("agent Markdown tables", () => {
  it.each(["completed", "history"])("preserves table structure, alignment and file links in %s replies", async (mode) => {
    const value = entry();
    if (mode === "history") {
      value.preparedSummary = {
        kind: "html",
        sourceHash: "fixture",
        html: await renderHistoricalMarkdown(markdownTableFixture),
      };
    }
    const open = vi.fn(() => true);
    renderWithAppServices(turn(value, open));
    const table = checkTable();
    fireEvent.click(within(table).getByRole("link", { name: "Source" }));
    expect(open).toHaveBeenCalledWith("/repo/src/App.tsx");
  });

  it("keeps one table and scroll container as a partial row streams and completes", () => {
    const live = entry(
      markdownTableFixture.replace("| Second | Pending | 3 | |", "| Second | Pend"),
    );
    live.status = "running";
    live.runView = { ...live.runView, status: "running" };
    const result = renderWithAppServices(turn(live));
    const scroller = screen.getByRole("region", { name: "Table" });
    const table = screen.getByRole("table");
    expect(within(table).getByRole("cell", { name: "Pend" })).toBeInTheDocument();
    expect(within(table).getAllByRole("cell")).toHaveLength(8);

    result.rerender(turn(entry()));
    expect(checkTable()).toBe(table);
    expect(screen.getByRole("region", { name: "Table" })).toBe(scroller);
    expect(screen.queryByText("Pend", { exact: true })).not.toBeInTheDocument();
  });

  it("formats tables in agent commentary", () => {
    const value = entry("");
    value.status = "running";
    value.runView = {
      ...value.runView,
      status: "running",
      streamEvents: [
        {
          id: "commentary",
          kind: "message",
          text: markdownTableFixture,
          timestamp: "2026-09-11T12:00:00Z",
        },
      ],
    };
    renderWithAppServices(turn(value));
    expect(checkTable().closest(".stream-message")).not.toBeNull();
  });
});
