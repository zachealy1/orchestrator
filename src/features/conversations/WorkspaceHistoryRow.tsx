import { Loader2 } from "lucide-react";
import {
  memo,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { formatHistoryChatMeta } from "./historyProjection";
import type { ChatListItem } from "./types";

export const WorkspaceHistoryRow = memo(function WorkspaceHistoryRow({
  chat,
  selected,
  running,
  unread,
  onSelect,
  metadata,
  onOpenContextMenu,
}: {
  metadata?: ReactNode;
  chat: ChatListItem;
  selected: boolean;
  running: boolean;
  unread: boolean;
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
      aria-label={
        unread
          ? `${chat.title}, unread activity${running ? ", agent running" : ""}`
          : undefined
      }
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
        {unread || running ? (
          <span
            className="history-run-indicators"
            aria-hidden={unread || undefined}
          >
            {unread ? <span className="history-run-unread-dot" /> : null}
            {running ? (
              <Loader2
                className="history-run-spinner spin"
                size={15}
                aria-label="Agent running"
              />
            ) : null}
          </span>
        ) : null}
      </span>
      <span>{metadata ?? formatHistoryChatMeta(chat)}</span>
    </button>
  );
});
