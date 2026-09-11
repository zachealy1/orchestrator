import { describe, expect, it } from "vitest";
import {
  addSteerPrompt,
  applyCodexMessage,
  emptyRunView,
  settleSteerPrompt,
  type RunToolActivity,
  type RunViewState,
} from "./codexEventReducer";
import { buildTimelineItems, splitTimelineAtSteers } from "./runTimeline";

const timestamp = "2026-09-11T12:00:00Z";
const steer = (id: string) => ({ id, text: id, timestamp, contextFiles: [] });
const reasoning = (text: string) => ({
  method: "item/reasoning/textDelta", params: { delta: text },
});
const tool = (id: string): RunToolActivity => ({
  id, category: "integration", server: "test", tool: id, label: id,
  status: "completed", startedAt: null, completedAt: null, durationMs: null, safeDetails: [],
});

describe("steer stream boundaries", () => {
  it.each(["item/reasoning/textDelta", "item/agentMessage/delta"])(
    "splits %s deltas at dispatch and preserves the position through acknowledgement",
    (method) => {
      const delta = (text: string) => ({ method, params: { delta: text, itemId: "message" } });
      let state = applyCodexMessage(emptyRunView, delta("Before"));
      state = addSteerPrompt(state, steer("steer:1"));
      const boundary = state.streamEvents[1];
      state = applyCodexMessage(state, delta("During"));
      state = settleSteerPrompt(state, "steer:1", true);
      state = applyCodexMessage(state, delta(" after"));
      expect(state.streamEvents.map((event) => event.text)).toEqual(["Before", "steer:1", "During after"]);
      expect(state.streamEvents[1]).toEqual({ ...boundary, delivery: "sent" });
      expect(addSteerPrompt(state, steer("steer:1"))).toBe(state);
      expect(settleSteerPrompt(state, "steer:1", true)).toBe(state);
      expect(settleSteerPrompt(state, "steer:1", false)).toBe(state);
    },
  );

  it("keeps consecutive steers ordered with equal timestamps and no initial output", () => {
    let state = addSteerPrompt(emptyRunView, steer("steer:1"));
    state = addSteerPrompt(state, steer("steer:2"));
    state = applyCodexMessage(state, reasoning("After both"));
    const items = buildTimelineItems(state);
    expect(items.map((item) => item.kind)).toEqual(["steer", "steer", "event"]);
    expect(splitTimelineAtSteers(items).map((section) => section.id)).toEqual(["initial", "steer:1", "steer:2"]);
  });

  it("removes only the rejected prompt and places its retry at the new dispatch point", () => {
    let state = applyCodexMessage(emptyRunView, reasoning("Before"));
    state = addSteerPrompt(state, steer("steer:1"));
    state = applyCodexMessage(state, reasoning("During rejected delivery"));
    state = settleSteerPrompt(state, "steer:1", false);
    expect(state.streamEvents.map((event) => event.text)).toEqual(["Before", "During rejected delivery"]);
    state = addSteerPrompt(state, steer("steer:1"));
    state = applyCodexMessage(state, reasoning("After retry"));
    expect(state.streamEvents.map((event) => event.text)).toEqual(["Before", "During rejected delivery", "steer:1", "After retry"]);
  });

  it("does not duplicate the steer when native user-message notifications arrive", () => {
    let state = addSteerPrompt(emptyRunView, steer("steer:1"));
    for (const method of ["item/started", "item/completed", "item/completed"]) {
      state = applyCodexMessage(state, {
        method, params: { item: { id: "native-user-1", type: "userMessage", content: [{ type: "text", text: "steer:1" }] } },
      });
    }
    expect(state.streamEvents.filter((event) => event.kind === "steer")).toHaveLength(1);
    expect(state.streamEvents.filter((event) => event.text === "steer:1")).toHaveLength(1);
  });

  it("anchors already-visible activity without event references before a steer", () => {
    const state = addSteerPrompt({
      ...emptyRunView,
      commands: [{ id: "cmd", command: "npm test", status: "running", durationMs: null, output: "" }],
      toolActivityOrder: ["tool"], toolActivitiesById: { tool: tool("tool") },
    }, steer("steer:1"));
    expect(buildTimelineItems(state).map((item) => item.kind)).toEqual(["commands", "tools", "steer"]);
  });

  it("groups tools and commands within their first section even when they finish after a steer", () => {
    const state: RunViewState = {
      ...emptyRunView,
      commands: ["cmd-before", "cmd-after"].map((id) => ({ id, command: id, status: "completed", durationMs: 100, output: "" })),
      toolActivityOrder: ["tool-before", "tool-after"],
      toolActivitiesById: { "tool-before": tool("tool-before"), "tool-after": tool("tool-after") },
      streamEvents: [
        { id: "c1", kind: "command", text: "Before command", timestamp, activityIds: ["cmd-before"] },
        { id: "t1", kind: "activity", text: "Before tool", timestamp, activityIds: ["tool-before"] },
        { ...steer("steer:1"), kind: "steer", delivery: "sent" },
        { id: "c1-done", kind: "command", text: "Before command finished", timestamp, activityIds: ["cmd-before"] },
        { id: "t1-done", kind: "activity", text: "Before tool finished", timestamp, activityIds: ["tool-before"] },
        { id: "c2", kind: "command", text: "After command", timestamp, activityIds: ["cmd-after"] },
        { id: "t2", kind: "activity", text: "After tool", timestamp, activityIds: ["tool-after"] },
      ],
    };
    const sections = splitTimelineAtSteers(buildTimelineItems(state));
    const ids = (index: number) => sections[index].items.flatMap((item) =>
      item.kind === "commands" ? item.commands.map((command) => command.id)
        : item.kind === "tools" ? item.activities.map((activity) => activity.id) : [],
    );
    expect(ids(0)).toEqual(["cmd-before", "tool-before"]);
    expect(ids(1)).toEqual(["cmd-after", "tool-after"]);
    expect(sections.flatMap((section) => section.items).filter((item) => item.kind === "event")).toEqual([]);
  });
});
