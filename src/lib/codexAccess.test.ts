import { describe, expect, it } from "vitest";
import {
  CODEX_ACCESS_STORAGE_KEY,
  DEFAULT_CODEX_ACCESS,
  accessSettings,
  approvalModeWarning,
  persistCodexAccessPreference,
  readCodexAccessPreference,
  sandboxModeWarning,
} from "./codexAccess";

describe("Codex access settings", () => {
  it("maps the three native approval policies without changing sandbox scope", () => {
    expect(
      accessSettings({ approvalMode: "strict", sandboxMode: "workspace" }),
    ).toMatchObject({
      approvalPolicy: "untrusted",
      permissionProfile: ":workspace",
      sandbox: "workspace-write",
    });
    expect(
      accessSettings({ approvalMode: "on-request", sandboxMode: "workspace" }),
    ).toMatchObject({ approvalPolicy: "on-request" });
    expect(
      accessSettings({ approvalMode: "automatic", sandboxMode: "workspace" }),
    ).toMatchObject({
      approvalPolicy: "never",
      permissionProfile: ":workspace",
    });
  });

  it("maps native permission profiles independently from approval policy", () => {
    expect(
      accessSettings({ approvalMode: "on-request", sandboxMode: "read-only" }),
    ).toMatchObject({ permissionProfile: ":read-only", sandbox: "read-only" });
    expect(
      accessSettings({ approvalMode: "on-request", sandboxMode: "full" }),
    ).toMatchObject({
      permissionProfile: ":danger-full-access",
      sandbox: "danger-full-access",
    });
  });

  it("uses the safe coding default and rejects malformed persisted settings", () => {
    expect(readCodexAccessPreference({ getItem: () => null })).toEqual(
      DEFAULT_CODEX_ACCESS,
    );
    expect(
      readCodexAccessPreference({
        getItem: () => JSON.stringify({ approvalMode: "never", sandboxMode: "all" }),
      }),
    ).toEqual(DEFAULT_CODEX_ACCESS);
  });

  it("persists only an explicit validated preference payload", () => {
    const values = new Map<string, string>();
    persistCodexAccessPreference(
      { approvalMode: "strict", sandboxMode: "read-only" },
      { setItem: (key, value) => void values.set(key, value) },
    );
    expect(JSON.parse(values.get(CODEX_ACCESS_STORAGE_KEY)!)).toEqual({
      approvalMode: "strict",
      sandboxMode: "read-only",
    });
  });

  it("warns only for settings that remove prompts or the sandbox", () => {
    expect(approvalModeWarning("on-request")).toBeNull();
    expect(approvalModeWarning("strict")).toBeNull();
    expect(approvalModeWarning("automatic")).toMatch(/disables native approval/i);
    expect(sandboxModeWarning("workspace")).toBeNull();
    expect(sandboxModeWarning("full")).toMatch(/removes codex's filesystem/i);
  });
});
