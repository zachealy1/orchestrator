import { AlertCircle, Link2, Loader2, RefreshCw, X } from "lucide-react";
import { memo, useEffect, useRef } from "react";
import type { DefaultBrowserTab } from "./types";

type DefaultBrowserTabDialogProps = {
  tabs: DefaultBrowserTab[];
  loading: boolean;
  attachingTabId: number | null;
  error: string | null;
  onRefresh: () => void;
  onAttach: (tabId: number) => void;
  onClose: () => void;
};

export const DefaultBrowserTabDialog = memo(function DefaultBrowserTabDialog({
  tabs,
  loading,
  attachingTabId,
  error,
  onRefresh,
  onAttach,
  onClose,
}: DefaultBrowserTabDialogProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const busy = loading || attachingTabId !== null;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      closeRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="confirmation-dialog default-browser-tab-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="default-browser-tab-title"
        aria-describedby="default-browser-tab-description"
      >
        <div>
          <h2 id="default-browser-tab-title">Attach a browser tab</h2>
          <p id="default-browser-tab-description">
            Choose a tab to move into this chat's Orchestrator group. Its title
            and address stay in this dialog and are not sent to Codex.
          </p>
        </div>

        <div className="default-browser-tab-list" role="list">
          {loading ? (
            <div className="default-browser-tab-empty" role="status">
              <Loader2 className="spin" size={17} aria-hidden="true" />
              <span>Loading browser tabs...</span>
            </div>
          ) : tabs.length === 0 ? (
            <div className="default-browser-tab-empty" role="status">
              No attachable tabs are open in the default browser.
            </div>
          ) : (
            tabs.map((tab) => (
              <div className="default-browser-tab-row" role="listitem" key={tab.id}>
                <div className="default-browser-tab-copy">
                  <strong>{tab.title || "Untitled tab"}</strong>
                  <span>{tab.origin}</span>
                </div>
                <button
                  className="native-plan-icon-action"
                  type="button"
                  aria-label={`Attach ${tab.title || tab.origin}`}
                  data-tooltip="Attach tab"
                  disabled={busy || tab.inCurrentGroup}
                  onClick={() => onAttach(tab.id)}
                >
                  {attachingTabId === tab.id ? (
                    <Loader2 className="spin" size={15} aria-hidden="true" />
                  ) : (
                    <Link2 size={15} aria-hidden="true" />
                  )}
                </button>
              </div>
            ))
          )}
        </div>

        {error ? (
          <p className="confirmation-error" role="alert">
            <AlertCircle size={15} aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : null}

        <div className="confirmation-actions">
          <button
            ref={closeRef}
            className="native-plan-icon-action cancel"
            type="button"
            aria-label="Close tab selection"
            data-tooltip="Close"
            disabled={busy}
            onClick={onClose}
          >
            <X size={15} aria-hidden="true" />
          </button>
          <button
            className="native-plan-icon-action"
            type="button"
            aria-label="Refresh browser tabs"
            data-tooltip="Refresh tabs"
            disabled={busy}
            onClick={onRefresh}
          >
            <RefreshCw size={15} aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>
  );
});
