import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { commands, type AppUpdateState } from "../generated/tauri";
import { useStableEvent } from "../shared/reactRuntime";
import { flushNativeCommands } from "../shared/nativeCommands";
import type { AppServices } from "../runtime/AppServices";
import type { ApplicationNotificationQueue } from "./useApplicationNotificationQueue";
import { BUG_REPORT_URL, RELEASE_DOWNLOADS_URL, UpdateController } from "../features/updates/UpdateController";
import { useEngineController } from "../features/engine/useEngineController";

export function useReleaseServices(services: AppServices, notices: ApplicationNotificationQueue,
  prepare: () => void, extraBusy: () => boolean, closeAccountMenu: () => void) {
  const inputs = useRef({ prepare, extraBusy, closeAccountMenu, notices });
  inputs.current = { prepare, extraBusy, closeAccountMenu, notices };
  const [controller] = useState(() => new UpdateController({
    check: commands.appUpdateCheck, download: commands.appUpdateDownload, install: commands.appUpdateInstall,
    openDownloads: async () => {
      await openUrl(RELEASE_DOWNLOADS_URL);
      inputs.current.closeAccountMenu();
    },
    storage: localStorage,
    busy: () => inputs.current.extraBusy() || services.subagents.hasActiveWork() || services.runCoordinator.getSnapshot().some((run) => !["completed", "cancelled", "failed"].includes(run.phase))
      || [...services.activeRuns.values()].some((run) => !run.stopped && (
        run.turnStartPending || run.cancelScheduledSetup !== null || ["running", "connecting"].includes(run.runView.status)
        || run.runView.approvalRequests.length > 0 || run.runView.serverRequests.length > 0 || run.goalActionPending !== null || run.goal?.status === "active")),
    flush: async () => {
      inputs.current.prepare();
      services.workspaceTaskMemories.saveForUpdate();
      await services.runEvents.flush();
      await services.database.flush();
      await flushNativeCommands();
    },
    notify: (version) => inputs.current.notices.publish({ id: "application-update", revisionKey: version,
      tone: "success", title: `Orchestrator ${version} is available`, detail: "Open the account menu to download the update.", timeoutMs: null }),
  }));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    if (state.delivery === "manual") notices.dismiss("application-update");
  }, [state.delivery, notices.dismiss]);
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    const unlisten = listen<AppUpdateState>("app-update:state", (event) => { if (!cancelled) controller.accept(event.payload); });
    void commands.appUpdateState().then((value) => { if (!cancelled) { controller.accept(value); void controller.check("startup"); } }).catch(() => undefined);
    const interval = window.setInterval(() => void controller.check("timer"), 6 * 60 * 60 * 1000);
    const foreground = () => { if (document.visibilityState !== "hidden" && navigator.onLine) void controller.check("foreground"); };
    window.addEventListener("focus", foreground);
    window.addEventListener("online", foreground);
    return () => { cancelled = true; void unlisten.then((off) => off()).catch(() => undefined); clearInterval(interval); window.removeEventListener("focus", foreground); window.removeEventListener("online", foreground); };
  }, [controller]);
  useEffect(() => {
    if (!state.installing) return;
    // Capture prevents UI navigation and edits between persistence and the restart.
    const stop = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
    for (const event of ["pointerdown", "keydown", "beforeinput", "drop"]) window.addEventListener(event, stop, true);
    return () => { for (const event of ["pointerdown", "keydown", "beforeinput", "drop"]) window.removeEventListener(event, stop, true); };
  }, [state.installing]);
  const engine = useEngineController();
  useEffect(() => {
    const message = engine.error ?? engine.status?.message;
    if (message) notices.publish({ id: "engine-provisioning", revisionKey: message, tone: "warning", title: "Codex engine needs attention", detail: message, timeoutMs: null });
  }, [engine.error, engine.status, notices.publish]);
  const reportBug = useStableEvent(() => {
    inputs.current.closeAccountMenu();
    inputs.current.notices.dismiss("bug-report-feedback");
    void Promise.resolve().then(() => openUrl(BUG_REPORT_URL)).catch((error) => inputs.current.notices.publish({
      id: "bug-report-feedback", revisionKey: String(Date.now()), tone: "warning", title: "Couldn’t open bug report", detail: error instanceof Error ? error.message : String(error), timeoutMs: 60_000,
    }));
  });
  return { update: { state, act: () => { void controller.act(); } }, reportBug };
}
