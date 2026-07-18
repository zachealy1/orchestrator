import { setTheme as setNativeTheme } from "@tauri-apps/api/app";
import type { ResolvedTheme, ThemePreference } from "../types";

export const THEME_STORAGE_KEY = "orchestrator.theme";
export const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function readThemePreference(
  storage: Pick<Storage, "getItem"> = window.localStorage,
): ThemePreference {
  try {
    const storedPreference = storage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(storedPreference) ? storedPreference : "system";
  } catch {
    return "system";
  }
}

export function persistThemePreference(
  preference: ThemePreference,
  storage: Pick<Storage, "setItem"> = window.localStorage,
) {
  try {
    storage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Theme selection still applies for the current session.
  }
}

export function resolveTheme(
  preference: ThemePreference,
  matchMedia: (query: string) => MediaQueryList = window.matchMedia.bind(window),
): ResolvedTheme {
  if (preference !== "system") {
    return preference;
  }

  return matchMedia(SYSTEM_DARK_QUERY).matches ? "dark" : "light";
}

export function applyDocumentTheme(
  theme: ResolvedTheme,
  root: HTMLElement = document.documentElement,
) {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function applyResolvedTheme(theme: ResolvedTheme) {
  applyDocumentTheme(theme);
  void setNativeTheme(theme).catch(() => {
    // Browser previews do not expose the Tauri runtime.
  });
  return theme;
}

export function applyThemePreference(preference: ThemePreference) {
  const resolvedTheme = resolveTheme(preference);
  return applyResolvedTheme(resolvedTheme);
}

export function watchSystemTheme(
  onChange: (theme: ResolvedTheme) => void,
  matchMedia: (query: string) => MediaQueryList = window.matchMedia.bind(window),
) {
  const mediaQuery = matchMedia(SYSTEM_DARK_QUERY);
  const handleChange = (event: MediaQueryListEvent) => {
    onChange(event.matches ? "dark" : "light");
  };

  mediaQuery.addEventListener("change", handleChange);
  return () => mediaQuery.removeEventListener("change", handleChange);
}

export function initializeTheme() {
  const preference = readThemePreference();
  applyThemePreference(preference);
  return preference;
}
