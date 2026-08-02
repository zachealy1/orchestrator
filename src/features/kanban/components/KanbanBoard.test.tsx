import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { KanbanBoard, activeAttemptRequiresStop } from "./KanbanBoard";
import type { KanbanCard, KanbanColumn } from "./types";

function card(overrides: Partial<KanbanCard> = {}): KanbanCard {
  return {
    id: "card-1",
    title: "Add Kanban mode",
    description: "Build the board experience",
    columnId: "todo",
    position: 0,
    repositoryScope: "selected",
    repositories: [
      { id: "repo-1", label: "orchestrator", path: "/workspace/orchestrator" },
    ],
    accountId: null,
    accountLabel: "Default account",
    accessMode: "ask-for-approval",
    model: "gpt-5",
    modelLabel: "GPT-5",
    reasoningLevel: "high",
    executionState: "idle",
    availableActions: ["open", "edit", "duplicate"],
    ...overrides,
  };
}

function columns(): KanbanColumn[] {
  return [
    {
      id: "in-progress",
      title: "In progress",
      position: 1,
      cards: [],
    },
    {
      id: "todo",
      title: "To do",
      position: 0,
      cards: [
        card({ id: "card-later", title: "Second card", position: 2 }),
        card({ id: "card-first", title: "First card", position: 0 }),
      ],
    },
  ];
}

describe("KanbanBoard", () => {
  it("orders columns and cards, and exposes scoped card controls", async () => {
    const user = userEvent.setup();
    const onOpenCard = vi.fn();
    const onCardAction = vi.fn();
    const onCreateCard = vi.fn();

    render(
      <KanbanBoard
        columns={columns()}
        onMoveCard={vi.fn()}
        onReorderColumns={vi.fn()}
        onOpenCard={onOpenCard}
        onCardAction={onCardAction}
        onCreateCard={onCreateCard}
      />,
    );

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(["To do", "In progress"]);
    const todo = screen.getByRole("region", { name: "To do" });
    expect(
      within(todo)
        .getAllByRole("button")
        .filter((button) => button.classList.contains("kanban-card-open"))
        .map((button) => button.textContent),
    ).toEqual(["First cardBuild the board experience", "Second cardBuild the board experience"]);

    await user.click(within(todo).getByRole("button", { name: /^First card/ }));
    expect(onOpenCard).toHaveBeenCalledWith(
      expect.objectContaining({ id: "card-first" }),
    );

    const firstCard = within(todo).getByRole("article", { name: /First card/ });
    await user.click(within(firstCard).getByLabelText("Actions for First card"));
    await user.click(within(firstCard).getByRole("menuitem", { name: "Edit card" }));
    expect(onCardAction).toHaveBeenCalledWith(
      "edit",
      expect.objectContaining({ id: "card-first" }),
    );

    await user.click(screen.getByRole("button", { name: "Create card in In progress" }));
    expect(onCreateCard).toHaveBeenCalledWith("in-progress");
  });

  it("provides keyboard-focusable drag handles and disables every drag surface", () => {
    const { rerender } = render(
      <KanbanBoard
        columns={columns()}
        onMoveCard={vi.fn()}
        onReorderColumns={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Move First card" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Move To do column" })).toBeEnabled();

    rerender(
      <KanbanBoard
        columns={columns()}
        disabled
        onMoveCard={vi.fn()}
        onReorderColumns={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Move First card" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move To do column" })).toBeDisabled();
  });

  it("flags stop-and-move for active attempts only", () => {
    expect(activeAttemptRequiresStop(card({ executionState: "running" }))).toBe(true);
    expect(
      activeAttemptRequiresStop(card({ executionState: "waiting-for-approval" })),
    ).toBe(true);
    expect(activeAttemptRequiresStop(card({ executionState: "idle" }))).toBe(false);
    expect(activeAttemptRequiresStop(card({ executionState: "failed" }))).toBe(false);
    expect(
      activeAttemptRequiresStop(card({ executionState: "completed-awaiting-review" })),
    ).toBe(false);
  });
});
