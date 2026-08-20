import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DefaultBrowserTabDialog } from "./DefaultBrowserTabDialog";

describe("DefaultBrowserTabDialog", () => {
  it("keeps tab metadata user-facing and attaches the selected tab", () => {
    const onAttach = vi.fn();
    render(
      <DefaultBrowserTabDialog
        tabs={[
          {
            id: 42,
            title: "Signed-in dashboard",
            origin: "https://example.com",
            active: true,
            inCurrentGroup: false,
          },
        ]}
        loading={false}
        attachingTabId={null}
        error={null}
        onRefresh={vi.fn()}
        onAttach={onAttach}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Attach a browser tab" });
    expect(dialog.querySelector(".eyebrow")).toBeNull();
    expect(screen.getByText("Signed-in dashboard")).toBeInTheDocument();
    expect(screen.getByText("https://example.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Attach Signed-in dashboard" }));
    expect(onAttach).toHaveBeenCalledWith(42);
  });

  it("does not dismiss a busy attachment flow", () => {
    const onClose = vi.fn();
    render(
      <DefaultBrowserTabDialog
        tabs={[]}
        loading={false}
        attachingTabId={42}
        error={null}
        onRefresh={vi.fn()}
        onAttach={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Close tab selection" })).toBeDisabled();
  });
});
