import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import type { CodexEngineStatus } from "../../generated/tauri";
import { useStableEvent } from "../../shared/reactRuntime";
import { readEngineStatus } from "./api";

export function useEngineController(enabled = isTauri()) {
  const [status, setStatus] = useState<CodexEngineStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const running = useRef<number | null>(null);
  const retry = useStableEvent(async () => {
    if (!enabled || running.current !== null) return;
    const request = ++generation.current;
    running.current = request;
    setBusy(true);
    setError(null);
    try {
      // This only reads/provisions the selected engine, never discovers updates.
      const next = await readEngineStatus();
      if (request === generation.current) setStatus(next);
    } catch (reason) {
      if (request === generation.current) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      if (running.current === request) running.current = null;
      if (request === generation.current) setBusy(false);
    }
  });
  useEffect(() => {
    if (!enabled) {
      setBusy(false);
      return;
    }
    void retry();
    return () => {
      generation.current += 1;
      running.current = null;
    };
  }, [enabled, retry]);
  return { status, busy, error, retry };
}
