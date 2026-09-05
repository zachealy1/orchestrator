import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMocks,
  prepareDefaults,
  prepareSignedInRun,
  renderApp,
  setWindowWidth,
  startMockRun,
} from "./test/appRuntimeHarness";

const mocks = getMocks();
const originalNavigatorPlatform = window.navigator.platform;

async function pressApplicationShortcut(
  code: string,
  key: string,
  overrides: Partial<KeyboardEventInit> = {},
) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    code,
    key,
    metaKey: true,
    ...overrides,
  });
  await act(async () => {
    window.dispatchEvent(event);
    await Promise.resolve();
  });
  return event;
}

function workspaceSwitcher() {
  return screen.getByRole("region", { name: "Selected folder" });
}

describe("application keyboard shortcuts", () => {
  beforeEach(() => {
    mocks.listeners.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
    localStorage.clear();
    setWindowWidth(1024);
    document.documentElement.removeAttribute("data-theme");
    Object.defineProperty(window.navigator, "platform", {
      configurable: true,
      value: "MacIntel",
    });
    mocks.virtuosoState = {
      ranges: [{ startIndex: 0, endIndex: 0 }],
      scrollTop: 0,
    };
    prepareDefaults();
  });

  afterEach(() => {
    Object.defineProperty(window.navigator, "platform", {
      configurable: true,
      value: originalNavigatorPlatform,
    });
  });

  it("navigates between every surface and preserves the Chat draft", async () => {
    const { user } = await renderApp();
    const switcher = await screen.findByRole("region", {
      name: "Selected folder",
    });
    const chat = within(switcher).getByRole("radio", { name: "Chat" });
    const kanban = within(switcher).getByRole("radio", { name: "Kanban" });
    const prompt = screen.getByLabelText("Prompt");
    await user.type(prompt, "Keep this draft");

    expect((await pressApplicationShortcut("Digit2", "2")).defaultPrevented).toBe(true);
    expect(kanban).toHaveAttribute("aria-checked", "true");
    expect((await pressApplicationShortcut("Digit1", "1")).defaultPrevented).toBe(true);
    expect(chat).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Prompt")).toHaveValue("Keep this draft");

    await pressApplicationShortcut("Digit3", "3");
    expect(screen.getByRole("button", { name: "Analytics" })).toHaveClass(
      "active",
    );
    await pressApplicationShortcut("Digit4", "4");
    expect(screen.getByRole("button", { name: "Plugins" })).toHaveClass(
      "active",
    );
    await pressApplicationShortcut("Comma", ",");
    expect(screen.getByRole("button", { name: "Settings" })).toHaveClass(
      "active",
    );

    expect(screen.getByRole("button", { name: "Analytics" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Meta+3",
    );
    expect(screen.getByRole("button", { name: "Plugins" })).toHaveAttribute(
      "data-tooltip",
      "Plugins (⌘4)",
    );
    expect(chat).toHaveAttribute("aria-keyshortcuts", "Meta+1");
  });

  it("uses the existing new-chat behavior after switching back to Chat", async () => {
    const { user } = await renderApp();
    await screen.findByRole("region", { name: "Selected folder" });
    await user.type(screen.getByLabelText("Prompt"), "Unsaved draft");
    await pressApplicationShortcut("Comma", ",");

    expect((await pressApplicationShortcut("KeyN", "n")).defaultPrevented).toBe(true);
    expect(
      within(workspaceSwitcher()).getByRole("radio", { name: "Chat" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Prompt")).toHaveValue("Unsaved draft");
  });

  it("returns a plugin overview to the catalog when Plugins is invoked again", async () => {
    const browserPlugin = {
      id: "browser@openai-bundled",
      name: "browser",
      version: "26.818.41509",
      installed: true,
      enabled: true,
      installPolicy: "AVAILABLE",
      authPolicy: "ON_USE",
      availability: "AVAILABLE",
      interface: {
        displayName: "Browser",
        shortDescription: "Control the isolated in-app browser.",
        capabilities: ["Interactive"],
      },
      keywords: ["web"],
    };
    mocks.codexDefaultProfileRpcMock.mockImplementation(async (method) => {
      if (method === "plugin/list") {
        return {
          marketplaces: [
            {
              name: "openai-bundled",
              path: null,
              plugins: [browserPlugin],
            },
          ],
          marketplaceLoadErrors: [],
          featuredPluginIds: [browserPlugin.id],
        };
      }
      if (method === "plugin/read") {
        return {
          plugin: {
            summary: browserPlugin,
            marketplaceName: "openai-bundled",
            marketplacePath: null,
            description: "Control the isolated in-app browser.",
            skills: [{}],
            apps: [],
            mcpServers: [],
            hooks: [],
          },
        };
      }
      return undefined;
    });

    const { user } = await renderApp();
    await pressApplicationShortcut("Digit4", "4");
    await user.click(
      await screen.findByRole("button", { name: "View Browser details" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Browser", level: 1 }),
    ).toBeVisible();

    await pressApplicationShortcut("Digit4", "4");
    expect(
      await screen.findByRole("heading", { name: "Plugins", level: 1 }),
    ).toBeVisible();
  });

  it("surfaces the existing missing-workspace guidance for New chat", async () => {
    mocks.listWorkspacesMock.mockResolvedValue([]);
    await renderApp();
    await screen.findByText("No folder selected");

    await pressApplicationShortcut("KeyN", "n");
    expect(
      await screen.findByText("Choose a workspace before starting a new chat."),
    ).toBeInTheDocument();
  });

  it("opens, searches, toggles, and restores focus for shortcut overlays", async () => {
    const { user } = await renderApp();
    const analyticsButton = await screen.findByRole("button", {
      name: "Analytics",
    });
    analyticsButton.focus();

    await pressApplicationShortcut("KeyK", "k");
    const palette = screen.getByRole("dialog", { name: "Command palette" });
    const search = within(palette).getByRole("combobox", {
      name: "Search commands",
    });
    await waitFor(() => expect(search).toHaveFocus());

    const suppressedNavigation = await pressApplicationShortcut("Digit3", "3");
    expect(suppressedNavigation.defaultPrevented).toBe(false);
    expect(analyticsButton).not.toHaveClass("active");

    await pressApplicationShortcut("KeyK", "k");
    await waitFor(() => expect(palette).not.toBeInTheDocument());
    await waitFor(() => expect(analyticsButton).toHaveFocus());

    await pressApplicationShortcut("Slash", "/");
    expect(
      screen.getByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeInTheDocument();
    await pressApplicationShortcut("Slash", "/");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Keyboard shortcuts" }),
      ).not.toBeInTheDocument(),
    );

    await pressApplicationShortcut("KeyK", "k");
    const paletteSearch = await screen.findByRole("combobox", {
      name: "Search commands",
    });
    await user.type(paletteSearch, "report bug");
    await user.click(screen.getByRole("option", { name: /Report a bug/ }));
    await waitFor(() => expect(mocks.openUrlMock).toHaveBeenCalledTimes(1));
  });

  it("suppresses shortcuts for unrelated dialogs and ignores repeated events", async () => {
    await renderApp();
    const analyticsButton = await screen.findByRole("button", {
      name: "Analytics",
    });
    const dialog = document.createElement("section");
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    document.body.append(dialog);

    expect(
      (await pressApplicationShortcut("Digit3", "3")).defaultPrevented,
    ).toBe(false);
    expect(analyticsButton).not.toHaveClass("active");
    dialog.remove();

    expect(
      (await pressApplicationShortcut("Digit3", "3", { repeat: true }))
        .defaultPrevented,
    ).toBe(false);
    expect(analyticsButton).not.toHaveClass("active");
  });

  it("stops only the run visible in Chat", async () => {
    prepareSignedInRun();
    const { user } = await renderApp();
    await startMockRun(user, "Exercise visible-run stopping");
    mocks.codexRpcMock.mockClear();

    await pressApplicationShortcut("Digit3", "3");
    expect(
      (await pressApplicationShortcut("Period", ".")).defaultPrevented,
    ).toBe(true);
    expect(
      mocks.codexRpcMock.mock.calls.some(([, method]) => method === "turn/interrupt"),
    ).toBe(false);

    await pressApplicationShortcut("Digit1", "1");
    await pressApplicationShortcut("Period", ".");
    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(7, "turn/interrupt", {
        threadId: "thread-1",
        turnId: "turn-1",
      }),
    );
  });
});
