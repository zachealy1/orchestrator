import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatListItem,
  PriorityChatListItem,
  WorkspaceHistoryState,
} from "../conversations/types";
import type { Workspace } from "./types";
import {
  persistSidebarPreferences,
  readSidebarPreferences,
  type SidebarMode,
} from "./sidebarPreferences";

export type SidebarHistoryState = WorkspaceHistoryState & { hasMore: boolean };
export type PriorityHistoryState = Omit<WorkspaceHistoryState, "chats"> & {
  chats: PriorityChatListItem[];
};
const emptyHistory = (): SidebarHistoryState => ({
  status: "idle",
  chats: [],
  error: null,
  hasMore: false,
});
export const PRIORITY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function useSidebarHistory(input: {
  workspaces: Workspace[];
  expandedFiles: ReadonlySet<number>;
  expandedDirectories: ReadonlySet<string>;
  listChats: (
    workspaceId: number,
    limit: number,
    offset: number,
  ) => Promise<ChatListItem[]>;
  listPriority: (now: string) => Promise<PriorityChatListItem[]>;
  syncWorkspace: (workspace: Workspace) => Promise<void>;
  activityVersion: string | number;
}) {
  const [preferences] = useState(readSidebarPreferences);
  const [mode, setMode] = useState<SidebarMode>(preferences.mode);
  const [expandedChats, setExpandedChats] = useState(
    () => new Set(preferences.chats),
  );
  const [histories, setHistories] = useState<
    Record<number, SidebarHistoryState>
  >({});
  const [priority, setPriority] = useState<PriorityHistoryState>({
    status: "idle",
    chats: [],
    error: null,
  });
  const [now, setNow] = useState(Date.now);
  const current = useRef(input);
  current.current = input;
  const historiesRef = useRef(histories);
  historiesRef.current = histories;
  const settledTitles = useRef(
    new Map<number, Pick<ChatListItem, "title" | "title_generation_state">>(),
  );
  const mergeTitle = <T extends ChatListItem>(chat: T): T => {
    const title = settledTitles.current.get(chat.id);
    return title &&
      (chat.title_generation_state === "pending" ||
        chat.title_generation_state === "generating")
      ? { ...chat, ...title, title_generation_started_at: null }
      : chat;
  };
  const updateTitle = useCallback(
    (id: number, title: string, state: "complete" | "failed") => {
      const fields = {
        title,
        title_generation_state: state,
        title_generation_started_at: null,
      };
      settledTitles.current.set(id, fields);
      setHistories((states) =>
        Object.fromEntries(
          Object.entries(states).map(([key, history]) => [
            key,
            {
              ...history,
              chats: history.chats.map((chat) =>
                chat.id === id ? { ...chat, ...fields } : chat,
              ),
            },
          ]),
        ),
      );
      setPriority((history) => ({
        ...history,
        chats: history.chats.map((chat) =>
          chat.id === id ? { ...chat, ...fields } : chat,
        ),
      }));
    },
    [],
  );
  const requests = useRef(new Map<number, number>());
  const requestSequence = useRef(0);
  const priorityRequest = useRef(0);
  const alive = useRef(true);
  const workspaceKey = input.workspaces
    .map((w) => `${w.id}:${w.path}`)
    .join("|");
  const expandedKey = [...expandedChats].sort().join(",");

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      requests.current.clear();
      priorityRequest.current++;
    };
  }, []);
  useEffect(() => {
    persistSidebarPreferences({
      mode,
      chats: [...expandedChats],
      files: [...input.expandedFiles],
      directories: [...input.expandedDirectories],
    });
  }, [mode, expandedChats, input.expandedFiles, input.expandedDirectories]);

  const refreshWorkspace = useCallback(
    async (workspace: Workspace, more = false) => {
      const id = workspace.id;
      if (
        !alive.current ||
        !current.current.workspaces.some(
          (w) => w.id === id && w.path === workspace.path,
        )
      )
        return;
      const request = ++requestSequence.current;
      requests.current.set(id, request);
      const previous = historiesRef.current[id] ?? emptyHistory();
      const limit = more ? 50 : Math.max(50, previous.chats.length);
      const offset = more ? previous.chats.length : 0;
      const valid = () =>
        alive.current &&
        requests.current.get(id) === request &&
        current.current.workspaces.some(
          (w) => w.id === id && w.path === workspace.path,
        );
      setHistories((states) => ({
        ...states,
        [id]: { ...previous, status: "loading", error: null },
      }));
      try {
        const rows = await current.current.listChats(id, limit + 1, offset);
        if (!valid()) return;
        const chats = rows.slice(0, limit).map(mergeTitle);
        setHistories((states) => ({
          ...states,
          [id]: {
            status: "loaded",
            error: null,
            hasMore: rows.length > limit,
            chats: [
              ...new Map(
                [...(more ? previous.chats : []), ...chats].map((chat) => [
                  chat.id,
                  chat,
                ]),
              ).values(),
            ],
          },
        }));
      } catch (error) {
        if (valid())
          setHistories((states) => ({
            ...states,
            [id]: { ...previous, status: "error", error: String(error) },
          }));
      }
    },
    [],
  );

  const refreshPriority = useCallback(async () => {
    const request = ++priorityRequest.current;
    setNow(Date.now());
    setPriority((state) => ({ ...state, status: "loading", error: null }));
    try {
      const chats = await current.current.listPriority(
        new Date().toISOString(),
      );
      if (alive.current && priorityRequest.current === request)
        setPriority({
          status: "loaded",
          chats: chats.map(mergeTitle),
          error: null,
        });
    } catch (error) {
      if (alive.current && priorityRequest.current === request)
        setPriority((state) => ({
          ...state,
          status: "error",
          error: String(error),
        }));
    }
  }, []);

  // Share a bounded sync queue across mode changes and focus events.
  const syncPending = useRef(new Map<number, Promise<void>>());
  const syncTail = useRef<Promise<void>>(Promise.resolve());
  const syncWorkspace = useCallback((workspace: Workspace) => {
    const existing = syncPending.current.get(workspace.id);
    if (existing) return existing;
    const task = syncTail.current.then(async () => {
      if (
        !alive.current ||
        !current.current.workspaces.some(
          (w) => w.id === workspace.id && w.path === workspace.path,
        )
      )
        return;
      await current.current.syncWorkspace(workspace);
    });
    syncTail.current = task.catch(() => undefined);
    syncPending.current.set(workspace.id, task);
    void task
      .finally(() => syncPending.current.delete(workspace.id))
      .catch(() => undefined);
    return task;
  }, []);

  const refreshVisible = useCallback(
    async (sync = false) => {
      const visible = current.current.workspaces.filter(
        (w) =>
          mode === "priority" || (mode === "chats" && expandedChats.has(w.id)),
      );
      if (mode === "priority") await refreshPriority();
      await Promise.all(
        visible.map(async (workspace) => {
          if (mode === "chats") await refreshWorkspace(workspace);
          if (sync) {
            try {
              await syncWorkspace(workspace);
              if (mode === "chats") await refreshWorkspace(workspace);
            } catch (error) {
              if (
                alive.current &&
                mode === "chats" &&
                current.current.workspaces.some(
                  (w) => w.id === workspace.id && w.path === workspace.path,
                )
              )
                setHistories((states) => ({
                  ...states,
                  [workspace.id]: {
                    ...(states[workspace.id] ?? emptyHistory()),
                    status: "error",
                    error: String(error),
                  },
                }));
            }
          }
        }),
      );
      if (mode === "priority" && sync) await refreshPriority();
    },
    [mode, expandedKey, refreshWorkspace, refreshPriority, syncWorkspace],
  );

  useEffect(() => {
    void refreshVisible(true);
  }, [mode, expandedKey, workspaceKey]);
  useEffect(() => {
    void refreshVisible();
  }, [input.activityVersion]);
  useEffect(() => {
    const focus = () => {
      if (document.visibilityState !== "hidden") void refreshVisible(true);
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [refreshVisible]);
  useEffect(() => {
    const ids = new Set(input.workspaces.map((w) => w.id));
    for (const id of requests.current.keys())
      if (!ids.has(id)) requests.current.delete(id);
    setHistories((states) =>
      Object.fromEntries(
        Object.entries(states).filter(([id]) => ids.has(Number(id))),
      ),
    );
  }, [workspaceKey]);
  useEffect(() => {
    if (mode !== "priority") return;
    const expiry = Math.min(
      ...priority.chats
        .map((chat) => Date.parse(chat.latest_finished_at) + PRIORITY_WINDOW_MS)
        .filter((time) => time > now),
    );
    if (!Number.isFinite(expiry)) return;
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(1, expiry - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [mode, priority.chats, now]);

  return {
    updateTitle,
    mode,
    setMode,
    expandedChats,
    setExpandedChats,
    histories,
    priority: {
      ...priority,
      chats: priority.chats.filter(
        (chat) =>
          input.workspaces.some((w) => w.id === chat.workspace_id) &&
          Date.parse(chat.latest_finished_at) > now - PRIORITY_WINDOW_MS,
      ),
    },
    refreshWorkspace,
    refreshPriority,
    refreshVisible,
  };
}
