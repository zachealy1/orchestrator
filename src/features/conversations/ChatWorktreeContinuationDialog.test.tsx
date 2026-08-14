import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatWorktreeContinuationDialog } from "./ChatWorktreeContinuationDialog";

describe("ChatWorktreeContinuationDialog", () => {
  it("uses the native Plan radio treatment for uncommitted changes", () => {
    const onIncludeDirtyChanges = vi.fn();
    render(
      <ChatWorktreeContinuationDialog
        title="Source chat"
        repositories={[
          {
            path: "/workspace/repository",
            relativePath: "repository",
            label: "repository",
            branch: "main",
          },
        ]}
        includeDirtyChanges
        includeDirtyDisabled={false}
        pending={false}
        error={null}
        onIncludeDirtyChanges={onIncludeDirtyChanges}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const input = screen.getByRole("checkbox", {
      name: /include current uncommitted changes/i,
    });
    const option = input.closest("label");
    expect(option).toHaveClass(
      "chat-worktree-dirty-option",
      "native-user-input-option",
      "selected",
    );
    expect(option?.querySelector(".native-user-input-radio")).not.toBeNull();

    fireEvent.click(input);
    expect(onIncludeDirtyChanges).toHaveBeenCalledWith(false);
  });
});
