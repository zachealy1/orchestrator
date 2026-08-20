import { AlertCircle, Check, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ChatListItem } from "./types";

export function ChatRenameDialog({
  chat,
  title,
  pending,
  error,
  onTitleChange,
  onCancel,
  onConfirm,
}: {
  chat: ChatListItem;
  title: string;
  pending: boolean;
  error: string | null;
  onTitleChange: (title: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [chat.id]);
  useEffect(() => {
    if (pending) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    addEventListener("keydown", listener);
    return () => removeEventListener("keydown", listener);
  }, [onCancel, pending]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel();
      }}
    >
      <form
        className="confirmation-dialog chat-rename-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-rename-title"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <div>
          <h2 id="chat-rename-title">Rename chat</h2>
        </div>
        <label className="branch-creation-field">
          <span>Title</span>
          <input
            ref={inputRef}
            value={title}
            disabled={pending}
            onChange={(event) => onTitleChange(event.currentTarget.value)}
          />
        </label>
        {error ? (
          <p className="confirmation-error" role="alert">
            <AlertCircle size={15} aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : null}
        <div className="confirmation-actions">
          <button
            className="native-plan-icon-action"
            type="button"
            aria-label="Cancel rename"
            data-tooltip="Cancel"
            disabled={pending}
            onClick={onCancel}
          >
            <X size={15} aria-hidden="true" />
          </button>
          <button
            className="native-plan-icon-action implement"
            type="submit"
            aria-label="Save chat title"
            data-tooltip="Save"
            disabled={pending || !title.trim()}
          >
            <Check size={15} aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
}
