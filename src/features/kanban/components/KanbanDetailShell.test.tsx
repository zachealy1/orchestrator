import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KanbanDetailShell } from "./KanbanDetailShell";
import type { KanbanCard, KanbanReviewData } from "./types";

const codePreviewMock = vi.hoisted(() => vi.fn());

vi.mock("../../../components/CodePreview", () => ({
  CodePreview: (props: {
    path: string;
    content: string;
    resolvedTheme: "light" | "dark";
    languageOverride?: string;
  }) => {
    codePreviewMock(props);
    return <pre data-path={props.path}>{props.content}</pre>;
  },
}));

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
  submissionMode: "goal",
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
      status: "modified",
      additions: 42,
      deletions: 3,
    },
  ],
  selectedFilePath: "src/features/kanban/Kanban.tsx",
  diff: "@@ -1 +1 @@\n-old\n+new",
  canCommit: true,
  canPush: true,
  canMerge: true,
  canRequestChanges: true,
  canApprove: true,
};

beforeEach(() => codePreviewMock.mockClear());

describe("KanbanDetailShell", () => {
  it("keeps navigation separate from execution and routes review actions explicitly", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onAction = vi.fn();
    const onSelectReviewFile = vi.fn();
    render(
      <KanbanDetailShell
        card={card}
        review={review}
        resolvedTheme="dark"
        onBack={onBack}
        onAction={onAction}
        onSelectReviewFile={onSelectReviewFile}
      />,
    );

    expect(screen.getByText("Returning to the board does not interrupt this agent.")).toBeInTheDocument();
    expect(screen.getByText("Goal mode")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Back to board" }));
    expect(onBack).toHaveBeenCalledOnce();

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    const reviewPanel = screen.getByLabelText("Review");
    expect(reviewPanel).toBeVisible();
    expect(reviewPanel.querySelector("pre")?.textContent).toBe(review.diff);
    expect(codePreviewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "src/features/kanban/Kanban.tsx",
        resolvedTheme: "dark",
        languageOverride: "diff",
      }),
    );
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
        review={{ ...review, canApprove: false }}
        resolvedTheme="light"
        onBack={vi.fn()}
        onAction={onAction}
      />,
    );

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open in Chat" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onAction).toHaveBeenCalledWith("retry", card);
    expect(screen.getByRole("button", { name: "Approve result" })).toBeDisabled();
  });

  it("shows a review loading state without rendering stale diff content", () => {
    const props = {
      card,
      conversation: null,
      review: { ...review, gitBusy: true },
      resolvedTheme: "dark" as const,
      initialTab: "review" as const,
      onBack: vi.fn(),
      onAction: vi.fn(),
    };
    const { rerender } = render(<KanbanDetailShell {...props} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading file changes…",
    );
    expect(screen.queryByText(review.diff ?? "")).not.toBeInTheDocument();
    expect(codePreviewMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Commit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Approve result" })).toBeDisabled();

    rerender(
      <KanbanDetailShell
        {...props}
        review={{ ...review, gitBusy: false }}
      />,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(codePreviewMock).toHaveBeenCalledWith(
      expect.objectContaining({ resolvedTheme: "dark" }),
    );
  });
});
