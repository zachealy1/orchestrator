import { Download } from "lucide-react";
import { useEffect } from "react";
import { updateActionLabel, type UpdateView } from "./UpdateController";

export type UpdateMenuModel = { state: UpdateView; act: () => void; dismissMessage: () => void };
export function UpdateMenuAction({ update }: { update?: UpdateMenuModel }) {
  const dismissMessage = update?.dismissMessage;
  useEffect(() => () => dismissMessage?.(), [dismissMessage]);
  if (!update) return null;
  const { state } = update;
  const percentage = state.totalBytes ? Math.min(100, Math.round(state.downloadedBytes / state.totalBytes * 100)) : null;
  return <>
    <button className="account-menu-action" type="button" onClick={update.act}
      disabled={state.checking || state.installing || state.openingDownloads || state.phase === "downloading"}>
      <Download size={16} aria-hidden="true" />
      <span className="account-update-copy">{updateActionLabel(state)}
        {state.delivery === "in-app" && state.version && <small>{state.version}{state.phase === "downloading" && percentage !== null ? ` · ${percentage}%` : ""}</small>}
      </span>
    </button>
    {state.delivery === "in-app" && state.phase === "downloading" && <progress aria-label="Update download" max={state.totalBytes ?? undefined} value={state.totalBytes ? state.downloadedBytes : undefined} />}
    {state.message && <div className="account-update-feedback" role="status">
      <span>{state.message}</span>
    </div>}
  </>;
}
