export type ShortcutPlatform = "mac" | "other";

export type ApplicationCommandId =
  | "new-chat"
  | "command-palette"
  | "open-chat"
  | "open-kanban"
  | "open-analytics"
  | "open-plugins"
  | "open-settings"
  | "stop-visible-run"
  | "keyboard-shortcuts"
  | "report-bug";

export type ApplicationCommandGroup = "Navigation" | "Actions" | "Help";

export type ShortcutDefinition = {
  code: string;
  key: string;
  displayKey: string;
  ariaKey: string;
};

export type ApplicationCommandDefinition = {
  id: ApplicationCommandId;
  label: string;
  description: string;
  group: ApplicationCommandGroup;
  keywords: string[];
  shortcut: ShortcutDefinition | null;
  showInPalette: boolean;
};

export type ApplicationCommand = ApplicationCommandDefinition & {
  enabled: boolean;
  disabledReason: string | null;
  shortcutEnabled?: boolean;
  run: () => void;
};

export const APPLICATION_COMMAND_DEFINITIONS: ApplicationCommandDefinition[] = [
  {
    id: "new-chat",
    label: "New chat",
    description: "Start a new chat in the selected workspace",
    group: "Actions",
    keywords: ["new", "chat", "conversation", "task"],
    shortcut: shortcut("KeyN", "n", "N", "N"),
    showInPalette: true,
  },
  {
    id: "command-palette",
    label: "Command palette",
    description: "Search application actions",
    group: "Help",
    keywords: ["command", "palette", "actions", "search"],
    shortcut: shortcut("KeyK", "k", "K", "K"),
    showInPalette: false,
  },
  {
    id: "open-chat",
    label: "Open Chat",
    description: "Show the selected workspace chat",
    group: "Navigation",
    keywords: ["chat", "task", "conversation"],
    shortcut: shortcut("Digit1", "1", "1", "1"),
    showInPalette: true,
  },
  {
    id: "open-kanban",
    label: "Open Kanban",
    description: "Show the selected workspace board",
    group: "Navigation",
    keywords: ["kanban", "board", "cards"],
    shortcut: shortcut("Digit2", "2", "2", "2"),
    showInPalette: true,
  },
  {
    id: "open-analytics",
    label: "Open Analytics",
    description: "Show application analytics and usage limits",
    group: "Navigation",
    keywords: ["analytics", "usage", "limits", "metrics"],
    shortcut: shortcut("Digit3", "3", "3", "3"),
    showInPalette: true,
  },
  {
    id: "open-plugins",
    label: "Open Plugins",
    description: "Browse installed and available plugins",
    group: "Navigation",
    keywords: ["plugins", "marketplace", "installed"],
    shortcut: shortcut("Digit4", "4", "4", "4"),
    showInPalette: true,
  },
  {
    id: "open-settings",
    label: "Open Settings",
    description: "Manage application settings",
    group: "Navigation",
    keywords: ["settings", "preferences", "accounts"],
    shortcut: shortcut("Comma", ",", ",", "Comma"),
    showInPalette: true,
  },
  {
    id: "stop-visible-run",
    label: "Stop visible run",
    description: "Stop the run visible in Chat or on the focused Kanban card",
    group: "Actions",
    keywords: ["stop", "cancel", "interrupt", "run", "agent"],
    shortcut: shortcut("Period", ".", ".", "Period"),
    showInPalette: true,
  },
  {
    id: "keyboard-shortcuts",
    label: "Keyboard shortcuts",
    description: "Show all application keyboard shortcuts",
    group: "Help",
    keywords: ["keyboard", "shortcuts", "keys", "help"],
    shortcut: shortcut("Slash", "/", "/", "Slash"),
    showInPalette: true,
  },
  {
    id: "report-bug",
    label: "Report a bug",
    description: "Open the Orchestrator bug report form",
    group: "Help",
    keywords: ["report", "bug", "issue", "feedback"],
    shortcut: null,
    showInPalette: true,
  },
];

export const APPLICATION_SHORTCUT_DEFINITIONS =
  APPLICATION_COMMAND_DEFINITIONS.filter(
    (command): command is ApplicationCommandDefinition & {
      shortcut: ShortcutDefinition;
    } => command.shortcut !== null,
  );

export type ShortcutKeyEvent = Pick<
  KeyboardEvent,
  "altKey" | "code" | "ctrlKey" | "isComposing" | "key" | "metaKey" | "repeat" | "shiftKey"
>;

export function detectShortcutPlatform(
  platform = globalThis.navigator?.platform ?? "",
  userAgent = globalThis.navigator?.userAgent ?? "",
): ShortcutPlatform {
  return /Mac|iPhone|iPad/i.test(`${platform} ${userAgent}`) ? "mac" : "other";
}

export function findApplicationShortcut(
  event: ShortcutKeyEvent,
  platform: ShortcutPlatform,
): ApplicationCommandDefinition | null {
  if (
    event.repeat ||
    event.isComposing ||
    event.altKey ||
    event.shiftKey ||
    (platform === "mac"
      ? !event.metaKey || event.ctrlKey
      : !event.ctrlKey || event.metaKey)
  ) {
    return null;
  }

  const normalizedKey = event.key.toLocaleLowerCase();
  return (
    APPLICATION_SHORTCUT_DEFINITIONS.find(
      (command) =>
        command.shortcut.code === event.code ||
        command.shortcut.key === normalizedKey,
    ) ?? null
  );
}

export function formatApplicationShortcut(
  shortcutDefinition: ShortcutDefinition,
  platform: ShortcutPlatform,
) {
  return platform === "mac"
    ? `⌘${shortcutDefinition.displayKey}`
    : `Ctrl+${shortcutDefinition.displayKey}`;
}

export function formatApplicationCommandShortcut(
  commandId: ApplicationCommandId,
  platform = detectShortcutPlatform(),
) {
  const command = APPLICATION_COMMAND_DEFINITIONS.find(
    (candidate) => candidate.id === commandId,
  );
  return command?.shortcut
    ? formatApplicationShortcut(command.shortcut, platform)
    : null;
}

export function applicationCommandAriaShortcut(
  commandId: ApplicationCommandId,
  platform = detectShortcutPlatform(),
) {
  const command = APPLICATION_COMMAND_DEFINITIONS.find(
    (candidate) => candidate.id === commandId,
  );
  if (!command?.shortcut) return undefined;
  const modifier = platform === "mac" ? "Meta" : "Control";
  return `${modifier}+${command.shortcut.ariaKey}`;
}

export function filterApplicationCommands(
  commands: ApplicationCommand[],
  query: string,
) {
  const terms = query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return commands.filter((command) => {
    if (!command.showInPalette) return false;
    if (terms.length === 0) return true;
    const searchable = [
      command.label,
      command.description,
      command.group,
      ...command.keywords,
    ]
      .join(" ")
      .toLocaleLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}

function shortcut(
  code: string,
  key: string,
  displayKey: string,
  ariaKey: string,
): ShortcutDefinition {
  return { code, key, displayKey, ariaKey };
}
