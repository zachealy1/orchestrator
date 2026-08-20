import { setTheme as setNativeTheme } from "@tauri-apps/api/app";
import type { ResolvedTheme, ThemePreference } from "../shared/types";

export const THEME_STORAGE_KEY = "orchestrator.theme";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "dark";
}

export function readThemePreference(
  _storage: Pick<Storage, "getItem"> = window.localStorage,
): ThemePreference {
  return "dark";
}

export function persistThemePreference(
  _preference: ThemePreference,
  storage: Pick<Storage, "setItem"> = window.localStorage,
) {
  try {
    storage.setItem(THEME_STORAGE_KEY, "dark");
  } catch {
    // Dark mode still applies for the current session.
  }
}

export function resolveTheme(_preference: ThemePreference): ResolvedTheme {
  return "dark";
}

export function applyDocumentTheme(
  _theme: ResolvedTheme,
  root: HTMLElement = document.documentElement,
) {
  root.dataset.theme = "dark";
  root.style.colorScheme = "dark";
}

export function applyResolvedTheme(_theme: ResolvedTheme) {
  applyDocumentTheme("dark");
  void setNativeTheme("dark").catch(() => {
    // Browser previews do not expose the Tauri runtime.
  });
  return "dark";
}

export function applyThemePreference(_preference: ThemePreference) {
  return applyResolvedTheme("dark");
}

export function initializeTheme() {
  persistThemePreference("dark");
  applyThemePreference("dark");
  return "dark";
}
