import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

const WINDOW_STATE_SETTLE_MS = 100;

export type WindowDragRegionMode = "true" | "deep";

export function supportsMacOsWindowDragging(
  tauriRuntime: boolean,
  platform: string,
  userAgent: string,
) {
  return tauriRuntime && /mac/i.test(`${platform} ${userAgent}`);
}

export function windowDragRegionValue(
  enabled: boolean,
  mode: WindowDragRegionMode,
) {
  return enabled ? mode : "false";
}

export function useMacOsWindowDragRegionsEnabled() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (
      !supportsMacOsWindowDragging(
        isTauri(),
        navigator.platform,
        navigator.userAgent,
      )
    ) {
      return;
    }

    const appWindow = getCurrentWindow();
    const unlisteners: Array<() => void> = [];
    let disposed = false;
    let settleTimer: number | null = null;

    const refresh = async () => {
      try {
        const fullscreen = await appWindow.isFullscreen();
        if (!disposed) setEnabled(!fullscreen);
      } catch {
        if (!disposed) setEnabled(false);
      }
    };

    const scheduleRefresh = () => {
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        settleTimer = null;
        void refresh();
      }, WINDOW_STATE_SETTLE_MS);
    };

    const registerUnlistener = (promise: Promise<() => void>) => {
      void promise
        .then((unlisten) => {
          if (disposed) unlisten();
          else unlisteners.push(unlisten);
        })
        .catch(() => {
          if (!disposed) setEnabled(false);
        });
    };

    void refresh();
    registerUnlistener(appWindow.onResized(scheduleRefresh));
    registerUnlistener(appWindow.onFocusChanged(scheduleRefresh));
    document.addEventListener("visibilitychange", scheduleRefresh);

    return () => {
      disposed = true;
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      document.removeEventListener("visibilitychange", scheduleRefresh);
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  return enabled;
}
