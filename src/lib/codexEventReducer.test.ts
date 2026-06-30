import { describe, expect, it } from "vitest";
import {
  addServerRequest,
  applyCodexMessage,
  emptyRunView,
  resolveServerRequest,
  updateRunElapsed,
} from "./codexEventReducer";
import type { RunViewState } from "./codexEventReducer";

describe("codexEventReducer", () => {
  it("tracks thread, turn, and token usage notifications", () => {
    let state = applyCodexMessage(emptyRunView, {
      method: "thread/started",
      params: { thread: { id: "thread-1" } },
    });
    state = applyCodexMessage(state, {
      method: "turn/started",
      params: { turn: { id: "turn-1" } },
    });
    state = applyCodexMessage(state, {
      method: "thread/tokenUsage/updated",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        tokenUsage: {
          total: {
            totalTokens: 120,
            inputTokens: 80,
            cachedInputTokens: 50,
            outputTokens: 30,
            reasoningOutputTokens: 10,
          },
          modelContextWindow: 128000,
        },
      },
    });

    expect(state.threadId).toBe("thread-1");
    expect(state.turnId).toBe("turn-1");
    expect(state.tokenUsage?.totalTokens).toBe(120);
    expect(state.tokenUsage?.cachedInputTokens).toBe(50);
  });

  it("aggregates assistant deltas into the final message", () => {
    let state = applyCodexMessage(emptyRunView, {
      method: "item/agentMessage/delta",
      params: { delta: "Done" },
    });
    state = applyCodexMessage(state, {
      method: "item/agentMessage/delta",
      params: { delta: "." },
    });

    expect(state.finalMessage).toBe("Done.");
    expect(state.console).toHaveLength(1);
    expect(state.streamEvents).toHaveLength(1);
    expect(state.streamEvents[0]).toMatchObject({
      kind: "message",
      text: "Done.",
    });
  });

  it("tracks stream events and elapsed run time", () => {
    let state: RunViewState = {
      ...emptyRunView,
      startedAt: "2026-06-30T17:00:00.000Z",
      status: "running" as const,
    };

    state = updateRunElapsed(state, "2026-06-30T17:00:05.000Z");
    state = applyCodexMessage(state, {
      method: "item/commandExecution/outputDelta",
      params: { delta: "npm test\n" },
    });
    state = applyCodexMessage(state, {
      method: "turn/completed",
      params: { turn: { status: "completed", durationMs: 1234 } },
    });

    expect(state.elapsedMs).toBe(1234);
    expect(state.status).toBe("completed");
    expect(state.completedAt).not.toBeNull();
    expect(state.streamEvents[0]).toMatchObject({
      kind: "command",
      text: "npm test\n",
    });
  });

  it("groups edited files from unified diff notifications", () => {
    let state = applyCodexMessage(emptyRunView, {
      method: "turn/diff/updated",
      params: {
        diff: [
          "diff --git a/src/App.tsx b/src/App.tsx",
          "--- a/src/App.tsx",
          "+++ b/src/App.tsx",
          "@@ -1,2 +1,3 @@",
          " const value = 1;",
          "-const oldValue = 2;",
          "+const newValue = 2;",
          "+const extraValue = 3;",
          "diff --git a/src/New.ts b/src/New.ts",
          "--- /dev/null",
          "+++ b/src/New.ts",
          "@@ -0,0 +1 @@",
          "+export const created = true;",
        ].join("\n"),
      },
    });

    expect(state.editedFiles).toEqual([
      {
        path: "src/App.tsx",
        name: "App.tsx",
        additions: 2,
        deletions: 1,
        status: "modified",
      },
      {
        path: "src/New.ts",
        name: "New.ts",
        additions: 1,
        deletions: 0,
        status: "added",
      },
    ]);

    state = applyCodexMessage(state, {
      method: "turn/diff/updated",
      params: {
        diff: [
          "diff --git a/src/App.tsx b/src/App.tsx",
          "--- a/src/App.tsx",
          "+++ b/src/App.tsx",
          "@@ -1 +1,4 @@",
          "-const value = 1;",
          "+const value = 2;",
          "+const anotherValue = 3;",
          "+const finalValue = 4;",
        ].join("\n"),
      },
    });

    expect(state.editedFiles).toHaveLength(2);
    expect(state.editedFiles[0]).toMatchObject({
      path: "src/App.tsx",
      additions: 3,
      deletions: 1,
    });
  });

  it("groups command starts, output, completion, and duration", () => {
    let state = applyCodexMessage(emptyRunView, {
      method: "item/commandExecution/started",
      params: { id: "cmd-1", command: "npm test -- --run" },
    });
    state = applyCodexMessage(state, {
      method: "item/commandExecution/outputDelta",
      params: { id: "cmd-1", delta: "tests passed\n" },
    });
    state = applyCodexMessage(state, {
      method: "item/commandExecution/completed",
      params: { id: "cmd-1", command: "npm test -- --run", durationMs: 12_000 },
    });

    expect(state.commands).toEqual([
      {
        id: "cmd-1",
        command: "npm test -- --run",
        status: "completed",
        durationMs: 12_000,
        output: "tests passed\n",
      },
    ]);
    expect(state.streamEvents[0]).toMatchObject({
      kind: "command",
      text: "tests passed\n",
    });
  });

  it("tracks and resolves server requests", () => {
    const request = {
      id: 9,
      method: "item/commandExecution/requestApproval",
      params: { command: "npm test" },
    };
    const state = addServerRequest(emptyRunView, request);

    expect(state.serverRequests).toHaveLength(1);
    expect(resolveServerRequest(state, 9).serverRequests).toHaveLength(0);
  });
});
