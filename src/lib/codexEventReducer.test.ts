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
  it("keeps Plan deltas as preview text and gates only the completed plan item", () => {
    let state: RunViewState = {
      ...emptyRunView,
      status: "running",
      turnId: "turn-plan",
      nativePlan: {
        ...emptyRunView.nativePlan,
        intent: "plan",
        mode: "plan",
        phase: "drafting",
      },
    };
    state = applyCodexMessage(state, {
      method: "item/plan/delta",
      params: { itemId: "plan-1", delta: "Preview that may " },
    });
    state = applyCodexMessage(state, {
      method: "item/plan/delta",
      params: { itemId: "plan-1", delta: "change" },
    });

    expect(state.nativePlan.previewText).toBe("Preview that may change");
    expect(state.nativePlan.completedText).toBe("");
    expect(state.nativePlan.reviewState).toBe("none");
    expect(state.console).toHaveLength(0);

    state = applyCodexMessage(state, {
      method: "item/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-plan",
        item: { type: "plan", id: "plan-1", text: "Final authoritative plan" },
      },
    });
    expect(state.nativePlan.completedText).toBe("Final authoritative plan");
    expect(state.nativePlan.reviewState).toBe("none");

    state = applyCodexMessage(state, {
      method: "turn/completed",
      params: { turn: { id: "turn-plan", status: "completed" } },
    });
    expect(state.nativePlan.phase).toBe("awaiting-approval");
    expect(state.nativePlan.reviewState).toBe("available");
  });

  it("projects structured questions and serverRequest resolution into Plan phase", () => {
    const request = {
      id: "question-1",
      method: "item/tool/requestUserInput",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "tool-1",
        questions: [],
        autoResolutionMs: null,
      },
    };
    let state = addServerRequest(
      {
        ...emptyRunView,
        nativePlan: {
          ...emptyRunView.nativePlan,
          intent: "plan",
          mode: "plan",
          phase: "drafting",
        },
      },
      request,
    );
    state = addServerRequest(state, request);
    expect(state.serverRequests).toHaveLength(1);
    expect(state.nativePlan.phase).toBe("awaiting-clarification");

    state = applyCodexMessage(state, {
      method: "serverRequest/resolved",
      params: { requestId: "question-1" },
    });
    expect(state.serverRequests).toHaveLength(0);
    expect(state.nativePlan.phase).toBe("drafting");
  });

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

  it("streams commentary assistant deltas without adding them to the final message", () => {
    let state = applyCodexMessage(emptyRunView, {
      method: "item/agentMessage/delta",
      params: { itemId: "commentary-1", delta: "I will inspect the repo." },
    });
    state = applyCodexMessage(state, {
      method: "item/completed",
      params: {
        item: {
          type: "agentMessage",
          id: "commentary-1",
          text: "I will inspect the repo.",
          phase: "commentary",
        },
      },
    });

    expect(state.finalMessage).toBe("");
    expect(state.console).toHaveLength(1);
    expect(state.streamEvents).toHaveLength(1);
    expect(state.streamEvents[0]).toMatchObject({
      kind: "message",
      text: "I will inspect the repo.",
      activityIds: ["commentary-1"],
    });
  });

  it("uses final-answer assistant messages as the completed summary", () => {
    let state = applyCodexMessage(emptyRunView, {
      method: "item/agentMessage/delta",
      params: { itemId: "final-1", delta: "Done" },
    });
    state = applyCodexMessage(state, {
      method: "item/agentMessage/delta",
      params: { itemId: "final-1", delta: "." },
    });
    state = applyCodexMessage(state, {
      method: "item/completed",
      params: {
        item: {
          type: "agentMessage",
          id: "final-1",
          text: "Done.",
          phase: "final_answer",
        },
      },
    });

    expect(state.finalMessage).toBe("Done.");
    expect(state.finalMessageItemId).toBe("final-1");
    expect(state.streamEvents[0]).toMatchObject({
      kind: "message",
      text: "Done.",
      activityIds: ["final-1"],
    });
  });

  it("keeps streamed narration out of the summary when a final answer arrives", () => {
    let state = applyCodexMessage(emptyRunView, {
      method: "item/agentMessage/delta",
      params: { itemId: "commentary-1", delta: "I will inspect first." },
    });
    state = applyCodexMessage(state, {
      method: "item/completed",
      params: {
        item: {
          type: "agentMessage",
          id: "commentary-1",
          text: "I will inspect first.",
          phase: "commentary",
        },
      },
    });
    state = applyCodexMessage(state, {
      method: "item/agentMessage/delta",
      params: { itemId: "final-1", delta: "Added `hello-world.txt`." },
    });
    state = applyCodexMessage(state, {
      method: "item/completed",
      params: {
        item: {
          type: "agentMessage",
          id: "final-1",
          text: "Added `hello-world.txt`.",
          phase: "final_answer",
        },
      },
    });

    expect(state.finalMessage).toBe("Added `hello-world.txt`.");
    expect(state.streamEvents[0]).toMatchObject({
      kind: "message",
      text: "I will inspect first.",
      activityIds: ["commentary-1"],
    });
    expect(state.streamEvents[1]).toMatchObject({
      kind: "message",
      text: "Added `hello-world.txt`.",
      activityIds: ["final-1"],
    });
  });

  it("uses only final_answer text for real app-server commentary and final item sequences", () => {
    let state = applyCodexMessage(emptyRunView, {
      method: "item/started",
      params: {
        item: {
          type: "agentMessage",
          id: "msg-commentary-1",
          text: "",
          phase: "commentary",
        },
      },
    });
    for (const delta of [
      "I’ll inspect the repo shape first, ",
      "then add the smallest appropriate text file.",
    ]) {
      state = applyCodexMessage(state, {
        method: "item/agentMessage/delta",
        params: { itemId: "msg-commentary-1", delta },
      });
    }
    state = applyCodexMessage(state, {
      method: "item/completed",
      params: {
        item: {
          type: "agentMessage",
          id: "msg-commentary-1",
          text: "I’ll inspect the repo shape first, then add the smallest appropriate text file.",
          phase: "commentary",
        },
      },
    });
    state = applyCodexMessage(state, {
      method: "item/started",
      params: {
        item: {
          type: "agentMessage",
          id: "msg-final-1",
          text: "",
          phase: "final_answer",
        },
      },
    });
    for (const delta of [
      "Added [hello-world.txt](/repo/hello-world.txt) containing:\n\n",
      "```text\nhello world\n```\n\n",
      "Verification run:\n- `pwd` confirmed the selected repo.",
    ]) {
      state = applyCodexMessage(state, {
        method: "item/agentMessage/delta",
        params: { itemId: "msg-final-1", delta },
      });
    }
    state = applyCodexMessage(state, {
      method: "item/completed",
      params: {
        item: {
          type: "agentMessage",
          id: "msg-final-1",
          text: [
            "Added [hello-world.txt](/repo/hello-world.txt) containing:",
            "",
            "```text",
            "hello world",
            "```",
            "",
            "Verification run:",
            "- `pwd` confirmed the selected repo.",
          ].join("\n"),
          phase: "final_answer",
        },
      },
    });

    expect(state.finalMessage).toContain("Added [hello-world.txt]");
    expect(state.finalMessage).toContain("Verification run:");
    expect(state.finalMessage).not.toContain("I’ll inspect the repo shape first");
    expect(state.agentMessagesById["msg-commentary-1"]).toMatchObject({
      phase: "commentary",
    });
    expect(state.streamEvents[state.streamEvents.length - 1]).toMatchObject({
      kind: "message",
      activityIds: ["msg-final-1"],
    });
    expect(state.finalMessageItemId).toBe("msg-final-1");
  });

  it("falls back to the latest completed assistant message when phase is missing", () => {
    let state = applyCodexMessage(emptyRunView, {
      method: "item/agentMessage/delta",
      params: { itemId: "legacy-1", delta: "Interim text." },
    });
    state = applyCodexMessage(state, {
      method: "item/completed",
      params: {
        item: {
          type: "agentMessage",
          id: "legacy-1",
          text: "Interim text.",
        },
      },
    });
    state = applyCodexMessage(state, {
      method: "item/agentMessage/delta",
      params: { itemId: "legacy-2", delta: "Final text." },
    });
    state = applyCodexMessage(state, {
      method: "item/completed",
      params: {
        item: {
          type: "agentMessage",
          id: "legacy-2",
          text: "Final text.",
        },
      },
    });

    expect(state.finalMessage).toBe("Final text.");
    expect(state.finalMessageItemId).toBe("legacy-2");
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

  it("shows noisy item lifecycle rows as a generic thinking event", () => {
    let state = emptyRunView;

    for (const type of ["userMessage", "reasoning", "fileChange"]) {
      state = applyCodexMessage(state, {
        method: "item/started",
        params: { item: { type } },
      });
      state = applyCodexMessage(state, {
        method: "item/completed",
        params: { item: { type } },
      });
    }

    expect(state.streamEvents).toHaveLength(1);
    expect(state.streamEvents[0]).toMatchObject({
      kind: "activity",
      text: "Thinking",
    });
    expect(
      state.streamEvents.some((event) =>
        /Started|Completed|userMessage|reasoning|fileChange/.test(event.text),
      ),
    ).toBe(false);
    expect(state.console).toHaveLength(0);
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
    expect(state.streamEvents[0]).toMatchObject({
      kind: "file",
      activityIds: ["src/App.tsx", "src/New.ts"],
    });

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
      text: "Running npm test -- --run",
      activityIds: ["cmd-1"],
    });
    expect(state.streamEvents[1]).toMatchObject({
      kind: "command",
      text: "tests passed\n",
      activityIds: ["cmd-1"],
    });
    expect(state.streamEvents[2]).toMatchObject({
      kind: "command",
      text: "Ran npm test -- --run",
      activityIds: ["cmd-1"],
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
