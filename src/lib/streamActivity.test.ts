import { describe, expect, it } from "vitest";
import { activityCategories, activityContent, activitySummary, emptyActivityStore, reduceStreamActivity, standaloneActivity, type StreamActivityStore } from "./streamActivity";
import { applyCodexMessage, emptyRunView, addSteerPrompt, type RunViewState } from "./codexEventReducer";
import { buildTimelineItems } from "./runTimeline";
import { mergeHistoricalActivityStream } from "./historicalActivityStream";
import type { CodexMessage } from "../features/codex/types";

const context = { profileKey: "account:2", threadId: "thread", turnId: "turn" };
const event = (method: string, params: Record<string, unknown>): CodexMessage => ({ method, params: { threadId: "thread", turnId: "turn", ...params } });
const item = (id: string, type: string, extra: Record<string, unknown> = {}) => ({ id, type, ...extra });
const completed = (id: string, type: string, extra: Record<string, unknown> = {}) => event("item/completed", { item: item(id, type, { status: "completed", ...extra }) });
const replay = (events: CodexMessage[]) => events.reduce((s, e) => reduceStreamActivity(s, e, context), emptyActivityStore);
const activities = (s: StreamActivityStore) => s.order.map(k => s.byKey[k]);

describe("structured stream activity", () => {
  it("classifies metadata, never shell text, and keeps compound output together", () => {
    const store = replay([
      completed("read", "commandExecution", { command: "cat a; ls; rg q; npm test", cwd: "/worktree", aggregatedOutput: "one execution", commandActions: [
        { type: "read", path: "a", name: "a", command: "cat a" }, { type: "listFiles", path: ".", command: "ls" },
        { type: "search", query: "q", command: "rg q" }, { type: "unknown", command: "npm test" },
      ] }), completed("unclassified", "commandExecution", { command: "cat a" }),
      completed("edit", "fileChange", { changes: [{ path: "/worktree/a", kind: { type: "update" }, diff: "patch" }] }),
    ]);
    expect(activities(store)).toHaveLength(3);
    expect(activityCategories(activities(store)[0])).toEqual(["Read files", "Ran commands"]);
    expect(activityCategories(activities(store)[1])).toEqual(["Ran commands"]);
    expect(activitySummary(activities(store))).toBe("Edited files, read files, ran commands");
    expect(activities(store)[0].payload).toMatchObject({ cwd: "/worktree", output: "one execution" });
    expect(store.order[0]).toContain("account:2");
  });
  it.each(["read", "search", "listFiles"])("gives %s an exact live label and the exploration category", type => {
    const a = activities(replay([event("item/started", { item: item("c", "commandExecution", { commandActions: [{ type, path: "src", query: "needle" }] }) })]))[0];
    expect(a.label).toMatch(/Reading|Searching|Listing/);
    expect(activityCategories(a)).toEqual(["Read files"]);
  });
  it("replaces edit revisions and retains separate per-edit and final aggregate patches", () => {
    let view: RunViewState = { ...emptyRunView, threadId: "thread", turnId: "turn" };
    for (const e of [event("item/started", { item: item("e", "fileChange", { changes: [{ path: "a", kind: { type: "add" }, diff: "draft" }] }) }),
      event("item/fileChange/patchUpdated", { itemId: "e", changes: [{ path: "a", kind: { type: "update", move_path: "b" }, diff: "revision" }] }),
      completed("e", "fileChange", { changes: [{ path: "a", kind: { type: "update", move_path: "b" }, diff: "final edit" }, { path: "c", kind: { type: "delete" }, diff: "deleted" }] }),
      event("turn/diff/updated", { diff: "diff --git a/b b/b\n--- a/b\n+++ b/b\n@@ -1 +1 @@\n-old\n+new\n" }),
    ]) view = applyCodexMessage(view, e);
    expect(activities(view.activities!)).toHaveLength(1);
    expect(activities(view.activities!)[0].payload).toMatchObject({ changes: [{ path: "a", movePath: "b", diff: "final edit" }, { path: "c", kind: "delete" }] });
    expect(view.editedFiles).toHaveLength(1);
    expect(view.editedFiles[0]).toMatchObject({ additions: 1, deletions: 1 });
    expect(view.latestDiff).toContain("diff --git");
  });
  it("keeps completed items authoritative, deduplicates completion, and rejects foreign events", () => {
    const done = completed("c", "commandExecution", { command: "test", aggregatedOutput: "final", exitCode: 0 });
    const store = replay([done]);
    for (const e of [done, event("item/started", { item: item("c", "commandExecution") }), event("item/commandExecution/outputDelta", { itemId: "c", delta: "late" }), completed("c", "commandExecution", { status: "failed" }), event("item/started", { threadId: "other", item: item("x", "fileChange") })]) {
      expect(reduceStreamActivity(store, e, context)).toBe(store);
    }
  });
  it.each(["declined", "failed", "interrupted"])("preserves %s edits while interrupting unfinished work", status => {
    const store = replay([completed("e", "fileChange", { status }), event("item/started", { item: item("c", "commandExecution") }), event("turn/completed", { turn: { status: "interrupted" } })]);
    expect(activities(store).map(a => a.status)).toEqual([status, "interrupted"]);
  });
  it("attaches approval, progress, and terminal interactions to their owner", () => {
    let store = replay([event("item/started", { item: item("t", "mcpToolCall", { server: "s", tool: "t" }) }), event("item/mcpToolCall/progress", { itemId: "t", message: "Fetching" }), event("item/started", { item: item("c", "commandExecution") }), event("item/commandExecution/terminalInteraction", { itemId: "c", stdin: "y\n" })]);
    expect(activities(store)[0].payload).toMatchObject({ progress: "Fetching" });
    expect(activities(store)[1].payload).toMatchObject({ interactions: ["y\n"] });
    store = reduceStreamActivity(store, event("item/commandExecution/requestApproval", { itemId: "c" }), context);
    expect(activities(store)[1].status).toBe("awaiting-approval");
  });
  it("renders hooks, automatic reviews, compaction and unknown items without raw envelopes", () => {
    const store = replay([event("hook/started", { run: { id: "h", eventName: "PreToolUse", status: "running" } }), event("hook/completed", { run: { id: "h", eventName: "PreToolUse", status: "blocked", entries: [{ kind: "stderr", text: "Policy stopped this hook" }] } }),
      event("item/autoApprovalReview/completed", { reviewId: "r", review: { status: "denied", rationale: "Action rejected" } }), completed("compact", "contextCompaction"), event("thread/compacted", {}), completed("unknown", "futureItem", { internalSecret: "do not expose" })]);
    expect(activities(store)).toHaveLength(4);
    expect(activities(store)[0]).toMatchObject({ status: "failed", label: "Failed: Hook completed: PreToolUse" });
    expect(activities(store)[1].payload).toMatchObject({ detail: "Action rejected" });
    expect(activities(store)[3].payload).toEqual({ kind: "system", detail: "" });
    expect(activities(store).every(standaloneActivity)).toBe(true);
  });
  it("preserves web action metadata, structured results, and widget resource precedence", () => {
    const store = replay([event("item/started", { item: item("w", "webSearch", { action: { type: "findInPage", url: "https://example.com", pattern: "word" } }) }), completed("w", "webSearch"), completed("t", "mcpToolCall", { server: "s", appContext: { resourceUri: "ui://new" }, mcpAppResourceUri: "ui://legacy", result: { structuredContent: { n: 1 }, content: [{ type: "image", data: "abc", mimeType: "image/png" }] } })]);
    expect(activities(store)[0].label).toContain("https://example.com for word");
    expect(activities(store)[1].payload).toMatchObject({ resourceUri: "ui://new", content: [{ type: "image" }, { type: "json" }] });
    expect(activityContent([{ type: "resource", resource: { uri: "file:///a", text: "hello" } }])).toEqual([{ type: "resource", uri: "file:///a", name: "file:///a", text: "hello" }]);
  });
});

describe("chronological history convergence", () => {
  it("keeps reused item IDs in different turns at their original stream positions", () => {
    let view = applyCodexMessage({ ...emptyRunView, threadId: "thread", turnId: "turn" }, completed("c", "commandExecution", { command: "first" }));
    view = applyCodexMessage(view, completed("m", "agentMessage", { phase: "commentary", text: "Between turns" }));
    view = applyCodexMessage(view, event("turn/started", { turn: { id: "next" }, turnId: "next" }));
    view = applyCodexMessage(view, event("item/completed", { turnId: "next", item: item("c", "commandExecution", { command: "second", status: "completed" }) }));
    const timeline = buildTimelineItems(view);
    expect(timeline.map(i => i.kind)).toEqual(["activities", "event", "activities"]);
    expect(timeline.flatMap(i => i.kind === "activities" ? i.activities.map(a => [a.turnId, a.label]) : [])).toEqual([["turn", "Ran first"], ["next", "Ran second"]]);
  });
  it("merges newest-first pages with lifecycle split across pages without duplicate rows", () => {
    const current = { ...emptyRunView, status: "completed" as const, threadId: "thread", turnId: "turn" };
    const newer = [event("item/completed", { sequence: 30, item: item("c", "commandExecution", { status: "completed", command: "cat a", detailsDeferred: true }) })];
    const older = [event("item/started", { sequence: 10, item: item("c", "commandExecution", { command: "cat a", commandActions: [{ type: "read", path: "a" }] }) }), event("item/completed", { sequence: 20, item: item("m", "agentMessage", { text: "Between", phase: "commentary" }) })];
    const history = mergeHistoricalActivityStream(mergeHistoricalActivityStream(current, newer), older);
    expect(activities(history.activities!)).toHaveLength(1);
    expect(activities(history.activities!)[0]).toMatchObject({ status: "completed", payload: { actions: [{ type: "read" }] } });
    expect(buildTimelineItems(history).map(i => i.kind)).toEqual(["activities", "event"]);
    expect(mergeHistoricalActivityStream(history, newer).activities).toEqual(history.activities);
  });
  it("retains steering and commentary while artifacts and plans break mixed groups", () => {
    let view = applyCodexMessage({ ...emptyRunView, threadId: "thread", turnId: "turn" }, completed("a", "commandExecution"));
    view = addSteerPrompt(view, { id: "steer", text: "Continue", timestamp: "", contextFiles: [] });
    for (const e of [completed("b", "fileChange"), completed("image", "imageView", { path: "/a.png" }), completed("p", "plan", { text: "Plan" }), completed("c", "commandExecution")]) view = applyCodexMessage(view, e);
    const timeline = buildTimelineItems(view);
    expect(timeline.map(i => i.kind)).toEqual(["activities", "steer", "activities", "activities", "activities", "activities"]);
    expect(timeline.flatMap(i => i.kind === "activities" ? i.activities.map(a => a.id) : [])).toEqual(["a", "b", "image", "p", "c"]);
  });
  it("preserves redaction and rich-content availability without eager bodies", () => {
    const view = mergeHistoricalActivityStream({ ...emptyRunView, threadId: "thread", turnId: "turn", status: "completed" }, [completed("c", "commandExecution", { detailsAvailable: false }), completed("t", "mcpToolCall", { hasArtifacts: true, detailsDeferred: true })]);
    expect(activities(view.activities!)[0].detailsAvailable).toBe(false);
    expect(standaloneActivity(activities(view.activities!)[1])).toBe(true);
  });
  it("restores all recorded turns in one run even when lifecycle boundaries are absent", () => {
    const view = mergeHistoricalActivityStream({ ...emptyRunView, threadId: "thread", turnId: "next", status: "completed" }, [
      completed("c", "commandExecution", { command: "first" }),
      event("item/completed", { turnId: "next", item: item("c", "commandExecution", { command: "second", status: "completed" }) }),
    ]);
    expect(activities(view.activities!).map(a => [a.turnId, a.label])).toEqual([["turn", "Ran first"], ["next", "Ran second"]]);
  });
});
