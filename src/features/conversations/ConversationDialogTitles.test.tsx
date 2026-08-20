import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatDeleteDialog } from "./ChatDeleteDialog";
import { ChatRenameDialog } from "./ChatRenameDialog";
import { ChatWorktreeContinuationDialog } from "./ChatWorktreeContinuationDialog";

const chat = {
  id: 7,
  title: "Popup consistency",
  continuation_kind: null,
} as any;

function expectSingleTitle(name: string) {
  const dialog = screen.getByRole("dialog", { name });
  expect(dialog.querySelector(".eyebrow")).toBeNull();
  expect(dialog.querySelectorAll("h2")).toHaveLength(1);
}

describe("conversation dialog titles", () => {
  it("uses one visible title for chat removal", () => {
    render(
      <ChatDeleteDialog chat={chat} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );

    expectSingleTitle("Remove chat?");
  });

  it("uses one visible title for chat renaming", () => {
    render(
      <ChatRenameDialog
        chat={chat}
        title="Popup consistency"
        pending={false}
        error={null}
        onTitleChange={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expectSingleTitle("Rename chat");
  });

  it("uses one visible title for worktree continuation", () => {
    render(
      <ChatWorktreeContinuationDialog
        title="Popup consistency"
        repositories={[
          {
            path: "/workspace/orchestrator",
            relativePath: "orchestrator",
            label: "orchestrator",
            branch: "main",
          },
        ]}
        includeDirtyChanges={false}
        includeDirtyDisabled={false}
        pending={false}
        error={null}
        onIncludeDirtyChanges={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expectSingleTitle("Continue in new worktree");
  });
});
