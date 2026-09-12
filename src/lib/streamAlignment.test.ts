import { describe, expect, it } from "vitest";
import {
  applyCodexMessage,
  emptyRunView,
  addSteerPrompt,
} from "./codexEventReducer";
import type { CodexMessage } from "../features/codex/types";
import { buildTimelineItems } from "./runTimeline";
import { coalesceFrameBatchedCodexMessages } from "./codexNotificationBatch";
const event = (
  method: string,
  params: Record<string, unknown>,
): CodexMessage => ({
  method,
  params: { threadId: "thread", turnId: "turn", itemId: "item", ...params },
});
const replay = (events: CodexMessage[]) =>
  events.reduce(applyCodexMessage, emptyRunView);
const visibleText = (state: typeof emptyRunView) =>
  buildTimelineItems(state).flatMap((item) =>
    item.kind === "event" ? [item.event.text] : [],
  );

describe("stream alignment", () => {
  it("separates reasoning parts, prefers summaries, and reconciles final parts", () => {
    const events = [
      event("item/reasoning/textDelta", { contentIndex: 0, delta: "raw" }),
      event("item/reasoning/summaryTextDelta", {
        summaryIndex: 0,
        delta: "first",
      }),
      event("item/reasoning/summaryPartAdded", { summaryIndex: 1 }),
      event("item/reasoning/summaryTextDelta", {
        summaryIndex: 1,
        delta: "second",
      }),
    ];
    expect(visibleText(replay(events))).toEqual(["first", "second"]);
    const completed = event("item/completed", {
      item: {
        id: "item",
        type: "reasoning",
        summary: ["corrected", "final"],
        content: ["raw final"],
      },
    });
    const state = replay([
      ...events,
      completed,
      completed,
      event("item/reasoning/summaryTextDelta", { delta: "late" }),
    ]);
    expect(visibleText(state)).toEqual(["corrected", "final"]);
    expect(
      coalesceFrameBatchedCodexMessages([events[1], events[3]]),
    ).toHaveLength(2);
  });
  it("replaces commentary in place, including completion without deltas", () => {
    const delta = event("item/agentMessage/delta", { delta: "draft" });
    const done = event("item/completed", {
      item: {
        id: "item",
        type: "agentMessage",
        phase: "commentary",
        text: "corrected",
      },
    });
    const state = replay([
      delta,
      done,
      done,
      event("item/agentMessage/delta", { delta: "late" }),
    ]);
    expect(visibleText(state)).toEqual(["corrected"]);
    expect(state.streamEvents[0].id).toBe(replay([delta]).streamEvents[0].id);
    expect(visibleText(replay([done]))).toEqual(["corrected"]);
  });
  it("keeps user steering between fragments when authoritative text arrives", () => {
    let state = replay([event("item/agentMessage/delta", { delta: "before" })]);
    state = addSteerPrompt(state, {
      id: "steer",
      text: "change",
      contextFiles: [],
      timestamp: "now",
    });
    state = applyCodexMessage(
      state,
      event("item/agentMessage/delta", { delta: " after" }),
    );
    state = applyCodexMessage(
      state,
      event("item/completed", {
        item: {
          id: "item",
          type: "agentMessage",
          phase: "commentary",
          text: "before corrected",
        },
      }),
    );
    expect(state.streamEvents.map((item) => item.text)).toEqual([
      "before",
      "change",
      " corrected",
    ]);
  });
  it("keeps tools separated by commentary and groups only adjacent tools", () => {
    const tool = (id: string) =>
      event("item/started", {
        itemId: id,
        item: { id, type: "mcpToolCall", server: "test", tool: id },
      });
    const state = replay([
      tool("first"),
      event("item/agentMessage/delta", { delta: "between" }),
      tool("second"),
      tool("third"),
    ]);
    const items = buildTimelineItems(state);
    expect(items.map((item) => item.kind)).toEqual(["tools", "event", "tools"]);
    expect(
      items.flatMap((item) =>
        item.kind === "tools"
          ? item.activities.map((activity) => activity.id)
          : [],
      ),
    ).toEqual(["first", "second", "third"]);
  });
  it("reconciles command output and rejects late output after completion", () => {
    const state = replay([
      event("item/started", {
        item: { id: "item", type: "commandExecution", command: "echo hi" },
      }),
      event("item/commandExecution/outputDelta", { delta: "draft" }),
      event("item/completed", {
        item: {
          id: "item",
          type: "commandExecution",
          command: "echo hi",
          status: "completed",
          aggregatedOutput: "hi\n",
        },
      }),
      event("item/started", {
        item: { id: "item", type: "commandExecution", command: "echo hi" },
      }),
      event("item/commandExecution/outputDelta", { delta: "late" }),
    ]);
    expect(state.commands[0]).toMatchObject({
      status: "completed",
      output: "hi\n",
    });
  });
  it("retains partial final answers on interruption and prevents duplicate final completions", () => {
    const started = event("item/started", {
      item: {
        id: "item",
        type: "agentMessage",
        phase: "final_answer",
        text: "",
      },
    });
    const delta = event("item/agentMessage/delta", { delta: "Partial" });
    expect(
      replay([started, delta, event("turn/interrupted", {})]),
    ).toMatchObject({ status: "interrupted", finalMessage: "Partial" });
    const done = event("item/completed", {
      item: {
        id: "item",
        type: "agentMessage",
        phase: "final_answer",
        text: "Final",
      },
    });
    expect(replay([started, delta, done, done]).finalMessage).toBe("Final");
  });
  it("replay from stored protocol events produces the same visible transcript", () => {
    const events = [
      event("item/agentMessage/delta", { delta: "streamed" }),
      event("item/completed", {
        item: {
          id: "item",
          type: "agentMessage",
          phase: "commentary",
          text: "final commentary",
        },
      }),
    ];
    const live = replay(events);
    expect(visibleText(replay(JSON.parse(JSON.stringify(events))))).toEqual(
      visibleText(live),
    );
  });
});

it("anchors final-only reasoning and delayed message deltas at item start", () => {
  const state = replay([
    event("item/started", {
      itemId: "reason",
      item: { id: "reason", type: "reasoning", summary: [], content: [] },
    }),
    event("item/started", {
      item: { id: "item", type: "agentMessage", text: "", phase: "commentary" },
    }),
    event("item/started", {
      itemId: "tool",
      item: { id: "tool", type: "mcpToolCall", server: "test", tool: "fetch" },
    }),
    event("item/completed", {
      itemId: "reason",
      item: {
        id: "reason",
        type: "reasoning",
        summary: ["Reasoned"],
        content: [],
      },
    }),
    event("item/agentMessage/delta", { delta: "Message" }),
  ]);
  expect(
    buildTimelineItems(state).map((item) =>
      item.kind === "event" ? item.event.text : item.kind,
    ),
  ).toEqual(["Reasoned", "Message", "tools"]);
});
