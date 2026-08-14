import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { KanbanArchivedView } from "./KanbanArchivedView";
import { KanbanToolbar } from "./KanbanToolbar";
import { KanbanTransitionDialog } from "./KanbanTransitionDialog";
import type { KanbanCard } from "./types";

const card: KanbanCard = {
  id: "card-1",
  chatId: 11,
  hasStartedTurn: true,
  title: "Archived workflow",
  description: "A preserved card with review artifacts",
  columnId: "done",
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
  executionState: "stopped",
  archivedAt: "2026-08-01T12:00:00.000Z",
  branches: [
    {
      repositoryId: "repo-1",
      repositoryLabel: "orchestrator",
      branch: "codex/card-1",
    },
  ],
};

describe("Kanban controls", () => {
  it("updates search, filters, grouping, and archived mode from the toolbar", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    const onFiltersChange = vi.fn();
    const onGroupByChange = vi.fn();
    const onToggleArchived = vi.fn();

    render(
      <KanbanToolbar
        search="review"
        filters={{ state: ["running"] }}
        filterGroups={[
          {
            id: "state",
            label: "State",
            options: [
              { value: "running", label: "Running", count: 2 },
              { value: "failed", label: "Failed", count: 1 },
            ],
          },
        ]}
        groupBy="none"
        visibleCardCount={2}
        totalCardCount={7}
        onSearchChange={onSearchChange}
        onFiltersChange={onFiltersChange}
        onGroupByChange={onGroupByChange}
        onToggleArchived={onToggleArchived}
      />,
    );

    expect(screen.getByText("2 of 7 cards")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search cards" }), {
      target: { value: "reviewed" },
    });
    expect(onSearchChange).toHaveBeenLastCalledWith("reviewed");

    const filterTrigger = screen.getByRole("button", { name: /^Filters/ });
    await user.click(filterTrigger);
    await user.click(screen.getByRole("checkbox", { name: /^Failed/ }));
    expect(onFiltersChange).toHaveBeenCalledWith({
      state: ["running", "failed"],
    });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Filter cards" })).not.toBeInTheDocument();
    await waitFor(() => expect(filterTrigger).toHaveFocus());

    await user.click(filterTrigger);
    expect(screen.getByRole("dialog", { name: "Filter cards" })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: "Filter cards" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Group cards by" }));
    await user.click(screen.getByRole("option", { name: "Repository" }));
    expect(onGroupByChange).toHaveBeenCalledWith("repository");

    const archivedButton = screen.getByRole("button", {
      name: "Archived cards",
    });
    expect(archivedButton).toHaveAttribute("title", "Archived cards");
    expect(archivedButton).not.toHaveTextContent("Archived");
    await user.click(archivedButton);
    expect(onToggleArchived).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "New card" })).not.toBeInTheDocument();
  });

  it("uses progressive cleanup controls for card deletion", async () => {
    const user = userEvent.setup();
    const onCleanupOptionChange = vi.fn();
    const onConfirm = vi.fn();
    render(
      <KanbanTransitionDialog
        open
        kind="delete"
        card={card}
        cleanupOptions={[
          {
            id: "remove-worktree",
            label: "Remove clean worktree",
            description: "The worktree is clean and can be recreated from the branch.",
            selected: false,
          },
          {
            id: "delete-branch",
            label: "Delete branch",
            description: "Delete the retained card branch.",
            selected: false,
            destructive: true,
          },
        ]}
        onCleanupOptionChange={onCleanupOptionChange}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const dialog = screen.getByRole("alertdialog", {
      name: "Delete Archived workflow?",
    });
    expect(dialog).toHaveTextContent(
      "The card will be removed. Worktrees and branches stay on disk.",
    );
    expect(dialog).not.toHaveTextContent("A preserved card with review artifacts");
    expect(screen.getByText("Cleanup options")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(),
    );
    const closeButton = screen.getByRole("button", { name: "Close confirmation" });
    const confirmButton = screen.getByRole("button", { name: "Delete card" });
    expect(confirmButton).not.toHaveFocus();
    closeButton.focus();
    await user.tab({ shift: true });
    expect(confirmButton).toHaveFocus();
    await user.tab();
    expect(closeButton).toHaveFocus();
    await user.click(screen.getByRole("checkbox", { name: /Delete branch/ }));
    expect(onCleanupOptionChange).toHaveBeenCalledWith("delete-branch", true);
    await user.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("uses the archive-specific layout and borderless icon actions", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <KanbanTransitionDialog
        open
        kind="archive"
        card={card}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    const dialog = screen.getByRole("alertdialog", {
      name: "Archive this card?",
    });
    expect(dialog).toHaveClass("is-archive");
    expect(dialog.querySelector(".eyebrow")).not.toBeInTheDocument();
    expect(
      dialog.querySelector(".kanban-archive-transition-heading-icon"),
    ).toBeInTheDocument();

    const cardSummary = dialog.querySelector(".kanban-archive-transition-card");
    expect(cardSummary).toHaveTextContent("Archived workflow");
    expect(cardSummary).toHaveTextContent("A preserved card with review artifacts");

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    const archiveButton = screen.getByRole("button", { name: "Archive card" });
    expect(cancelButton).toHaveClass("native-plan-icon-action", "cancel");
    expect(cancelButton).toHaveAttribute("data-tooltip", "Cancel");
    expect(cancelButton).toHaveTextContent("");
    expect(archiveButton).toHaveClass("native-plan-icon-action", "implement");
    expect(archiveButton).toHaveAttribute("data-tooltip", "Archive card");
    expect(archiveButton).toHaveTextContent("");
    await waitFor(() => expect(archiveButton).toHaveFocus());

    await user.click(cancelButton);
    await user.click(archiveButton);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("groups archived cards into swim lanes and exposes restore/delete actions", async () => {
    const user = userEvent.setup();
    const onRestoreCard = vi.fn();
    const onDeleteCard = vi.fn();
    render(
      <KanbanArchivedView
        cards={[card]}
        onRestoreCard={onRestoreCard}
        onDeleteCard={onDeleteCard}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Archived Kanban board" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "To do" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "In progress" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "In review" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Done" })).toBeInTheDocument();
    expect(screen.getByText("Archived workflow")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Restore Archived workflow to board" }),
    );
    await user.click(screen.getByRole("button", { name: "Actions for Archived workflow" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete card" }));
    expect(onRestoreCard).toHaveBeenCalledWith(card);
    expect(onDeleteCard).toHaveBeenCalledWith(card);

    expect(screen.queryByText("Preserved workflows")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });
});
