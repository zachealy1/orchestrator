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

  it("loads another page, keeps cached rows on failure and supports retry", async () => {
    const props = input();
    props.listChats.mockImplementation(async (_id, limit, offset) =>
      Array.from({ length: 65 }, (_, index) =>
        workspaceChatFixture({ id: index + 1 }),
      ).slice(offset, offset + limit),
    );
    const { result } = renderHook(() => useSidebarHistory(props));
    await act(async () => {
      await result.current.refreshWorkspace(first);
    });
    expect(result.current.histories[1].chats).toHaveLength(50);
    expect(result.current.histories[1].hasMore).toBe(true);
    await act(async () => {
      await result.current.refreshWorkspace(first, true);
    });
    expect(result.current.histories[1].chats).toHaveLength(65);
    expect(result.current.histories[1].hasMore).toBe(false);
    props.listChats.mockRejectedValueOnce(new Error("Offline"));
    await act(async () => {
      await result.current.refreshWorkspace(first);
    });
    expect(result.current.histories[1].status).toBe("error");
    expect(result.current.histories[1].chats).toHaveLength(65);
    await act(async () => {
      await result.current.refreshWorkspace(first);
    });
    expect(result.current.histories[1].status).toBe("loaded");
  });

  it("queries Priority without expanding workspaces, refreshes on activity and focus, and expires exactly at 24 hours", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T12:00:00Z"));
    localStorage.setItem(
      SIDEBAR_STORAGE_KEY,
      JSON.stringify({ mode: "priority" }),
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
    expect(props.syncWorkspace).toHaveBeenCalledWith(second);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.priority.chats).toHaveLength(0);
  });
});
