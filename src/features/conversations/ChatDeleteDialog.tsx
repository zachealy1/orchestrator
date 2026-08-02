import type { ChatListItem } from "./types";
import { useEffect } from "react";

type ChatDeleteDialogProps = {
  chat: ChatListItem;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ChatDeleteDialog({
  chat: _chat,
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
            This removes the chat from Orchestrator history, but it is not
            permanently deleted.
          </p>
        </div>
        <div className="confirmation-actions">
          <button className="secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="danger" type="button" onClick={onConfirm}>
            Remove chat
          </button>
        </div>
      </section>
    </div>
  );
}
