import {
  BarChart3,
  Bug,
  CircleStop,
  Columns3,
  Command,
  Keyboard,
  MessageSquare,
  Puzzle,
  Search,
  Settings,
  SquarePen,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  filterApplicationCommands,
  formatApplicationShortcut,
  type ApplicationCommand,
  type ApplicationCommandGroup,
  type ApplicationCommandId,
  type ShortcutPlatform,
} from "../features/shortcuts/applicationShortcuts";
import { trapDialogFocus } from "../shared/dialogFocus";

type Props = {
  commands: ApplicationCommand[];
  platform: ShortcutPlatform;
  onClose: () => void;
};

const GROUP_ORDER: ApplicationCommandGroup[] = [
  "Navigation",
  "Actions",
  "Help",
];

export function ApplicationCommandPalette({
  commands,
  platform,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [activeCommandId, setActiveCommandId] =
    useState<ApplicationCommandId | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const filteredCommands = useMemo(() => {
    const matches = filterApplicationCommands(commands, query);
    return GROUP_ORDER.flatMap((group) =>
      matches.filter((command) => command.group === group),
    );
  }, [commands, query]);
  const activeIndex = filteredCommands.findIndex(
    (command) => command.id === activeCommandId,
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (
      activeCommandId &&
      filteredCommands.some((command) => command.id === activeCommandId)
    ) {
      return;
    }
    setActiveCommandId(
      filteredCommands.find((command) => command.enabled)?.id ??
        filteredCommands[0]?.id ??
        null,
    );
  }, [activeCommandId, filteredCommands]);

  function execute(command: ApplicationCommand | undefined) {
    if (!command?.enabled) return;
    command.run();
  }

  function moveActive(direction: 1 | -1) {
    if (filteredCommands.length === 0) return;
    let nextIndex = activeIndex;
    for (let attempts = 0; attempts < filteredCommands.length; attempts += 1) {
      nextIndex =
        (nextIndex + direction + filteredCommands.length) %
        filteredCommands.length;
      const candidate = filteredCommands[nextIndex];
      if (candidate?.enabled) {
        setActiveCommandId(candidate.id);
        return;
      }
    }
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    trapDialogFocus(event);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const candidates = event.key === "Home"
        ? filteredCommands
        : [...filteredCommands].reverse();
      const candidate = candidates.find((command) => command.enabled);
      setActiveCommandId(candidate?.id ?? null);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      execute(filteredCommands[activeIndex]);
    }
  }

  return (
    <div
      className="modal-backdrop application-command-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="application-command-palette"
        role="dialog"
        aria-modal="true"
        aria-labelledby="application-command-palette-title"
        data-application-shortcut-overlay="command-palette"
        onKeyDown={handleDialogKeyDown}
      >
        <header className="application-command-search">
          <Search size={18} aria-hidden="true" />
          <label>
            <span className="sr-only" id="application-command-palette-title">
              Command palette
            </span>
            <input
              ref={inputRef}
              role="combobox"
              aria-label="Search commands"
              spellCheck={false}
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-expanded="true"
              aria-activedescendant={
                activeCommandId
                  ? commandOptionId(listboxId, activeCommandId)
                  : undefined
              }
              placeholder="Search commands"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={handleSearchKeyDown}
            />
          </label>
          <kbd>Esc</kbd>
        </header>

        <div
          className="application-command-results"
          id={listboxId}
          role="listbox"
          aria-label="Application commands"
        >
          {filteredCommands.length > 0 ? (
            GROUP_ORDER.map((group) => {
              const groupCommands = filteredCommands.filter(
                (command) => command.group === group,
              );
              if (groupCommands.length === 0) return null;
              return (
                <div
                  className="application-command-group"
                  key={group}
                  role="group"
                  aria-labelledby={`${listboxId}-${group}`}
                >
                  <h2 id={`${listboxId}-${group}`}>{group}</h2>
                  {groupCommands.map((command) => (
                    <button
                      type="button"
                      role="option"
                      id={commandOptionId(listboxId, command.id)}
                      aria-selected={command.id === activeCommandId}
                      aria-disabled={!command.enabled}
                      className={`application-command-option${
                        command.id === activeCommandId ? " is-active" : ""
                      }`}
                      key={command.id}
                      onMouseEnter={() => setActiveCommandId(command.id)}
                      onClick={() => execute(command)}
                    >
                      <span className="application-command-icon" aria-hidden="true">
                        <CommandIcon commandId={command.id} />
                      </span>
                      <span className="application-command-copy">
                        <strong>{command.label}</strong>
                        <span>
                          {!command.enabled && command.disabledReason
                            ? command.disabledReason
                            : command.description}
                        </span>
                      </span>
                      {command.shortcut ? (
                        <kbd>
                          {formatApplicationShortcut(command.shortcut, platform)}
                        </kbd>
                      ) : null}
                    </button>
                  ))}
                </div>
              );
            })
          ) : (
            <div className="application-command-empty">
              <Command size={18} aria-hidden="true" />
              <span>No matching commands</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function commandOptionId(listboxId: string, commandId: ApplicationCommandId) {
  return `${listboxId}-${commandId}`;
}

function CommandIcon({ commandId }: { commandId: ApplicationCommandId }) {
  switch (commandId) {
    case "new-chat":
      return <SquarePen size={17} />;
    case "command-palette":
      return <Command size={17} />;
    case "open-chat":
      return <MessageSquare size={17} />;
    case "open-kanban":
      return <Columns3 size={17} />;
    case "open-analytics":
      return <BarChart3 size={17} />;
    case "open-plugins":
      return <Puzzle size={17} />;
    case "open-settings":
      return <Settings size={17} />;
    case "stop-visible-run":
      return <CircleStop size={17} />;
    case "keyboard-shortcuts":
      return <Keyboard size={17} />;
    case "report-bug":
      return <Bug size={17} />;
  }
}
