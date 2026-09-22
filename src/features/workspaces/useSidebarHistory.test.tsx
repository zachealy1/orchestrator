import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { workspace, workspaceChatFixture } from "../../test/appRuntimeHarness";
import {
  readSidebarPreferences,
  SIDEBAR_STORAGE_KEY,
} from "./sidebarPreferences";
import { useSidebarHistory } from "./useSidebarHistory";
import type { ChatListItem } from "../conversations/types";

const first = { ...workspace, selected_git_repository_path: null };
const second = { ...first, id: 2, path: "/second", label: "Second" };
function input() {
  return {
    workspaces: [first, second],
    expandedFiles: new Set([2]),
    expandedDirectories: new Set(["/second/src"]),
    listChats: vi.fn(
      async (
        _id: number,
        _limit: number,
        _offset: number,
      ): Promise<ChatListItem[]> => [],
    ),
    listPriority: vi.fn(async () => []),
    syncWorkspace: vi.fn(async () => undefined),
    activityVersion: 0,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe("sidebar history controller", () => {
  it("defaults to Chats and persists mode and independent expansions", async () => {
    const props = input();
    const { result, unmount } = renderHook(() => useSidebarHistory(props));
    expect(result.current.mode).toBe("chats");
    act(() => {
      result.current.setMode("files");
      result.current.setExpandedChats(new Set([1]));
    });
    await waitFor(() =>
      expect(readSidebarPreferences()).toEqual({
        mode: "files",
        chats: [1],
        files: [2],
        directories: ["/second/src"],
      }),
    );
    unmount();
    const restored = renderHook(() => useSidebarHistory(props));
    expect(restored.result.current.mode).toBe("files");
    expect([...restored.result.current.expandedChats]).toEqual([1]);
    expect(props.listChats).not.toHaveBeenCalled();
  });

  it("keeps simultaneous workspace loads separate and discards stale or removed results", async () => {
    const props = input();
    const old = deferred<ChatListItem[]>();
    props.listChats
      .mockImplementationOnce(() => old.promise)
      .mockImplementation(async (id) => [
        workspaceChatFixture({ id: id + 100, workspace_id: id }),
      ]);
    const { result, rerender } = renderHook((p) => useSidebarHistory(p), {
      initialProps: props,
    });
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refreshWorkspace(first);
    });
    await act(async () => {
      await Promise.all([
        result.current.refreshWorkspace(first),
        result.current.refreshWorkspace(second),
      ]);
    });
    await act(async () => {
      old.resolve([workspaceChatFixture({ id: 999 })]);
      await pending;
    });
    expect(result.current.histories[1].chats[0].id).toBe(101);
    expect(result.current.histories[2].chats[0].id).toBe(102);
    const removed = deferred<ChatListItem[]>();
    props.listChats.mockImplementationOnce(() => removed.promise);
    act(() => {
      pending = result.current.refreshWorkspace(second);
    });
    rerender({ ...props, workspaces: [first] });
    await act(async () => {
      removed.resolve([workspaceChatFixture({ id: 999 })]);
      await pending;
    });
    expect(result.current.histories[2]).toBeUndefined();
  });

  it.each([0, 5, 6, 10, 11])("reveals a %i-chat history in batches of five", async (count) => {
    const props = input();
    const chats = Array.from({ length: count }, (_, index) =>
      workspaceChatFixture({ id: index + 1 }),
    );
    props.listChats.mockImplementation(async (_id, limit, offset) => chats.slice(offset, offset + limit));
    const { result } = renderHook(() => useSidebarHistory(props));
    for (const limit of [5, 10, 15]) {
      await act(async () => { await result.current.refreshWorkspace(first, limit > 5); });
      expect(result.current.histories[1].chats).toHaveLength(Math.min(count, limit));
      expect(result.current.histories[1].hasMore).toBe(count > limit);
      if (count <= limit) break;
      expect(props.listChats).toHaveBeenLastCalledWith(1, limit + 1, 0);
    }
  });

  it.each([false, true])("retries a failed expanded window without skipping a batch (more=%s)", async (more) => {
    const props = input();
    props.listChats.mockImplementation(async (_id, limit) =>
      Array.from({ length: 16 }, (_, index) => workspaceChatFixture({ id: index + 1 })).slice(0, limit),
    );
    const { result } = renderHook(() => useSidebarHistory(props));
    await act(async () => { await result.current.refreshWorkspace(first); });
    props.listChats.mockRejectedValueOnce(new Error("Offline"));
    await act(async () => { await result.current.refreshWorkspace(first, true); });
    expect(result.current.histories[1]).toMatchObject({ status: "error", hasMore: true });
    expect(result.current.histories[1].chats).toHaveLength(5);
    await act(async () => { await result.current.refreshWorkspace(first, more); });
    expect(result.current.histories[1].chats).toHaveLength(10);
    expect(props.listChats).toHaveBeenLastCalledWith(1, 11, 0);
  });

  it("re-reads the expanded prefix after activity changes and retains independent session limits", async () => {
    const props = input();
    let chats = Array.from({ length: 16 }, (_, index) => workspaceChatFixture({ id: index + 1 }));
    props.listChats.mockImplementation(async (_id, limit) => chats.slice(0, limit));
    const { result, unmount } = renderHook(() => useSidebarHistory(props));
    await act(async () => { await result.current.refreshWorkspace(first); });
    // The last chat becomes most recent before the next page is requested.
    chats = [chats[15], ...chats.slice(0, 15)];
    await act(async () => { await result.current.refreshWorkspace(first, true); });
    expect(result.current.histories[1].chats.map(chat => chat.id)).toEqual([16, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    await act(async () => {
      await result.current.refreshWorkspace(first);
      await result.current.refreshWorkspace(second);
    });
    expect(result.current.histories[1].chats).toHaveLength(10);
    expect(result.current.histories[2].chats).toHaveLength(5);
    // A temporary smaller result must not forget the user's revealed count.
    const all = chats;
    chats = chats.slice(0, 2);
    await act(async () => { await result.current.refreshWorkspace(first); });
    chats = all;
    await act(async () => { await result.current.refreshWorkspace(first); });
    expect(result.current.histories[1].chats).toHaveLength(10);
    unmount();
    const restarted = renderHook(() => useSidebarHistory(props));
    await act(async () => { await restarted.result.current.refreshWorkspace(first); });
    expect(restarted.result.current.histories[1].chats).toHaveLength(5);
  });

  it("does not advance twice while an expanded request is pending or accept its stale result", async () => {
    const props = input();
    const chats = Array.from({ length: 20 }, (_, index) => workspaceChatFixture({ id: index + 1 }));
    props.listChats.mockImplementation(async (_id, limit) => chats.slice(0, limit));
    const { result } = renderHook(() => useSidebarHistory(props));
    await act(async () => { await result.current.refreshWorkspace(first); });
    const old = deferred<ChatListItem[]>();
    props.listChats.mockImplementationOnce(() => old.promise);
    let pending!: Promise<void>;
    act(() => { pending = result.current.refreshWorkspace(first, true); });
    await act(async () => { await result.current.refreshWorkspace(first, true); });
    expect(props.listChats).toHaveBeenLastCalledWith(1, 11, 0);
    await act(async () => { old.resolve([workspaceChatFixture({ id: 999 })]); await pending; });
    expect(result.current.histories[1].chats).toHaveLength(10);
    expect(result.current.histories[1].chats[0].id).toBe(1);
  });

  it.each(["priority", "chats", "files"])("keeps Priority eligibility current in %s mode on activity, focus, and expiry", async (mode) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T12:00:00Z"));
    localStorage.setItem(
      SIDEBAR_STORAGE_KEY,
      JSON.stringify({ mode }),
    );
    const props = {
      ...input(),
      listPriority: vi.fn(async () => [
        {
          ...workspaceChatFixture(),
          workspace_id: first.id,
          latest_finished_at: "2026-09-11T12:00:01Z",
          latest_finished_status: "completed" as const,
        },
      ]),
    };
    const { result, rerender } = renderHook((p) => useSidebarHistory(p), {
      initialProps: props,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.priority.chats).toHaveLength(1);
    expect(props.listChats).not.toHaveBeenCalled();
    const calls = props.listPriority.mock.calls.length;
    rerender({ ...props, activityVersion: 1 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(props.listPriority.mock.calls.length).toBeGreaterThan(calls);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(0);
    });
    if (mode === "priority") expect(props.syncWorkspace).toHaveBeenCalledWith(second);
    else expect(props.syncWorkspace).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.priority.chats).toHaveLength(0);
  });

  it("updates the grouping clock at local midnight and on focus, including an empty Priority list", async () => {
    vi.useFakeTimers();
    const beforeMidnight = new Date(2026, 11, 31, 23, 59, 59).getTime();
    vi.setSystemTime(beforeMidnight);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify({ mode: "priority" }));
    const props = input();
    const { result } = renderHook(() => useSidebarHistory(props));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.priority.now).toBe(beforeMidnight);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current.priority.now).toBe(beforeMidnight + 1000);
    vi.setSystemTime(beforeMidnight + 60_000);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.priority.now).toBe(beforeMidnight + 60_000);
  });

  it("filters invalid, future, expired and removed workspace entries from cached Priority data", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T12:00:00Z"));
    const props = {
      ...input(),
      listPriority: vi.fn(async () => [
        [1, "2026-09-12T12:00:00Z", 1],
        [2, "2026-09-12T12:00:01Z", 1],
        [3, "2026-09-11T12:00:00Z", 1],
        [4, "invalid", 1],
        [5, "2026-09-12T12:00:00Z", 999],
      ].map(([id, finished, workspaceId]) => ({
        ...workspaceChatFixture({ id: Number(id), workspace_id: Number(workspaceId) }),
        latest_finished_at: String(finished), latest_finished_status: "completed" as const,
      }))),
    };
    const { result } = renderHook(() => useSidebarHistory(props));
    await act(async () => { await result.current.refreshPriority(); });
    expect(result.current.priority.chats.map(chat => chat.id)).toEqual([1]);
  });
});
