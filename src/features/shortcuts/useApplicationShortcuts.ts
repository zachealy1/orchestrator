import { useEffect, useRef } from "react";
import {
  findApplicationShortcut,
  type ApplicationCommand,
  type ShortcutPlatform,
} from "./applicationShortcuts";

type Options = {
  commands: ApplicationCommand[];
  platform: ShortcutPlatform;
  commandPaletteOpen: boolean;
  keyboardShortcutsOpen: boolean;
};

export function useApplicationShortcuts({
  commands,
  platform,
  commandPaletteOpen,
  keyboardShortcutsOpen,
}: Options) {
  const stateRef = useRef({
    commands,
    commandPaletteOpen,
    keyboardShortcutsOpen,
  });
  stateRef.current = { commands, commandPaletteOpen, keyboardShortcutsOpen };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const definition = findApplicationShortcut(event, platform);
      if (!definition) return;

      const state = stateRef.current;
      const openModal = document.querySelector<HTMLElement>(
        ':is([role="dialog"], [role="alertdialog"])[aria-modal="true"]',
      );
      if (openModal) {
        const togglesCurrentPalette =
          definition.id === "command-palette" && state.commandPaletteOpen;
        const togglesCurrentHelp =
          definition.id === "keyboard-shortcuts" &&
          state.keyboardShortcutsOpen;
        if (!togglesCurrentPalette && !togglesCurrentHelp) return;
      }

      const command = state.commands.find(
        (candidate) => candidate.id === definition.id,
      );
      if (!command) return;
      event.preventDefault();
      event.stopPropagation();
      if (command.shortcutEnabled ?? command.enabled) command.run();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [platform]);
}
