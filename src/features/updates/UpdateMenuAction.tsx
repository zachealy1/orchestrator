import { Download } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { updateActionLabel, RELEASE_DOWNLOADS_URL, type UpdateView } from "./UpdateController";

export type UpdateMenuModel = { state: UpdateView; act: () => void };
export function UpdateMenuAction({ update }: { update?: UpdateMenuModel }) {
  if (!update) return null;
  const { state } = update;
  const percentage = state.totalBytes ? Math.min(100, Math.round(state.downloadedBytes / state.totalBytes * 100)) : null;
  return <>
    <button className="account-menu-action" type="button" onClick={update.act}
      disabled={state.checking || state.installing || state.phase === "downloading"}>
      <Download size={16} aria-hidden="true" />
      <span className="account-update-copy">{updateActionLabel(state)}
        {state.version && <small>{state.version}{state.phase === "downloading" && percentage !== null ? ` · ${percentage}%` : ""}</small>}
      </span>
    </button>
    {state.phase === "downloading" && <progress aria-label="Update download" max={state.totalBytes ?? undefined} value={state.totalBytes ? state.downloadedBytes : undefined} />}
    {state.message && <div className="account-update-feedback" role="status">
      <span>{state.message}</span>
      {state.error && <button type="button" className="account-menu-action" onClick={() => void openUrl(RELEASE_DOWNLOADS_URL).catch(() => undefined)}>Open downloads page</button>}
    </div>}
  </>;
}
