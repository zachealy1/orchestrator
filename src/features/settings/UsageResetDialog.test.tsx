import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { UsageResetDialog } from "./UsageResetDialog";
import { usageAccounts } from "../../test/usageLimitsFixture";
import type { UsageResetConfirmation } from "../analytics/useCodexUsageResetController";

const confirmation: UsageResetConfirmation = {
  account: usageAccounts[0],
  idempotencyKey: "attempt",
  status: "confirming",
  error: null,
};

describe("usage reset confirmation", () => {
  it("matches existing popups, traps focus, cancels with Escape, and restores trigger focus", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open reset</button>
          {open && (
            <UsageResetDialog
              confirmation={confirmation}
              canConfirm
              onCancel={() => setOpen(false)}
              onConfirm={vi.fn()}
            />
          )}
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open reset" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Use one usage reset?" });
    expect(dialog).toHaveClass("confirmation-dialog");
    expect(dialog.parentElement).toHaveClass("modal-backdrop");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription(
      "This uses one earned reset for Personal to reset eligible Codex usage limits.",
    );
    const cancel = screen.getByRole("button", { name: "Cancel reset" });
    const confirm = screen.getByRole("button", { name: "Use 1 reset" });
    expect(confirm.parentElement).toHaveClass("confirmation-actions");
    expect(confirm).toHaveClass("native-plan-icon-action", "implement");
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("cancels only on the backdrop and blocks every exit while submitting", async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const view = render(
      <UsageResetDialog
        confirmation={confirmation}
        canConfirm
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.mouseDown(dialog);
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.mouseDown(dialog.parentElement!);
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Use 1 reset" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    view.rerender(
      <UsageResetDialog
        confirmation={{ ...confirmation, status: "submitting" }}
        canConfirm={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByRole("dialog")).toHaveFocus();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true");
    fireEvent.mouseDown(dialog.parentElement!);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel reset" }));
    fireEvent.click(screen.getByRole("button", { name: "Applying reset" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => {
      view.unmount();
    });
  });

  it("announces errors and labels the idempotent retry", () => {
    render(
      <UsageResetDialog
        confirmation={{
          ...confirmation,
          status: "error",
          error: "Connection lost. Retry the same request.",
        }}
        canConfirm
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Connection lost");
    expect(screen.getByRole("button", { name: "Retry reset" })).toBeEnabled();
  });
  it("returns focus to Refresh when the last reset leaves the trigger disabled", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      const [available, setAvailable] = useState(true);
      return <section className="settings-account-usage">
        <button aria-label="Refresh account usage">Refresh</button>
        <button disabled={!available} onClick={() => setOpen(true)}>Open reset</button>
        {open && <UsageResetDialog confirmation={confirmation} canConfirm onCancel={() => setOpen(false)} onConfirm={() => { setAvailable(false); setOpen(false); }} />}
      </section>;
    }
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open reset" }));
    await user.click(screen.getByRole("button", { name: "Use 1 reset" }));
    expect(screen.getByRole("button", { name: "Open reset" })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh account usage" })).toHaveFocus());
  });

});
