import type { CodexAccessMode } from "../types";

export const CODEX_ACCESS_STORAGE_KEY = "orchestrator.codex-access.v2";
export const LEGACY_CODEX_ACCESS_STORAGE_KEY = "orchestrator.codex-access.v1";
export const ASK_FOR_APPROVAL_PERMISSION_PROFILE =
  "orchestrator_workspace_network_v1";

export type CodexAccessPreference = {
  accessMode: CodexAccessMode;
};

export type CodexAccessSettings = CodexAccessPreference & {
  approvalPolicy: "untrusted" | "never";
  permissionProfile:
    | typeof ASK_FOR_APPROVAL_PERMISSION_PROFILE
    | ":danger-full-access";
  sandbox: "workspace-write" | "danger-full-access";
};

export const DEFAULT_CODEX_ACCESS: CodexAccessPreference = {
  accessMode: "ask-for-approval",
};

export function accessSettings(
  preference: CodexAccessPreference,
): CodexAccessSettings {
  return {
    ...preference,
    approvalPolicy:
      preference.accessMode === "full-access" ? "never" : "untrusted",
    permissionProfile:
      preference.accessMode === "full-access"
        ? ":danger-full-access"
        : ASK_FOR_APPROVAL_PERMISSION_PROFILE,
    sandbox:
      preference.accessMode === "full-access"
        ? "danger-full-access"
        : "workspace-write",
  };
}

export function readCodexAccessPreference(
  storage: Pick<Storage, "getItem"> = window.localStorage,
): CodexAccessPreference {
  try {
    const raw = storage.getItem(CODEX_ACCESS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return isCodexAccessMode(parsed.accessMode)
        ? { accessMode: parsed.accessMode }
        : DEFAULT_CODEX_ACCESS;
    }

    const legacyRaw = storage.getItem(LEGACY_CODEX_ACCESS_STORAGE_KEY);
    if (!legacyRaw) return DEFAULT_CODEX_ACCESS;
    const legacy = JSON.parse(legacyRaw) as Record<string, unknown>;
    return {
      accessMode:
        legacy.approvalMode === "automatic" && legacy.sandboxMode === "full"
          ? "full-access"
          : "ask-for-approval",
    };
  } catch {
    // Fall through to the safe application default.
  }
  return DEFAULT_CODEX_ACCESS;
}

export function persistCodexAccessPreference(
  preference: CodexAccessPreference,
  storage: Pick<Storage, "setItem"> = window.localStorage,
) {
  try {
    storage.setItem(CODEX_ACCESS_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // The explicit choice still applies to the current application session.
  }
}

export function accessModeWarning(mode: CodexAccessMode) {
  return mode === "full-access"
    ? "Full access removes Codex's filesystem and network sandbox and disables native approval prompts. Continue?"
    : null;
}

function isCodexAccessMode(value: unknown): value is CodexAccessMode {
  return value === "ask-for-approval" || value === "full-access";
}
