import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import type { CodexEngineStatus } from "../../generated/tauri";
import { useStableEvent } from "../../shared/reactRuntime";
import { checkEngineUpdates, prepareEngineUpdate, readEngineStatus } from "./api";
const CHECK_INTERVAL = 6 * 60 * 60_000;

export function useEngineController(enabled = isTauri()) {
  const [status, setStatus] = useState<CodexEngineStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const attemptedAt = useRef(0);
  const lastAnnounced = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const run = useStableEvent(async (operation: "status" | "check" | "install") => {
    if (!enabled || running.current) return;
    running.current = true; setBusy(true); setError(null);
    try {
      // Retry initial provisioning when the first launch was offline.
      const ready = operation === "install" ? null : await readEngineStatus();
      let next = ready;
      if (operation === "install") next = await prepareEngineUpdate();
      if (operation === "check") {
        attemptedAt.current = Date.now();
        next = await checkEngineUpdates();
      }
      if (next) {
        setStatus(next);
        if (next.updateAvailable && next.latestVersion !== lastAnnounced.current) {
          lastAnnounced.current = next.latestVersion;
          setAnnouncement(`Codex ${next.latestVersion} is available. Review the update in Settings.`);
        }
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { running.current = false; setBusy(false); }
  });
  const resume = useStableEvent(() => {
    if (document.visibilityState !== "hidden" && Date.now() - attemptedAt.current >= CHECK_INTERVAL) void run("check");
  });
  useEffect(() => {
    if (!enabled) return;
    void run("check");
    const timer = window.setInterval(resume, CHECK_INTERVAL);
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    return () => { clearInterval(timer); window.removeEventListener("online", resume); window.removeEventListener("focus", resume); };
  }, [enabled, resume, run]);
  return { status, busy, error, announcement, dismissAnnouncement: () => setAnnouncement(null), check: () => run("check"), install: () => run("install") };
}
export type EngineController = ReturnType<typeof useEngineController>;
