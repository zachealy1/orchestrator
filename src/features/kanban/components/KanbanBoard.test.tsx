import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { KanbanBoard, activeAttemptRequiresStop } from "./KanbanBoard";
import type { KanbanCard, KanbanColumn } from "./types";

function card(overrides: Partial<KanbanCard> = {}): KanbanCard {
  return {
    id: "card-1",
    chatId: 11,
    hasStartedTurn: false,
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
    submissionMode: "plan",
    executionState: "idle",
    availableActions: ["edit", "duplicate"],
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
    const onCardAction = vi.fn();

    render(
      <KanbanBoard
        columns={columns()}
        onMoveCard={vi.fn()}
        onCardAction={onCardAction}
      />,
    );

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(["To do", "In progress"]);
    const todo = screen.getByRole("region", { name: "To do" });
    expect(
      within(todo)
        .getAllByRole("article")
        .map((article) => article.querySelector("strong")?.textContent),
    ).toEqual(["First card", "Second card"]);

    const firstCard = within(todo).getByRole("article", { name: /First card/ });
    expect(within(firstCard).getByText("orchestrator")).toHaveClass(
      "kanban-card-metadata-repository",
    );
    expect(within(firstCard).getByText("Default account")).toHaveClass(
      "kanban-card-metadata-account",
    );
    expect(within(firstCard).getByText("GPT-5")).toHaveClass(
      "kanban-card-metadata-model",
    );
    expect(within(firstCard).getByText("high")).toHaveClass(
      "kanban-card-metadata-reasoning",
    );
    expect(within(firstCard).getByLabelText("Plan mode")).toBeInTheDocument();
    expect(
      within(firstCard).queryByRole("button", {
        name: "View details for First card",
      }),
    ).not.toBeInTheDocument();
    expect(within(firstCard).getByText("Plan")).toBeInTheDocument();
    await user.click(within(firstCard).getByText("First card"));
    expect(onCardAction).not.toHaveBeenCalled();

    await user.click(within(firstCard).getByLabelText("Actions for First card"));
    await user.click(screen.getByRole("menuitem", { name: "Edit card" }));
    expect(onCardAction).toHaveBeenCalledWith(
      "edit",
      expect.objectContaining({ id: "card-first" }),
    );

    expect(
      within(screen.getByRole("region", { name: "In progress" })).getByText(
        "Drop cards here",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create card in/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Move .* column/ }),
    ).not.toBeInTheDocument();
  });

  it("hides repository pills for multi-repository workspace boards", () => {
    render(
      <KanbanBoard
        columns={columns()}
        showRepositoryMetadata={false}
        onMoveCard={vi.fn()}
      />,
    );

    const firstCard = screen.getByRole("article", { name: /First card/ });
    expect(within(firstCard).queryByText("orchestrator")).not.toBeInTheDocument();
    expect(within(firstCard).getByText("Default account")).toBeInTheDocument();
  });

  it("opens only cards whose first Codex turn was accepted", async () => {
    const user = userEvent.setup();
    const onOpenConversation = vi.fn();
    const startedColumns = columns().map((column) => ({
      ...column,
      cards: column.cards.map((item) =>
        item.id === "card-first"
          ? { ...item, hasStartedTurn: true }
          : item,
      ),
    }));

    render(
      <KanbanBoard
        columns={startedColumns}
        onMoveCard={vi.fn()}
        onOpenConversation={onOpenConversation}
      />,
    );

    const openButton = screen.getByRole("button", {
      name: "Open conversation for First card",
    });
    await user.click(openButton);
    expect(onOpenConversation).toHaveBeenCalledWith(
      expect.objectContaining({ id: "card-first", chatId: 11 }),
    );

    onOpenConversation.mockClear();
    openButton.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onOpenConversation).toHaveBeenCalledTimes(2);

    await user.click(
      screen.getByRole("button", { name: "Actions for First card" }),
    );
    expect(onOpenConversation).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole("button", {
        name: "Open conversation for Second card",
      }),
    ).not.toBeInTheDocument();
  });

  it("dismisses the portalled card menu consistently", async () => {
    const user = userEvent.setup();
    const onCardAction = vi.fn();
    render(
      <KanbanBoard
        columns={columns()}
        onMoveCard={vi.fn()}
        onCardAction={onCardAction}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Actions for First card",
    });
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const editAction = screen.getByRole("menuitem", { name: "Edit card" });
    const duplicateAction = screen.getByRole("menuitem", {
      name: "Duplicate card",
    });
    await waitFor(() => expect(editAction).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    expect(duplicateAction).toHaveFocus();
    await user.keyboard("{Home}");
    expect(editAction).toHaveFocus();
    await user.keyboard("{End}");
    expect(duplicateAction).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Edit card" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(onCardAction).toHaveBeenCalledWith(
      "edit",
      expect.objectContaining({ id: "card-first" }),
    );
  });

  it("provides keyboard-focusable card drag handles and disables every drag surface", () => {
    const { rerender } = render(
      <KanbanBoard
        columns={columns()}
        onMoveCard={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Move First card" })).toBeEnabled();

    rerender(
      <KanbanBoard
        columns={columns()}
        disabled
        onMoveCard={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Move First card" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Actions for First card" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("In progress is empty")).toHaveTextContent(
      "Drop cards here",
    );
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
