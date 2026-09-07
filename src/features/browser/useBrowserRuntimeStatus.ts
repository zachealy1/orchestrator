import { useCallback, useEffect, useRef, useState } from "react";
import { useStableEvent } from "../../shared/reactRuntime";
import type { BrowserRuntimeStatus } from "./runtimeStatus";

export function useBrowserRuntimeStatus(
  key: string | null,
  load: () => Promise<BrowserRuntimeStatus>,
) {
  const [probe, setProbe] = useState<{
    key: string;
    value: BrowserRuntimeStatus | null;
  } | null>(null);
  const generation = useRef(0);
  const readStatus = useStableEvent(load);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (key === null) return;
    setProbe({ key, value: null });
    try {
      const value = await readStatus();
      if (request === generation.current) setProbe({ key, value });
    } catch {
      if (request === generation.current) {
        setProbe({ key, value: {
          status: "unknown",
          message: "Could not check this account’s browser runtime. This does not mean browsing is unavailable. Retry the check or reconnect the account.",
        } });
      }
    }
  }, [key, readStatus]);

  useEffect(() => {
    void refresh();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      generation.current += 1;
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  return { value: key !== null && probe?.key === key ? probe.value : null, refresh };
}
