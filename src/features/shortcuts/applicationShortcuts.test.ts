import { describe, expect, it, vi } from "vitest";
import {
  APPLICATION_COMMAND_DEFINITIONS,
  applicationCommandAriaShortcut,
  filterApplicationCommands,
  findApplicationShortcut,
  formatApplicationCommandShortcut,
  type ApplicationCommand,
  type ShortcutKeyEvent,
} from "./applicationShortcuts";

function keyEvent(
  overrides: Partial<ShortcutKeyEvent> = {},
): ShortcutKeyEvent {
  return {
    altKey: false,
    code: "KeyN",
    ctrlKey: false,
    isComposing: false,
    key: "n",
    metaKey: true,
    repeat: false,
    shiftKey: false,
    ...overrides,
  };
}

function commands(): ApplicationCommand[] {
  return APPLICATION_COMMAND_DEFINITIONS.map((definition) => ({
    ...definition,
    enabled: true,
    disabledReason: null,
    run: vi.fn(),
  }));
}

describe("application shortcuts", () => {
  it.each([
    ["KeyN", "n", "new-chat"],
    ["KeyK", "k", "command-palette"],
    ["Digit1", "1", "open-chat"],
    ["Digit2", "2", "open-kanban"],
    ["Digit3", "3", "open-analytics"],
    ["Digit4", "4", "open-plugins"],
    ["Comma", ",", "open-settings"],
    ["Period", ".", "stop-visible-run"],
    ["Slash", "/", "keyboard-shortcuts"],
  ])("matches Meta+%s on macOS", (code, key, commandId) => {
    expect(findApplicationShortcut(keyEvent({ code, key }), "mac")?.id).toBe(
      commandId,
    );
  });

  it("supports Control on other platforms and a normalized key fallback", () => {
    expect(
      findApplicationShortcut(
        keyEvent({ code: "Unidentified", ctrlKey: true, metaKey: false, key: "K" }),
        "other",
      )?.id,
    ).toBe("command-palette");
  });

  it.each([
    { repeat: true },
    { isComposing: true },
    { altKey: true },
    { shiftKey: true },
    { metaKey: false },
    { ctrlKey: true },
  ])("ignores modified or non-actionable events: %o", (override) => {
    expect(findApplicationShortcut(keyEvent(override), "mac")).toBeNull();
  });

  it("formats visible and accessibility labels from the same registry", () => {
    expect(formatApplicationCommandShortcut("open-settings", "mac")).toBe(
      "⌘,",
    );
    expect(formatApplicationCommandShortcut("open-settings", "other")).toBe(
      "Ctrl+,",
    );
    expect(applicationCommandAriaShortcut("open-settings", "mac")).toBe(
      "Meta+Comma",
    );
    expect(applicationCommandAriaShortcut("open-settings", "other")).toBe(
      "Control+Comma",
    );
  });

  it("keeps the palette action-only and searches command keywords", () => {
    const available = commands();
    expect(filterApplicationCommands(available, "").map(({ id }) => id)).not.toContain(
      "command-palette",
    );
    expect(filterApplicationCommands(available, "preferences").map(({ id }) => id)).toEqual([
      "open-settings",
    ]);
    expect(filterApplicationCommands(available, "bug feedback").map(({ id }) => id)).toEqual([
      "report-bug",
    ]);
  });
});
