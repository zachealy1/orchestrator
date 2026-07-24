import { describe, expect, it } from "vitest";
import {
  createRunExecutionSettings,
  parseRunExecutionSettings,
  resolveStoredRunExecutionSettings,
  serializeRunExecutionSettings,
} from "./runExecutionSettings";

describe("run execution settings", () => {
  it("round-trips every setting needed to rerun an edited prompt", () => {
    const settings = createRunExecutionSettings({
      accountId: 7,
      profileKey: "account:7",
      selectedBranch: "feature/original",
      mode: "plan",
      intent: "plan",
      accessMode: "full-access",
      computerUseEnabled: true,
      model: "gpt-5.5",
      reasoningEffort: "high",
      useOss: false,
      ossProvider: "lmstudio",
      contextFiles: [
        {
          path: "/workspace/src/App.tsx",
          name: "App.tsx",
          relativePath: "src/App.tsx",
          source: "search",
          status: "ready",
        },
      ],
      selectedSkills: [
        {
          id: "frontend",
          name: "Frontend",
          description: "Build frontend changes",
        },
      ],
      goalMode: true,
    });

    expect(parseRunExecutionSettings(serializeRunExecutionSettings(settings))).toEqual(
      settings,
    );
  });

  it("rejects malformed enums and nested values instead of partially applying them", () => {
    const malformed = JSON.stringify({
      version: 1,
      accountId: 7,
      profileKey: "account:8",
      selectedBranch: "main",
      mode: "run",
      intent: "normal",
      accessMode: "unsafe",
      computerUseEnabled: true,
      model: "gpt-5.5",
      reasoningEffort: "high",
      useOss: false,
      ossProvider: "ollama",
      contextFiles: [{ path: "/workspace/file.ts" }],
      selectedSkills: [],
      goalMode: false,
    });

    expect(parseRunExecutionSettings(malformed)).toBeNull();
    expect(parseRunExecutionSettings("{not json")).toBeNull();
  });

  it("reconstructs legacy rows conservatively and marks the result", () => {
    const resolved = resolveStoredRunExecutionSettings(null, {
      account_id: 7,
      model: "gpt-5.5",
      model_provider: null,
      sandbox: "workspace-write",
      approval_policy: "untrusted",
      collaboration_mode: "plan",
      run_intent: "plan",
    });

    expect(resolved).toEqual({
      source: "legacy",
      settings: expect.objectContaining({
        version: 1,
        accountId: 7,
        profileKey: "account:7",
        selectedBranch: null,
        mode: "plan",
        intent: "plan",
        accessMode: "ask-for-approval",
        computerUseEnabled: false,
        model: "gpt-5.5",
        reasoningEffort: null,
        contextFiles: [],
        selectedSkills: [],
        goalMode: false,
      }),
    });
  });

  it("uses the legacy path when stored JSON is invalid", () => {
    const resolved = resolveStoredRunExecutionSettings('{"version":99}', {
      account_id: 4,
      model: null,
      model_provider: "oss",
      sandbox: "danger-full-access",
      approval_policy: "never",
      collaboration_mode: "default",
      run_intent: "normal",
    });

    expect(resolved.source).toBe("legacy");
    expect(resolved.settings).toEqual(
      expect.objectContaining({
        accountId: 4,
        profileKey: "account:4",
        accessMode: "full-access",
        useOss: true,
        ossProvider: "ollama",
      }),
    );
  });
});
