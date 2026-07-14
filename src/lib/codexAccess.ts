import type { ApprovalMode, SandboxAccessMode } from "../types";

export const CODEX_ACCESS_STORAGE_KEY = "orchestrator.codex-access.v1";

export type CodexAccessPreference = {
  approvalMode: ApprovalMode;
  sandboxMode: SandboxAccessMode;
};

export type CodexAccessSettings = CodexAccessPreference & {
  approvalPolicy: "untrusted" | "on-request" | "never";
  permissionProfile: ":read-only" | ":workspace" | ":danger-full-access";
  sandbox: "read-only" | "workspace-write" | "danger-full-access";
};

export const DEFAULT_CODEX_ACCESS: CodexAccessPreference = {
  approvalMode: "on-request",
  sandboxMode: "workspace",
};

export function accessSettings(
  preference: CodexAccessPreference,
): CodexAccessSettings {
  return {
    ...preference,
    approvalPolicy:
      preference.approvalMode === "strict"
        ? "untrusted"
        : preference.approvalMode === "automatic"
          ? "never"
          : "on-request",
    permissionProfile:
      preference.sandboxMode === "read-only"
        ? ":read-only"
        : preference.sandboxMode === "full"
          ? ":danger-full-access"
          : ":workspace",
    sandbox:
      preference.sandboxMode === "read-only"
        ? "read-only"
        : preference.sandboxMode === "full"
          ? "danger-full-access"
          : "workspace-write",
  };
}

export function readCodexAccessPreference(
  storage: Pick<Storage, "getItem"> = window.localStorage,
): CodexAccessPreference {
  try {
    const raw = storage.getItem(CODEX_ACCESS_STORAGE_KEY);
    if (!raw) return DEFAULT_CODEX_ACCESS;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      isApprovalMode(parsed.approvalMode) &&
      isSandboxAccessMode(parsed.sandboxMode)
    ) {
      return {
        approvalMode: parsed.approvalMode,
        sandboxMode: parsed.sandboxMode,
      };
    }
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

export function approvalModeWarning(mode: ApprovalMode) {
  return mode === "automatic"
    ? "Automatic execution disables native approval prompts. Commands remain constrained by the selected sandbox, and blocked actions fail instead of asking. Continue?"
    : null;
}

export function sandboxModeWarning(mode: SandboxAccessMode) {
  return mode === "full"
    ? "Full access removes Codex's filesystem and network sandbox. Approval prompts may not appear because commands no longer need to cross a sandbox boundary. Continue?"
    : null;
}

function isApprovalMode(value: unknown): value is ApprovalMode {
  return value === "strict" || value === "on-request" || value === "automatic";
}

function isSandboxAccessMode(value: unknown): value is SandboxAccessMode {
  return value === "read-only" || value === "workspace" || value === "full";
}
