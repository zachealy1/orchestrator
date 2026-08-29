import type { BrowserPreferences } from "./types";

export const BROWSER_PREFERENCES_STORAGE_KEY = "orchestrator.browser.v1";

export const DEFAULT_BROWSER_PREFERENCES: BrowserPreferences = {
  downloadLocation: null,
  askWhereToSave: false,
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function readBrowserPreferences(
  storage: StorageLike | null = defaultStorage(),
): BrowserPreferences {
  if (!storage) return { ...DEFAULT_BROWSER_PREFERENCES };
  try {
    const value = storage.getItem(BROWSER_PREFERENCES_STORAGE_KEY);
    return value
      ? validateBrowserPreferences(JSON.parse(value))
      : { ...DEFAULT_BROWSER_PREFERENCES };
  } catch {
    return { ...DEFAULT_BROWSER_PREFERENCES };
  }
}

export function persistBrowserPreferences(
  preferences: BrowserPreferences,
  storage: StorageLike | null = defaultStorage(),
) {
  if (!storage) return;
  try {
    storage.setItem(
      BROWSER_PREFERENCES_STORAGE_KEY,
      JSON.stringify(validateBrowserPreferences(preferences)),
    );
  } catch {
    // The current application state remains authoritative for this session.
  }
}

export function validateBrowserPreferences(value: unknown): BrowserPreferences {
  const input =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    downloadLocation:
      typeof input.downloadLocation === "string" &&
      input.downloadLocation.trim()
        ? input.downloadLocation
        : null,
    askWhereToSave: input.askWhereToSave === true,
  };
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
