import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SubagentStore, type SubagentRecord } from "./subagents";

const record: SubagentRecord = {
      id: "one",
      ownerClientId: "owner",
      workspaceId: 1,
      chatId: 2,
      runId: 3,
      parentTurnId: "turn-parent",
      profileKey: "account:1",
      accountId: 1,
      rootThreadId: "root",
      parentThreadId: "root",
      childThreadId: "child",
      childTurnId: "turn-child",
      spawnItemId: "spawn",
      task: "Inspect",
      depth: 0,
      status: "running",
      statusBeforeAttention: null,
      agentStatus: "running",
      needsAttention: false,
      error: null,
      finalResult: null,
      startedAt: "2026-07-29T10:00:00.000Z",
      updatedAt: "2026-07-29T10:00:00.000Z",
      completedAt: null,
    };
let store: SubagentStore;
let visible = true;
beforeEach(() => {
  vi.useFakeTimers();
  visible = true;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visible ? "visible" : "hidden");
  store = new SubagentStore();
  store.upsert(record);
});
afterEach(() => {
  store.dispose();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function hide(hidden: boolean) {
  visible = !hidden;
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("subagent streaming publication", () => {
  it("updates authoritative records immediately and publishes a burst once", () => {
    const listener = vi.fn();
    store.subscribe("chat:2", listener);
    for (let i = 1; i <= 100; i++) {
      store.upsert({ ...record, updatedAt: String(i) }, { deferPublication: true });
    }
    expect(store.findByThread("account:1", "child")?.updatedAt).toBe("100");
    expect(store.getPublishedConversation("chat:2")[0]).toBe(record);
    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(listener).toHaveBeenCalledOnce();
    expect(store.getPublishedConversation("chat:2")[0].updatedAt).toBe("100");
  });

  it("retains the latest hidden snapshot and publishes it once on visibility restoration", () => {
    const listener = vi.fn();
    store.subscribe("chat:2", listener);
    hide(true);
    store.upsert({ ...record, updatedAt: "new" }, { deferPublication: true });
    vi.advanceTimersByTime(1_000);
    expect(store.findByThread("account:1", "child")?.updatedAt).toBe("new");
    expect(store.getPublishedConversation("chat:2")[0]).toBe(record);
    expect(listener).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    hide(false);
    expect(listener).toHaveBeenCalledOnce();
    expect(store.getPublishedConversation("chat:2")[0].updatedAt).toBe("new");
  });

  it("publishes completion immediately while hidden without replaying older streaming state", () => {
    const listener = vi.fn();
    store.subscribe("chat:2", listener);
    hide(true);
    store.upsert({ ...record, updatedAt: "stream" }, { deferPublication: true });
    store.upsert({ ...record, status: "completed", updatedAt: "terminal", completedAt: "terminal" });
    expect(store.getPublishedConversation("chat:2")[0].status).toBe("completed");
    expect(listener).toHaveBeenCalledOnce();
    hide(false);
    vi.advanceTimersByTime(1_000);
    expect(listener).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not resurrect deleted conversations or leave listeners after disposal", () => {
    hide(true);
    store.upsert({ ...record, updatedAt: "stream" }, { deferPublication: true });
    store.removeConversation("chat:2");
    hide(false);
    expect(store.getPublishedConversation("chat:2")).toEqual([]);
    store.upsert(record, { deferPublication: true });
    store.dispose();
    hide(true);
    hide(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(store.getPublishedConversation("chat:2")).toEqual([]);
  });
});
