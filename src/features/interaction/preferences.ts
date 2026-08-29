import type { InteractionPreferences } from "./types";

export const INTERACTION_PREFERENCE_STORAGE_KEY = "orchestrator.interaction.v1";

export const DEFAULT_INTERACTION_PREFERENCES: InteractionPreferences = {
  browserEnabled: true,
  desktopEnabled: false,
  diagnosticsEnabled: false,
  developerModeEnabled: false,
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function validateInteractionPreferences(value: unknown): InteractionPreferences {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_INTERACTION_PREFERENCES };
  }
  const input = value as Record<string, unknown>;
  return {
    browserEnabled:
      typeof input.browserEnabled === "boolean" ? input.browserEnabled : true,
    desktopEnabled:
      typeof input.desktopEnabled === "boolean" ? input.desktopEnabled : false,
    diagnosticsEnabled:
      typeof input.diagnosticsEnabled === "boolean"
        ? input.diagnosticsEnabled
        : false,
    developerModeEnabled:
      typeof input.developerModeEnabled === "boolean"
        ? input.developerModeEnabled
        : false,
  };
}

export function readInteractionPreferences(
  storage: StorageLike | null = defaultStorage(),
): InteractionPreferences {
  if (!storage) return { ...DEFAULT_INTERACTION_PREFERENCES };
  try {
    const current = storage.getItem(INTERACTION_PREFERENCE_STORAGE_KEY);
    if (current) return validateInteractionPreferences(JSON.parse(current));
    for (const key of [
      "orchestrator.computer-use.v3",
      "orchestrator.computer-use.v2",
      "orchestrator.computer-use.v1",
    ]) {
      const legacy = storage.getItem(key);
      if (!legacy) continue;
      const parsed = JSON.parse(legacy) as { enabled?: unknown };
      return {
        ...DEFAULT_INTERACTION_PREFERENCES,
        browserEnabled:
          typeof parsed.enabled === "boolean" ? parsed.enabled : true,
      };
    }
  } catch {
    return { ...DEFAULT_INTERACTION_PREFERENCES };
  }
  return { ...DEFAULT_INTERACTION_PREFERENCES };
}

export function persistInteractionPreferences(
  preferences: InteractionPreferences,
  storage: StorageLike | null = defaultStorage(),
) {
  if (!storage) return;
  try {
    storage.setItem(
      INTERACTION_PREFERENCE_STORAGE_KEY,
      JSON.stringify(validateInteractionPreferences(preferences)),
    );
  } catch {
    // The in-memory application state remains authoritative for this session.
  }
}
