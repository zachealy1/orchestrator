import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApplicationCommandPalette } from "./ApplicationCommandPalette";
import { KeyboardShortcutsDialog } from "./KeyboardShortcutsDialog";
import {
  APPLICATION_COMMAND_DEFINITIONS,
  type ApplicationCommand,
} from "../features/shortcuts/applicationShortcuts";

function commands(overrides: Partial<Record<ApplicationCommand["id"], boolean>> = {}) {
  return APPLICATION_COMMAND_DEFINITIONS.map((definition) => ({
    ...definition,
    enabled: overrides[definition.id] ?? true,
    disabledReason:
      overrides[definition.id] === false ? "Unavailable in this context" : null,
    run: vi.fn(),
  }));
}

describe("application shortcut overlays", () => {
  it("searches and executes a command from the command palette", async () => {
    const user = userEvent.setup();
    const available = commands();
    render(
      <ApplicationCommandPalette
        commands={available}
        platform="mac"
        onClose={vi.fn()}
      />,
    );

    const search = screen.getByRole("combobox", { name: "Search commands" });
    await waitFor(() => expect(search).toHaveFocus());
    await user.type(search, "preferences");
    const option = screen.getByRole("option", { name: /Open Settings/ });
    expect(option).toHaveTextContent("⌘,");
    await user.keyboard("{Enter}");

    const settings = available.find(({ id }) => id === "open-settings");
    expect(settings?.run).toHaveBeenCalledTimes(1);
  });

  it("skips disabled commands during keyboard navigation", async () => {
    const user = userEvent.setup();
    const available = commands({ "sidebar-chats": false });
    render(
      <ApplicationCommandPalette
        commands={available}
        platform="mac"
        onClose={vi.fn()}
      />,
    );

    const search = screen.getByRole("combobox", { name: "Search commands" });
    await waitFor(() => expect(search).toHaveFocus());
    expect(
      screen.getByRole("option", { name: /Sidebar: Chats/ }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("option", { name: /Sidebar: Files/ }),
    ).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");

    const files = available.find(({ id }) => id === "sidebar-files");
    expect(files?.run).toHaveBeenCalledTimes(1);
  });

  it("dismisses the palette with Escape", () => {
    const onClose = vi.fn();
    render(
      <ApplicationCommandPalette
        commands={commands()}
        platform="mac"
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(
      screen.getByRole("dialog", { name: "Command palette" }),
      { key: "Escape" },
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("lists every registered shortcut with platform-appropriate labels", () => {
    render(<KeyboardShortcutsDialog platform="other" onClose={vi.fn()} />);
    expect(
      screen.getByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ctrl+N")).toBeInTheDocument();
    expect(screen.getByText("Ctrl+.")).toBeInTheDocument();
    expect(screen.getByText("Ctrl+/")).toBeInTheDocument();
    for (const [index, label] of [
      "Sidebar: Chats", "Sidebar: Files", "Sidebar: Priority",
      "Open Chat", "Open Kanban", "Open Analytics", "Open Plugins",
    ].entries()) {
      expect(screen.getByText(label).closest(".keyboard-shortcut-row"))
        .toHaveTextContent(`Ctrl+${index + 1}`);
    }
    expect(screen.queryByText("Report a bug")).not.toBeInTheDocument();
  });
});
