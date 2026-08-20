import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountHandoffDialog } from "./AccountHandoffDialog";

describe("AccountHandoffDialog", () => {
  it("uses a single title when continuing in the shared Codex account", () => {
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

    expect(
      screen.getByRole("dialog", { name: "Continue this chat in codex?" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Codex continuation")).not.toBeInTheDocument();
    expect(document.querySelector(".confirmation-dialog .eyebrow")).toBeNull();
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
