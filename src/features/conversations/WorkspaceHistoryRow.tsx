import { Loader2 } from "lucide-react";
import {
  memo,
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
  metadata?: string;
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
  const description = metadata ?? formatHistoryChatMeta(chat);

  return (
    <button
      className={`history-run-item ${selected ? "selected" : ""}`}
      type="button"
      aria-pressed={selected}
      aria-label={`${chat.title}${unread ? ", unread activity" : ""}${running ? ", agent running" : ""}`}
      aria-description={description}
      data-tooltip={`${chat.title} · ${description}`}
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
            aria-hidden="true"
          >
            {unread ? <span className="history-run-unread-dot" /> : null}
            {running ? (
              <Loader2
                className="history-run-spinner spin"
                size={15}
              />
            ) : null}
          </span>
        ) : null}
      </span>
    </button>
  );
});
