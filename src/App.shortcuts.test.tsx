import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMocks,
  prepareDefaults,
  prepareSignedInRun,
  renderApp,
  setWindowWidth,
  startMockRun,
  workspace,
} from "./test/appRuntimeHarness";
import {
  readSidebarPreferences,
  SIDEBAR_STORAGE_KEY,
} from "./features/workspaces/sidebarPreferences";

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
    (document.activeElement ?? window).dispatchEvent(event);
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

    expect((await pressApplicationShortcut("Digit4", "4")).defaultPrevented).toBe(true);
    expect(kanban).toHaveAttribute("aria-checked", "true");
    expect((await pressApplicationShortcut("Digit5", "5")).defaultPrevented).toBe(true);
    expect(chat).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Prompt")).toHaveValue("Keep this draft");

    await pressApplicationShortcut("Digit6", "6");
    expect(screen.getByRole("button", { name: "Analytics" })).toHaveClass(
      "active",
    );
    await pressApplicationShortcut("Digit7", "7");
    expect(screen.getByRole("button", { name: "Plugins" })).toHaveClass(
      "active",
    );
    await pressApplicationShortcut("Comma", ",");
    expect(screen.getByRole("button", { name: "Settings" })).toHaveClass(
      "active",
    );

    expect(screen.getByRole("button", { name: "Analytics" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Meta+6",
    );
    expect(screen.getByRole("button", { name: "Plugins" })).toHaveAttribute(
      "data-tooltip",
      "Plugins (⌘7)",
    );
    expect(chat).toHaveAttribute("aria-keyshortcuts", "Meta+5");
    expect(kanban).toHaveAttribute("aria-keyshortcuts", "Meta+4");
  });

  it.each([
    ["MacIntel", "⌘", "Meta"],
    ["Win32", "Ctrl+", "Control"],
  ])("switches sidebar modes on %s without disturbing the conversation or draft", async (platform, prefix, ariaModifier) => {
    Object.defineProperty(window.navigator, "platform", {
      configurable: true,
      value: platform,
    });
    localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify({
      mode: "chats", chats: [workspace.id], files: [], directories: [],
    }));
    prepareSignedInRun();
    const { user } = await renderApp();
    await startMockRun(user, "Keep this conversation open");
    const transcript = screen.getByLabelText("Task chat transcript");
    const prompt = screen.getByLabelText("Prompt");
    await user.type(prompt, "Keep this draft and focus");
    const modifier = platform === "MacIntel"
      ? { metaKey: true, ctrlKey: false }
      : { metaKey: false, ctrlKey: true };
    const selectMode = async (key: string, label: string) => {
      const event = await pressApplicationShortcut(`Digit${key}`, key, modifier);
      expect(event.defaultPrevented).toBe(true);
      const button = within(screen.getByRole("group", { name: "Sidebar mode" }))
        .getByRole("button", { name: label });
      expect(button).toHaveAttribute("aria-pressed", "true");
      expect(button).toHaveAttribute("aria-keyshortcuts", `${ariaModifier}+${key}`);
      expect(button).toHaveAttribute("data-tooltip", `${label} (${prefix}${key})`);
      expect(screen.getByLabelText("Task chat transcript")).toBe(transcript);
      expect(screen.getByLabelText("Prompt")).toBe(prompt);
      expect(prompt).toHaveValue("Keep this draft and focus");
      expect(prompt).toHaveFocus();
      expect(within(workspaceSwitcher()).getByRole("radio", { name: "Chat" }))
        .toHaveAttribute("aria-checked", "true");
    };

    const chats = screen.getByRole("navigation", { name: "Chats" });
    fireEvent.scroll(chats, { target: { scrollTop: 120 } });
    await selectMode("2", "Files");
    expect(screen.getByRole("button", { name: `Expand ${workspace.label}` })).toBeVisible();
    await user.click(screen.getByRole("button", { name: `Expand ${workspace.label}` }));
    await user.click(prompt);
    const files = screen.getByRole("navigation", { name: "Files" });
    fireEvent.scroll(files, { target: { scrollTop: 40 } });
    await selectMode("3", "Priority");
    expect(readSidebarPreferences().mode).toBe("priority");
    const priorityRequests = mocks.listPriorityChatsMock.mock.calls.length;
    await selectMode("3", "Priority");
    expect(mocks.listPriorityChatsMock).toHaveBeenCalledTimes(priorityRequests);
    await selectMode("1", "Chats");
    expect(chats.scrollTop).toBe(120);
    expect(screen.getByRole("button", { name: `Collapse ${workspace.label}` })).toBeVisible();
    await selectMode("2", "Files");
    expect(files.scrollTop).toBe(40);
    expect(screen.getByRole("button", { name: `Collapse ${workspace.label}` })).toBeVisible();
    expect(readSidebarPreferences()).toMatchObject({
      mode: "files", chats: [workspace.id], files: [workspace.id],
    });
  });

  it("keeps the current main view when selecting sidebar modes", async () => {
    await renderApp();
    await screen.findByRole("region", { name: "Selected folder" });
    for (const [code, key, view] of [
      ["Digit6", "6", "Analytics"],
      ["Digit7", "7", "Plugins"],
      ["Comma", ",", "Settings"],
      ["Digit4", "4", "Kanban"],
    ]) {
      await pressApplicationShortcut(code, key);
      for (const [sidebarKey, label] of [["2", "Files"], ["3", "Priority"], ["1", "Chats"]]) {
        await pressApplicationShortcut(`Digit${sidebarKey}`, sidebarKey);
        expect(screen.getByRole("navigation", { name: label })).toBeVisible();
        if (view === "Kanban") {
          expect(within(workspaceSwitcher()).getByRole("radio", { name: "Kanban" }))
            .toHaveAttribute("aria-checked", "true");
        } else {
          expect(screen.getByRole("button", { name: view })).toHaveClass("active");
        }
      }
    }
  });

  it("selects a sidebar mode from the palette and restores composer focus", async () => {
    const { user } = await renderApp();
    const prompt = screen.getByLabelText("Prompt");
    await user.type(prompt, "Keep this draft");
    await pressApplicationShortcut("KeyK", "k");
    const search = screen.getByRole("combobox", { name: "Search commands" });
    await user.type(search, "sidebar priority");
    const option = screen.getByRole("option", { name: /Sidebar: Priority/ });
    expect(option).toHaveTextContent("⌘3");
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Priority" })).toBeVisible();
    expect(prompt).toHaveValue("Keep this draft");
    await waitFor(() => expect(prompt).toHaveFocus());
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
    await pressApplicationShortcut("Digit7", "7");
    await user.click(
      await screen.findByRole("button", { name: "View Browser details" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Browser", level: 1 }),
    ).toBeVisible();

    await pressApplicationShortcut("Digit7", "7");
    expect(
      await screen.findByRole("heading", { name: "Plugins", level: 1 }),
    ).toBeVisible();
  });

  it("surfaces the existing missing-workspace guidance for New chat", async () => {
    mocks.listWorkspacesMock.mockResolvedValue([]);
    await renderApp();
    await screen.findByText("No folder selected");

    for (const [key, label] of [["2", "Files"], ["3", "Priority"], ["1", "Chats"]]) {
      expect((await pressApplicationShortcut(`Digit${key}`, key)).defaultPrevented).toBe(true);
      expect(screen.getByRole("navigation", { name: label })).toBeVisible();
      expect(screen.getByText("No folder selected")).toBeVisible();
    }

    await pressApplicationShortcut("KeyN", "n");
    expect(
      await screen.findByText("Choose a workspace before starting a new chat."),
    ).toBeInTheDocument();
  });

  it("opens, searches, toggles, and restores focus for shortcut overlays", async () => {
    prepareSignedInRun();
    const { user } = await renderApp();
    await screen.findByLabelText("Codex account");
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

    const suppressedNavigation = await pressApplicationShortcut("Digit6", "6");
    expect(suppressedNavigation.defaultPrevented).toBe(false);
    expect(analyticsButton).not.toHaveClass("active");

    expect((await pressApplicationShortcut("Digit3", "3")).defaultPrevented).toBe(false);
    expect(screen.getByRole("button", { name: "Chats" })).toHaveAttribute("aria-pressed", "true");

    await pressApplicationShortcut("KeyK", "k");
    await waitFor(() => expect(palette).not.toBeInTheDocument());
    await waitFor(() => expect(analyticsButton).toHaveFocus());

    await pressApplicationShortcut("Slash", "/");
    expect(
      screen.getByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sidebar: Chats").closest(".keyboard-shortcut-row"))
      .toHaveTextContent("⌘1");
    expect(screen.getByText("Sidebar: Files").closest(".keyboard-shortcut-row"))
      .toHaveTextContent("⌘2");
    expect(screen.getByText("Sidebar: Priority").closest(".keyboard-shortcut-row"))
      .toHaveTextContent("⌘3");
    expect((await pressApplicationShortcut("Digit2", "2")).defaultPrevented).toBe(false);
    expect(screen.getByRole("button", { name: "Chats" })).toHaveAttribute("aria-pressed", "true");
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

  it("hides bug reporting from the command palette while signed out", async () => {
    const { user } = await renderApp();
    await screen.findByLabelText("Sign in to Codex");
    await pressApplicationShortcut("KeyK", "k");
    await user.type(screen.getByRole("combobox", { name: "Search commands" }), "report bug");
    expect(screen.queryByRole("option", { name: /Report a bug/ })).not.toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(mocks.openUrlMock).not.toHaveBeenCalled();
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
      (await pressApplicationShortcut("Digit6", "6")).defaultPrevented,
    ).toBe(false);
    expect(analyticsButton).not.toHaveClass("active");
    expect((await pressApplicationShortcut("Digit2", "2")).defaultPrevented).toBe(false);
    expect(screen.getByRole("button", { name: "Chats" })).toHaveAttribute("aria-pressed", "true");
    dialog.remove();

    expect(
      (await pressApplicationShortcut("Digit6", "6", { repeat: true }))
        .defaultPrevented,
    ).toBe(false);
    expect(analyticsButton).not.toHaveClass("active");
    for (const override of [
      { repeat: true }, { isComposing: true }, { altKey: true },
      { shiftKey: true }, { metaKey: false }, { ctrlKey: true },
    ]) {
      expect((await pressApplicationShortcut("Digit2", "2", override)).defaultPrevented).toBe(false);
      expect(screen.getByRole("button", { name: "Chats" })).toHaveAttribute("aria-pressed", "true");
    }
  });

  it("stops only the run visible in Chat", async () => {
    prepareSignedInRun();
    const { user } = await renderApp();
    await startMockRun(user, "Exercise visible-run stopping");
    mocks.codexRpcMock.mockClear();

    await pressApplicationShortcut("Digit6", "6");
    expect(
      (await pressApplicationShortcut("Period", ".")).defaultPrevented,
    ).toBe(true);
    expect(
      mocks.codexRpcMock.mock.calls.some(([, method]) => method === "turn/interrupt"),
    ).toBe(false);

    await pressApplicationShortcut("Digit5", "5");
    await pressApplicationShortcut("Period", ".");
    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(7, "turn/interrupt", {
        threadId: "thread-1",
        turnId: "turn-1",
      }),
    );
  });
});
