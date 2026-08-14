import { Trash2, X } from "lucide-react";
import type { ChatListItem } from "./types";
import { useEffect } from "react";

type ChatDeleteDialogProps = {
  chat: ChatListItem;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ChatDeleteDialog({
  chat,
  onCancel,
  onConfirm,
}: ChatDeleteDialogProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        className="confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-delete-title"
        aria-describedby="chat-delete-description"
      >
        <div>
          <p className="eyebrow">Chat</p>
          <h2 id="chat-delete-title">Remove chat?</h2>
          <p id="chat-delete-description">
            {chat.continuation_kind === "worktree"
              ? "This removes the chat, discards its isolated worktree changes, and deletes its local continuation branches. Remote branches are not changed."
              : "This removes the chat from Orchestrator history, but it is not permanently deleted."}
          </p>
        </div>
        <div className="confirmation-actions">
          <button
            className="native-plan-icon-action"
            type="button"
            aria-label="Cancel"
            data-tooltip="Cancel"
            onClick={onCancel}
          >
            <X size={15} aria-hidden="true" />
          </button>
          <button
            className="native-plan-icon-action cancel"
            type="button"
            aria-label="Remove chat"
            data-tooltip="Remove chat"
            onClick={onConfirm}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>
  );
}
