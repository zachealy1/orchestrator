import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EMPTY_USAGE_LIMITS_STATE,
  mergeCodexRateLimitUpdate,
  normalizeCodexUsageLimits,
  readCodexRateLimitSnapshot,
  type AnalyticsUsageAccount,
  type CodexAccountRateLimitsResponse,
  type CodexUsageLimitsAccountState,
  type CodexUsageLimitsLoadResult,
} from "./usageLimits";

const REFRESH_INTERVAL_MS = 60_000;
const NOTIFICATION_REFRESH_DELAY_MS = 250;

type Options = {
  accounts: AnalyticsUsageAccount[];
  preferredAccountId: number | null;
  active: boolean;
  load: (account: AnalyticsUsageAccount) => Promise<CodexUsageLimitsLoadResult>;
};

export function useCodexUsageLimitsController({
  accounts,
  preferredAccountId,
  active,
  load,
}: Options) {
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [states, setStates] = useState<
    Record<number, CodexUsageLimitsAccountState | undefined>
  >({});
  const statesRef = useRef(states);
  const hasExplicitSelectionRef = useRef(false);
  const responsesRef = useRef(
    new Map<number, CodexAccountRateLimitsResponse>(),
  );
  const requestIdsRef = useRef(new Map<number, number>());
  const notificationTimersRef = useRef(new Map<number, number>());

  statesRef.current = states;

  const selectedAccount = useMemo(
    () =>
      accounts.find((account) => account.accountId === selectedAccountId) ??
      null,
    [accounts, selectedAccountId],
  );

  useEffect(() => {
    const selectedStillExists = accounts.some(
      (account) => account.accountId === selectedAccountId,
    );
    const preferred = accounts.find(
      (account) => account.accountId === preferredAccountId,
    );
    if (!hasExplicitSelectionRef.current) {
      setSelectedAccountId(preferred?.accountId ?? accounts[0]?.accountId ?? null);
      return;
    }
    if (selectedStillExists) return;

    hasExplicitSelectionRef.current = false;
    setSelectedAccountId(preferred?.accountId ?? accounts[0]?.accountId ?? null);
  }, [accounts, preferredAccountId, selectedAccountId]);

  const refreshAccount = useCallback(
    async (accountId: number) => {
      const account = accounts.find(
        (candidate) => candidate.accountId === accountId,
      );
      if (!account) return;

      const requestId = (requestIdsRef.current.get(accountId) ?? 0) + 1;
      requestIdsRef.current.set(accountId, requestId);
      setStates((current) => ({
        ...current,
        [accountId]: {
          ...(current[accountId] ?? EMPTY_USAGE_LIMITS_STATE),
          status: current[accountId]?.snapshot ? "ready" : "loading",
          refreshing: Boolean(current[accountId]?.snapshot),
          error: null,
        },
      }));

      try {
        const result = await load(account);
        if (requestIdsRef.current.get(accountId) !== requestId) return;
        if (result.kind !== "ready") {
          responsesRef.current.delete(accountId);
          setStates((current) => ({
            ...current,
            [accountId]: {
              status: result.kind,
              snapshot: null,
              refreshing: false,
              stale: false,
              error: null,
            },
          }));
          return;
        }

        responsesRef.current.set(accountId, result.response);
        setStates((current) => ({
          ...current,
          [accountId]: {
            status: "ready",
            snapshot: normalizeCodexUsageLimits(
              result.response,
              result.planType ?? account.planType,
            ),
            refreshing: false,
            stale: false,
            error: null,
          },
        }));
      } catch (error) {
        if (requestIdsRef.current.get(accountId) !== requestId) return;
        const message = error instanceof Error ? error.message : String(error);
        setStates((current) => {
          const currentState = current[accountId] ?? EMPTY_USAGE_LIMITS_STATE;
          return {
            ...current,
            [accountId]: {
              ...currentState,
              status: currentState.snapshot ? "ready" : "error",
              refreshing: false,
              stale: Boolean(currentState.snapshot),
              error: message,
            },
          };
        });
      }
    },
    [accounts, load],
  );

  useEffect(() => {
    if (!active || selectedAccountId === null) return;
    void refreshAccount(selectedAccountId);
  }, [active, refreshAccount, selectedAccountId]);

  useEffect(() => {
    if (!active || selectedAccountId === null) return;
    const refreshVisibleAccount = () => {
      if (document.visibilityState !== "visible") return;
      void refreshAccount(selectedAccountId);
    };
    const intervalId = window.setInterval(
      refreshVisibleAccount,
      REFRESH_INTERVAL_MS,
    );
    window.addEventListener("focus", refreshVisibleAccount);
    document.addEventListener("visibilitychange", refreshVisibleAccount);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshVisibleAccount);
      document.removeEventListener("visibilitychange", refreshVisibleAccount);
    };
  }, [active, refreshAccount, selectedAccountId]);

  useEffect(
    () => () => {
      notificationTimersRef.current.forEach((timerId) =>
        window.clearTimeout(timerId),
      );
      notificationTimersRef.current.clear();
    },
    [],
  );

  const selectAccount = useCallback((accountId: number) => {
    hasExplicitSelectionRef.current = true;
    setSelectedAccountId(accountId);
  }, []);

  const ingestRateLimitUpdate = useCallback(
    (accountId: number, value: unknown) => {
      const update = readCodexRateLimitSnapshot(value);
      if (!update) return;
      requestIdsRef.current.set(
        accountId,
        (requestIdsRef.current.get(accountId) ?? 0) + 1,
      );
      const response = mergeCodexRateLimitUpdate(
        responsesRef.current.get(accountId) ?? null,
        update,
      );
      responsesRef.current.set(accountId, response);
      const account = accounts.find(
        (candidate) => candidate.accountId === accountId,
      );
      setStates((current) => ({
        ...current,
        [accountId]: {
          status: "ready",
          snapshot: normalizeCodexUsageLimits(
            response,
            account?.planType ?? null,
          ),
          refreshing: false,
          stale: false,
          error: null,
        },
      }));

      const existingTimer = notificationTimersRef.current.get(accountId);
      if (existingTimer !== undefined) window.clearTimeout(existingTimer);
      if (!accounts.some((candidate) => candidate.accountId === accountId)) {
        return;
      }
      const timerId = window.setTimeout(() => {
        notificationTimersRef.current.delete(accountId);
        void refreshAccount(accountId);
      }, NOTIFICATION_REFRESH_DELAY_MS);
      notificationTimersRef.current.set(accountId, timerId);
    },
    [accounts, refreshAccount],
  );

  const retry = useCallback(() => {
    if (selectedAccountId !== null) void refreshAccount(selectedAccountId);
  }, [refreshAccount, selectedAccountId]);

  return {
    accounts,
    selectedAccountId,
    selectedAccount,
    state:
      (selectedAccountId === null ? null : states[selectedAccountId]) ??
      EMPTY_USAGE_LIMITS_STATE,
    selectAccount,
    retry,
    refreshAccount,
    ingestRateLimitUpdate,
  };
}
