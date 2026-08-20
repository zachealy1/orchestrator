import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountHandoffDialog } from "./AccountHandoffDialog";

describe("AccountHandoffDialog", () => {
  it("treats selecting the shared profile as an account handoff", () => {
    render(
      <AccountHandoffDialog
        candidate={{
          workspaceId: 1,
          chatId: 2,
          fromProfileKey: "account:3",
          fromThreadId: "thread-4",
          targetAccountId: 0,
          targetProfileKey: "default",
          fromLabel: "Personal",
          targetLabel: "Codex",
          status: "idle",
          error: null,
        }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", {
      name: "Switch account for this chat?",
    });
    expect(dialog).toHaveTextContent("Continue from Personal with Codex");
    expect(dialog.querySelector(".eyebrow")).toBeNull();
  });

  it("uses a single title when switching to another account", () => {
    render(
      <AccountHandoffDialog
        candidate={{
          workspaceId: 1,
          chatId: 2,
          fromProfileKey: "default",
          fromThreadId: "thread-4",
          targetAccountId: 3,
          targetProfileKey: "account:3",
          fromLabel: "Shared Codex account",
          targetLabel: "Personal",
          status: "idle",
          error: null,
        }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", {
      name: "Switch account for this chat?",
    });
    expect(dialog.querySelector(".eyebrow")).toBeNull();
  });
});
