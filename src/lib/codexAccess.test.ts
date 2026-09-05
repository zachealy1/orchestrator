import { describe, expect, it } from "vitest";
import {
  ASK_FOR_APPROVAL_PERMISSION_PROFILE,
  CODEX_ACCESS_STORAGE_KEY,
  DEFAULT_CODEX_ACCESS,
  LEGACY_CODEX_ACCESS_STORAGE_KEY,
  PLAN_READ_ONLY_PERMISSION_PROFILE,
  accessModeWarning,
  accessSettings,
  accessSettingsForRun,
  persistCodexAccessPreference,
  readCodexAccessPreference,
} from "./codexAccess";

describe("Codex access settings", () => {
  it("maps Ask for approval to native user-reviewed workspace access", () => {
    expect(accessSettings({ accessMode: "ask-for-approval" })).toEqual({
      accessMode: "ask-for-approval",
      approvalPolicy: "untrusted",
      permissionProfile: ASK_FOR_APPROVAL_PERMISSION_PROFILE,
      sandbox: "workspace-write",
    });
  });

  it("maps Full access to unsandboxed execution without approval prompts", () => {
    expect(accessSettings({ accessMode: "full-access" })).toEqual({
      accessMode: "full-access",
      approvalPolicy: "never",
      permissionProfile: ":danger-full-access",
      sandbox: "danger-full-access",
    });
  });

  it.each(["ask-for-approval", "full-access"] as const)(
    "enforces native read-only access for Plan runs requested with %s",
    (accessMode) => {
      expect(accessSettingsForRun({ accessMode }, "plan")).toEqual({
        accessMode,
        approvalPolicy: "never",
        permissionProfile: PLAN_READ_ONLY_PERMISSION_PROFILE,
        sandbox: "read-only",
      });
    },
  );

  it("preserves the selected access behavior for implementation runs", () => {
    expect(accessSettingsForRun({ accessMode: "full-access" }, "run")).toEqual(
      accessSettings({ accessMode: "full-access" }),
    );
  });

  it("uses the safe coding default and rejects malformed persisted settings", () => {
    expect(readCodexAccessPreference({ getItem: () => null })).toEqual(
      DEFAULT_CODEX_ACCESS,
    );
    expect(
      readCodexAccessPreference({
        getItem: () => JSON.stringify({ accessMode: "automatic" }),
      }),
    ).toEqual(DEFAULT_CODEX_ACCESS);
  });

  it("migrates only the fully permissive legacy pair to Full access", () => {
    const readPreference = (legacy: Record<string, unknown>) =>
      readCodexAccessPreference({
        getItem: (key) =>
          key === LEGACY_CODEX_ACCESS_STORAGE_KEY
            ? JSON.stringify(legacy)
            : null,
      });

    expect(
      readPreference({ approvalMode: "automatic", sandboxMode: "full" }),
    ).toEqual({ accessMode: "full-access" });
    expect(
      readPreference({ approvalMode: "strict", sandboxMode: "full" }),
    ).toEqual({ accessMode: "ask-for-approval" });
    expect(
      readPreference({ approvalMode: "automatic", sandboxMode: "workspace" }),
    ).toEqual({ accessMode: "ask-for-approval" });
  });

  it("prefers a valid v2 setting over the legacy preference", () => {
    expect(
      readCodexAccessPreference({
        getItem: (key) =>
          key === CODEX_ACCESS_STORAGE_KEY
            ? JSON.stringify({ accessMode: "ask-for-approval" })
            : JSON.stringify({ approvalMode: "automatic", sandboxMode: "full" }),
      }),
    ).toEqual({ accessMode: "ask-for-approval" });
  });

  it("persists only the consolidated access mode", () => {
    const values = new Map<string, string>();
    persistCodexAccessPreference(
      { accessMode: "full-access" },
      { setItem: (key, value) => void values.set(key, value) },
    );
    expect(JSON.parse(values.get(CODEX_ACCESS_STORAGE_KEY)!)).toEqual({
      accessMode: "full-access",
    });
  });

  it("warns only before enabling Full access", () => {
    expect(accessModeWarning("ask-for-approval")).toBeNull();
    expect(accessModeWarning("full-access")).toMatch(
      /removes codex's filesystem.*disables native approval prompts/i,
    );
  });
});
