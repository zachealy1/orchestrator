import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CircleUserRound } from "lucide-react";
import { CodexAccountCard, type CodexAccountCardActions, type CodexAccountCardModel } from "./CodexAccountCard";

export function RailAccountControl({ model, actions }: { model: CodexAccountCardModel; actions: CodexAccountCardActions }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (model.menuOpen) content.current?.querySelector<HTMLButtonElement>("button")?.focus();
    else if (wasOpen.current) trigger.current?.focus({ preventScroll: true });
    wasOpen.current = model.menuOpen;
  }, [model.menuOpen]);
  return <div className="rail-account-control" ref={model.containerRef}>
    <button ref={trigger} type="button" className="activity-rail-button" aria-label="Codex account"
      aria-expanded={model.menuOpen} aria-controls="rail-account-popover" aria-haspopup="dialog"
      data-tooltip={`Account · ${model.authRow.title} · ${model.authRow.subtitle}`} data-tooltip-placement="right"
      onClick={() => actions.setMenuOpen(!model.menuOpen)}>
      <CircleUserRound size={22} strokeWidth={1.6} aria-hidden="true" />
      {model.update?.state.version ? <span className="account-update-indicator" aria-label="App update available" /> : null}
    </button>
    {model.menuOpen ? createPortal(<div className="rail-account-popover" data-account-popover="true"
      id="rail-account-popover" role="dialog" aria-label="Account" data-tauri-drag-region="false">
      <CodexAccountCard model={{ ...model, containerRef: content }} actions={actions} embedded />
    </div>, document.body) : null}
  </div>;
}
