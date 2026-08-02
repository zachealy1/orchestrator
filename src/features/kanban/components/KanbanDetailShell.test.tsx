import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { KanbanDetailShell } from "./KanbanDetailShell";
import type { KanbanCard, KanbanReviewData } from "./types";

const card: KanbanCard = {
  id: "card-1",
  title: "Review the Kanban implementation",
  description: "Inspect the complete result and approve it.",
  columnId: "in-review",
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
  executionState: "completed-awaiting-review",
  branches: [
    {
      repositoryId: "repo-1",
      repositoryLabel: "orchestrator",
      branch: "codex/kanban-card-1",
      targetBranch: "main",
    },
  ],
  availableActions: ["retry"],
};

const review: KanbanReviewData = {
  summary: "Implemented the board, dialogs, and review shell.",
  files: [
    {
      path: "src/features/kanban/Kanban.tsx",
      repositoryLabel: "orchestrator",
      additions: 42,
      deletions: 3,
    },
  ],
  selectedFilePath: "src/features/kanban/Kanban.tsx",
  diff: "@@ -1 +1 @@\n-old\n+new",
  canCommit: true,
  canPush: true,
  canMerge: true,
  canApprove: true,
};

describe("KanbanDetailShell", () => {
  it("keeps navigation separate from execution and routes review actions explicitly", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onAction = vi.fn();
    const onSelectReviewFile = vi.fn();
    render(
      <KanbanDetailShell
        card={card}
        conversation={<div>Conversation transcript</div>}
        review={review}
        onBack={onBack}
        onAction={onAction}
        onSelectReviewFile={onSelectReviewFile}
      />,
    );

    expect(screen.getByText("Returning to the board does not interrupt this agent.")).toBeInTheDocument();
    expect(screen.getByText("Conversation transcript")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Back to board" }));
    expect(onBack).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("tab", { name: /Review/ }));
    const reviewPanel = screen.getByRole("tabpanel", { name: /Review/ });
    expect(reviewPanel).toBeVisible();
    expect(reviewPanel.querySelector("pre")?.textContent).toBe(review.diff);
    expect(
      screen.getByText(/Git commit, push, and merge actions never do so automatically/),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /^src\/features\/kanban\/Kanban\.tsx/ }),
    );
    expect(onSelectReviewFile).toHaveBeenCalledWith(review.files[0]);

    await user.click(screen.getByRole("button", { name: "Commit" }));
    await user.click(screen.getByRole("button", { name: "Request changes" }));
    await user.click(screen.getByRole("button", { name: "Approve result" }));
    expect(onAction).toHaveBeenNthCalledWith(1, "commit", card);
    expect(onAction).toHaveBeenNthCalledWith(2, "request-changes", card);
    expect(onAction).toHaveBeenNthCalledWith(3, "approve", card);
  });

  it("only renders execution actions supplied by the card", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <KanbanDetailShell
        card={card}
        conversation={null}
        review={{ ...review, canApprove: false }}
        onBack={vi.fn()}
        onAction={onAction}
      />,
    );

    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onAction).toHaveBeenCalledWith("retry", card);
    await user.click(screen.getByRole("tab", { name: /Review/ }));
    expect(screen.getByRole("button", { name: "Approve result" })).toBeDisabled();
  });
});
