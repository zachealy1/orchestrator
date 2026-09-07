import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { useStableEvent } from "../../shared/reactRuntime";
import type { CodexModel } from "./types";

const REFRESH_INTERVAL = 15 * 60_000;
const RESUME_THROTTLE = 60_000;
type Setter<T> = Dispatch<SetStateAction<T>>;

/** Catalogs are scoped to profiles. A failed refresh never borrows another account's models. */
export function useModelCatalog(input: {
  accountId: number | null;
  accountIdRef: MutableRefObject<number | null>;
  enabled: boolean;
  load: (accountId: number) => Promise<CodexModel[]>;
  setModels: Setter<CodexModel[]>;
  setSelectedModelId: Setter<string | null>;
  setSelectedReasoningEffort: Setter<string | null>;
  setModelLoadError: Setter<string | null>;
}) {
  const cache = useRef(new Map<number, CodexModel[]>());
  const inFlight = useRef(new Map<number, Promise<CodexModel[]>>());
  const lastAttempt = useRef(new Map<number, number>());
  const previousEnabled = useRef(input.enabled);
  const authGeneration = useRef(0);
  if (previousEnabled.current && !input.enabled) {
    authGeneration.current += 1;
    if (input.accountId !== null) {
      cache.current.delete(input.accountId);
      inFlight.current.delete(input.accountId);
    }
  }
  previousEnabled.current = input.enabled;
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const apply = useStableEvent((models: CodexModel[]) => {
    input.setModels(models);
    input.setSelectedModelId((current) => current && models.some((m) => m.id === current)
      ? current : models.find((m) => m.isDefault)?.id ?? models[0]?.id ?? null);
  });
  const refresh = useStableEvent(async (accountId: number) => {
    if (accountId === input.accountIdRef.current) { setRefreshing(true); setNotice(null); }
    const generation = authGeneration.current;
    let request = inFlight.current.get(accountId);
    if (!request) {
      lastAttempt.current.set(accountId, Date.now());
      request = Promise.resolve().then(() => input.load(accountId));
      inFlight.current.set(accountId, request);
    }
    try {
      const models = await request;
      if (authGeneration.current !== generation) return;
      cache.current.set(accountId, models);
      if (input.accountIdRef.current !== accountId || authGeneration.current !== generation) return;
      apply(models);
      input.setModelLoadError(null);
      setNotice("Models are up to date.");
    } catch (error) {
      if (input.accountIdRef.current !== accountId || authGeneration.current !== generation) return;
      const message = error instanceof Error ? error.message : String(error);
      const previous = cache.current.get(accountId);
      if (previous?.length) {
        apply(previous);
        input.setModelLoadError(null);
        setNotice("Could not refresh models. Showing the last available list for this account.");
      } else {
        input.setModels([]);
        input.setSelectedModelId(null);
        input.setSelectedReasoningEffort(null);
        input.setModelLoadError(message);
        setNotice("Could not load models. Check your connection and try again.");
      }
    } finally {
      if (inFlight.current.get(accountId) === request) inFlight.current.delete(accountId);
      if (input.accountIdRef.current === accountId) setRefreshing(false);
    }
  });
  const refreshOnResume = useStableEvent(() => {
    const accountId = input.accountIdRef.current;
    if (!input.enabled || accountId === null || document.visibilityState === "hidden") return;
    if (Date.now() - (lastAttempt.current.get(accountId) ?? 0) >= RESUME_THROTTLE) void refresh(accountId);
  });
  useEffect(() => {
    setNotice(null);
    setRefreshing(input.accountId !== null && inFlight.current.has(input.accountId));
  }, [input.accountId]);
  useEffect(() => {
    if (!input.enabled || input.accountId === null) return;
    // Startup, login, and account selection also call refresh explicitly.
    const interval = window.setInterval(refreshOnResume, REFRESH_INTERVAL);
    window.addEventListener("focus", refreshOnResume);
    window.addEventListener("online", refreshOnResume);
    document.addEventListener("visibilitychange", refreshOnResume);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refreshOnResume);
      window.removeEventListener("online", refreshOnResume);
      document.removeEventListener("visibilitychange", refreshOnResume);
    };
  }, [input.accountId, input.enabled, refreshOnResume]);
  return { refresh, refreshing, notice };
}
