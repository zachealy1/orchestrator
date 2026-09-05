import { Keyboard, X } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";
import {
  APPLICATION_SHORTCUT_DEFINITIONS,
  formatApplicationShortcut,
  type ApplicationCommandGroup,
  type ShortcutPlatform,
} from "../features/shortcuts/applicationShortcuts";
import { trapDialogFocus } from "../shared/dialogFocus";

type Props = {
  platform: ShortcutPlatform;
  onClose: () => void;
};

const GROUP_ORDER: ApplicationCommandGroup[] = [
  "Navigation",
  "Actions",
  "Help",
];

export function KeyboardShortcutsDialog({ platform, onClose }: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() =>
      closeButtonRef.current?.focus({ preventScroll: true }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    trapDialogFocus(event);
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
        className="keyboard-shortcuts-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-title"
        data-application-shortcut-overlay="keyboard-shortcuts"
        onKeyDown={handleKeyDown}
      >
        <header>
          <span className="keyboard-shortcuts-heading-icon" aria-hidden="true">
            <Keyboard size={19} />
          </span>
          <div>
            <h1 id="keyboard-shortcuts-title">Keyboard shortcuts</h1>
            <p>Move around Orchestrator and control the visible task.</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="keyboard-shortcuts-close"
            aria-label="Close keyboard shortcuts"
            data-tooltip="Close"
            onClick={onClose}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div className="keyboard-shortcuts-groups">
          {GROUP_ORDER.map((group) => {
            const shortcuts = APPLICATION_SHORTCUT_DEFINITIONS.filter(
              (command) => command.group === group,
            );
            if (shortcuts.length === 0) return null;
            return (
              <section aria-labelledby={`keyboard-shortcuts-${group}`} key={group}>
                <h2 id={`keyboard-shortcuts-${group}`}>{group}</h2>
                <div>
                  {shortcuts.map((command) => (
                    <div className="keyboard-shortcut-row" key={command.id}>
                      <span>
                        <strong>{command.label}</strong>
                        <small>{command.description}</small>
                      </span>
                      <kbd>
                        {formatApplicationShortcut(command.shortcut, platform)}
                      </kbd>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}
