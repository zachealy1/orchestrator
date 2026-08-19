import { Loader2 } from "lucide-react";
import { memo } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  TransitionEvent as ReactTransitionEvent,
} from "react";
import type { HistoryDrawerPhase } from "../../lib/historyDrawerTransition";
import type { Workspace } from "../workspaces/types";
import {
  formatHistoryChatMeta,
  sortHistoryChatsByActivity,
} from "./historyProjection";
import type { ChatListItem, WorkspaceHistoryState } from "./types";
export type { WorkspaceHistoryState } from "./types";

export function HistoryChatLoading({
  title,
  error,
}: {
  title: string;
  error: string | null;
}) {
  return (
    <section className="task-chat-loading" aria-label="Task chat transcript">
      {error ? (
        <p className="history-chat-load-error" role="alert">
          Could not open {title}: {error}
        </p>
      ) : (
        <p
          className="stream-placeholder stream-preparing"
          aria-label="Loading chat"
        >
          <span className="stream-loading-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          Loading {title}
        </p>
      )}
    </section>
  );
}

export const WorkspaceHistoryDrawer = memo(function WorkspaceHistoryDrawer({
  phase,
  workspace,
  historyState,
  selectedChatId,
  runningChatActivity,
  onSelectChat,
  onOpenChatContextMenu,
  onTransitionEnd,
}: {
  phase: HistoryDrawerPhase;
  workspace: Workspace | null;
  historyState: WorkspaceHistoryState;
  selectedChatId: number | null;
  runningChatActivity: ReadonlyMap<number, string>;
  onSelectChat: (chat: ChatListItem) => void;
  onOpenChatContextMenu: (
    chat: ChatListItem,
    event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLElement>,
  ) => void;
  onTransitionEnd: (event: ReactTransitionEvent<HTMLElement>) => void;
}) {
  const open = phase === "opening" || phase === "open";
  const orderedChats = sortHistoryChatsByActivity(
    historyState.chats,
    runningChatActivity,
  );
  return (
    <aside
      className={`workspace-history-drawer ${phase}`}
      aria-label="Workspace chat history"
      aria-hidden={!open}
      inert={!open ? true : undefined}
      onTransitionEnd={onTransitionEnd}
    >
      <header>
        <h2>{workspace?.label ?? "Workspace chats"}</h2>
      </header>

      {historyState.status === "loading" ? (
        <div className="history-empty">
          <Loader2 className="spin" size={16} />
          Loading chats...
        </div>
      ) : null}
      {historyState.status === "error" ? (
        <div className="history-empty error">{historyState.error}</div>
      ) : null}
      {historyState.status === "loaded" && historyState.chats.length === 0 ? (
        <div className="history-empty">No chats yet.</div>
      ) : null}

      <div className="history-drawer-body">
        <div className="history-run-list" aria-label="Workspace chats">
          {orderedChats.map((chat) => (
            <WorkspaceHistoryRow
              key={chat.id}
              chat={chat}
              selected={selectedChatId === chat.id}
              running={runningChatActivity.has(chat.id)}
              onSelect={onSelectChat}
              onOpenContextMenu={onOpenChatContextMenu}
            />
          ))}
        </div>
      </div>
    </aside>
  );
});

const WorkspaceHistoryRow = memo(function WorkspaceHistoryRow({
  chat,
  selected,
  running,
  onSelect,
  onOpenContextMenu,
}: {
  chat: ChatListItem;
  selected: boolean;
  running: boolean;
  onSelect: (chat: ChatListItem) => void;
  onOpenContextMenu: (
    chat: ChatListItem,
    event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLElement>,
  ) => void;
}) {
  return (
    <button
      className={`history-run-item ${selected ? "selected" : ""}`}
      type="button"
      aria-pressed={selected}
      title={chat.title}
      onClick={() => onSelect(chat)}
      onContextMenu={(event) => onOpenContextMenu(chat, event)}
      onKeyDown={(event) => {
        if (
          event.key === "ContextMenu" ||
          (event.key === "F10" && event.shiftKey)
        ) {
          onOpenContextMenu(chat, event);
        }
      }}
    >
      <span className="history-run-title-row">
        <strong>{chat.title}</strong>
        {running ? (
          <Loader2
            className="history-run-spinner spin"
            size={15}
            aria-label="Agent running"
          />
        ) : null}
      </span>
      <span>{formatHistoryChatMeta(chat)}</span>
    </button>
  );
});
