export const COMPUTER_USE_STORAGE_KEY = "orchestrator.computer-use.v1";

export type ComputerUsePreference = {
  enabled: boolean;
};

export const DEFAULT_COMPUTER_USE_PREFERENCE: ComputerUsePreference = {
  enabled: true,
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function validateComputerUsePreference(
  value: unknown,
): ComputerUsePreference {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_COMPUTER_USE_PREFERENCE };
  }
  const enabled = (value as Record<string, unknown>).enabled;
  return {
    enabled: typeof enabled === "boolean" ? enabled : true,
  };
}

export function readComputerUsePreference(
  storage: StorageLike | null = defaultStorage(),
): ComputerUsePreference {
  if (!storage) return { ...DEFAULT_COMPUTER_USE_PREFERENCE };
  try {
    const stored = storage.getItem(COMPUTER_USE_STORAGE_KEY);
    return stored
      ? validateComputerUsePreference(JSON.parse(stored))
      : { ...DEFAULT_COMPUTER_USE_PREFERENCE };
  } catch {
    return { ...DEFAULT_COMPUTER_USE_PREFERENCE };
  }
}

export function persistComputerUsePreference(
  preference: ComputerUsePreference,
  storage: StorageLike | null = defaultStorage(),
) {
  if (!storage) return;
  try {
    storage.setItem(
      COMPUTER_USE_STORAGE_KEY,
      JSON.stringify(validateComputerUsePreference(preference)),
    );
  } catch {
    // The current application session still retains the explicit choice.
  }
}
