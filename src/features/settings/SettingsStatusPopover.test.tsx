import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RefreshCw } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import {
  SettingsStatusPopover,
  SettingsStatusProvider,
  type SettingsStatusDetails,
} from "./SettingsStatusPopover";

const details: SettingsStatusDetails = {
  title: "Browser unavailable",
  description: "Runtime did not start.",
  actions: [{ label: "Check again", icon: RefreshCw, onActivate: vi.fn() }],
};
function Fixture({
  warning = details,
  scope = 1,
}: {
  warning?: SettingsStatusDetails | null;
  scope?: number;
}) {
  return (
    <SettingsStatusProvider scope={scope}>
      <button>Before</button>
      <SettingsStatusPopover
        status={
          warning
            ? { label: "Unavailable", tone: "negative" }
            : { label: "Available", tone: "positive" }
        }
        details={warning}
      />
      <button>After</button>
      <SettingsStatusPopover
        status={{ label: "Denied", tone: "negative" }}
        details={{
          title: "Notifications denied",
          description: "Enable notifications.",
        }}
      />
    </SettingsStatusProvider>
  );
}

describe("Settings status interaction", () => {
  it.each(["{Enter}", " "])(
    "opens only on activation with %s, labels a non-modal dialog and restores focus on Escape",
    async (key) => {
      const user = userEvent.setup();
      render(<Fixture />);
      const trigger = screen.getByRole("button", {
        name: "Browser unavailable. Show details",
      });
      expect(screen.queryByText("Runtime did not start.")).toBeNull();
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      trigger.focus();
      await user.keyboard(key);
      const dialog = screen.getByRole("dialog", {
        name: "Browser unavailable",
      });
      expect(dialog).toHaveAttribute("aria-modal", "false");
      expect(dialog).toHaveAccessibleDescription("Runtime did not start.");
      expect(dialog).toHaveFocus();
      expect(trigger).toHaveAttribute("aria-controls", dialog.id);
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(trigger).toHaveFocus();
    },
  );

  it("tabs through recovery actions and then continues after the badge without trapping focus", async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    await user.click(
      screen.getByRole("button", { name: "Browser unavailable. Show details" }),
    );
    await user.tab();
    expect(screen.getByRole("button", { name: "Check again" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Shift+Tabs back to the trigger from the panel and its first action", async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    const trigger = screen.getByRole("button", {
      name: "Browser unavailable. Show details",
    });
    await user.click(trigger);
    await user.tab({ shift: true });
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.keyboard("{Enter}");
    await user.tab();
    await user.tab({ shift: true });
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("continues tabbing after a details-only badge", async () => {
    const user = userEvent.setup();
    render(<Fixture warning={{ ...details, actions: [] }} />);
    await user.click(
      screen.getByRole("button", { name: "Browser unavailable. Show details" }),
    );
    await user.tab();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("toggles, switches panels, and dismisses on outside click or focus without stealing destination focus", async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    const browser = screen.getByRole("button", {
      name: "Browser unavailable. Show details",
    });
    await user.click(browser);
    await user.click(browser);
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(browser);
    await user.click(
      screen.getByRole("button", {
        name: "Notifications denied. Show details",
      }),
    );
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "Notifications denied",
    );
    expect(browser).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("button", { name: "After" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
    await user.click(browser);
    act(() => screen.getByRole("button", { name: "Before" }).focus());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Before" })).toHaveFocus();
  });

  it("updates diagnostics while open without changing the polite status announcement", () => {
    const { rerender } = render(<Fixture />);
    fireEvent.click(
      screen.getByRole("button", { name: "Browser unavailable. Show details" }),
    );
    const status = screen.getByRole("status", { name: "Unavailable" });
    const changed = vi.fn();
    const observer = new MutationObserver(changed);
    observer.observe(status, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    rerender(
      <Fixture
        warning={{ ...details, description: "New runtime diagnostic." }}
      />,
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "New runtime diagnostic.",
    );
    expect(screen.queryByText("Runtime did not start.")).toBeNull();
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });

  it("closes on recovery, resolution, account change and unmount, and never reopens automatically", () => {
    const refresh = vi.fn();
    const { rerender, unmount } = render(
      <Fixture
        warning={{
          ...details,
          actions: [
            { label: "Check again", icon: RefreshCw, onActivate: refresh },
          ],
        }}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: "Browser unavailable. Show details",
    });
    fireEvent.click(trigger);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Check again",
      }),
    );
    expect(refresh).toHaveBeenCalledOnce();
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<Fixture />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(trigger);
    rerender(<Fixture warning={null} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Show details/ }),
    ).toHaveAccessibleName("Notifications denied. Show details");
    rerender(<Fixture />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Browser unavailable. Show details" }),
    );
    rerender(<Fixture scope={2} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<Fixture scope={1} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Browser unavailable. Show details" }),
    );
    unmount();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
