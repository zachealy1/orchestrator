import { useEffect, useMemo, useRef, useState } from "react";
import { consumeCodexRateLimitResetCredit } from "../../codexClient";
import { useStableEvent } from "../../shared/reactRuntime";
import type {
  AnalyticsUsageAccount,
  CodexUsageLimitsAccountState,
  CodexUsageResetOutcome,
} from "./usageLimits";

export type UsageResetConfirmation = {
  account: AnalyticsUsageAccount;
  idempotencyKey: string;
  status: "confirming" | "submitting" | "error";
  error: string | null;
};

type Options = {
  accounts: AnalyticsUsageAccount[];
  selectedAccount: AnalyticsUsageAccount | null;
  getAccountState: (accountId: number) => CodexUsageLimitsAccountState;
  refreshAccount: (accountId: number) => Promise<void>;
};

const OUTCOME_MESSAGES: Record<CodexUsageResetOutcome, string> = {
  reset: "Usage reset applied.",
  alreadyRedeemed: "This usage reset was already applied.",
  nothingToReset: "There are no eligible usage limits to reset.",
  noCredit: "No earned usage resets are available for this account.",
};

export function useCodexUsageResetController({
  accounts,
  selectedAccount,
  getAccountState,
  refreshAccount,
}: Options) {
  const [confirmation, setConfirmation] =
    useState<UsageResetConfirmation | null>(null);
  const [pending, setPending] = useState(false);
  const [messages, setMessages] = useState<Record<number, string | undefined>>(
    {},
  );
  const [unsupported, setUnsupported] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const confirmationRef = useRef(confirmation);
  const submittingRef = useRef(false);
  // Keep uncertain attempts even when their dialog is dismissed and reopened.
  const retryKeys = useRef(new Map<number, string>());
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;
  confirmationRef.current = confirmation;

  const isAvailable = (account: AnalyticsUsageAccount) =>
    accountsRef.current.some(
      (candidate) =>
        candidate.accountId === account.accountId &&
        candidate.profileKey === account.profileKey,
    ) &&
    !["signed-out", "unsupported"].includes(
      getAccountState(account.accountId).status,
    );
  const canRequest = (account: AnalyticsUsageAccount | null) => {
    if (
      !account ||
      submittingRef.current ||
      unsupported.has(account.accountId) ||
      !isAvailable(account)
    )
      return false;
    const state = getAccountState(account.accountId);
    return (
      state.status === "ready" &&
      !state.stale &&
      !state.refreshing &&
      ((state.snapshot?.raw.rateLimitResetCredits?.availableCount ?? 0) > 0 ||
        retryKeys.current.has(account.accountId))
    );
  };

  useEffect(() => {
    if (confirmation && !isAvailable(confirmation.account)) {
      confirmationRef.current = null;
      setConfirmation(null);
    }
    for (const accountId of retryKeys.current.keys()) {
      if (!accounts.some((account) => account.accountId === accountId))
        retryKeys.current.delete(accountId);
    }
  });

  const requestReset = useStableEvent(() => {
    if (
      !selectedAccount ||
      !canRequest(selectedAccount) ||
      confirmationRef.current
    )
      return;
    const attempt: UsageResetConfirmation = {
      account: { ...selectedAccount },
      idempotencyKey:
        retryKeys.current.get(selectedAccount.accountId) ?? crypto.randomUUID(),
      status: "confirming",
      error: null,
    };
    confirmationRef.current = attempt;
    setConfirmation(attempt);
  });
  const cancelReset = useStableEvent(() => {
    if (submittingRef.current) return;
    confirmationRef.current = null;
    setConfirmation(null);
  });
  const confirmReset = useStableEvent(async () => {
    const attempt = confirmationRef.current;
    if (!attempt || !canRequest(attempt.account)) return;
    const { account, idempotencyKey } = attempt;
    submittingRef.current = true;
    setPending(true);
    retryKeys.current.set(account.accountId, idempotencyKey);
    setConfirmation({ ...attempt, status: "submitting", error: null });
    try {
      const result = await consumeCodexRateLimitResetCredit(
        account.profileKey,
        account.accountId,
        idempotencyKey,
      );
      retryKeys.current.delete(account.accountId);
      if (isAvailable(account)) {
        setMessages((current) => ({
          ...current,
          [account.accountId]: OUTCOME_MESSAGES[result.outcome],
        }));
      }
      // The consume response has no updated windows. Never infer new usage or counts.
      await refreshAccount(account.accountId).catch(() => {
        // Usage loading owns its stale/error state; the redemption remains successful.
      });
      confirmationRef.current = null;
      setConfirmation(null);
    } catch (error) {
      if (!isAvailable(account)) return;
      const message = error instanceof Error ? error.message : String(error);
      if (
        /method not found|unknown method|unsupported method|-32601/i.test(
          message,
        )
      ) {
        retryKeys.current.delete(account.accountId);
        setUnsupported((current) => new Set(current).add(account.accountId));
        setMessages((current) => ({
          ...current,
          [account.accountId]:
            "Usage resets are unavailable in this Codex engine. Update the application to use earned resets.",
        }));
        confirmationRef.current = null;
        setConfirmation(null);
      } else {
        setConfirmation({
          ...attempt,
          status: "error",
          error: `Could not confirm the reset. Retry to check the same request. ${message}`,
        });
      }
    } finally {
      submittingRef.current = false;
      setPending(false);
    }
  });

  const accountId = selectedAccount?.accountId;
  const canReset = canRequest(selectedAccount);
  const canConfirm = confirmation !== null && canRequest(confirmation.account);
  const retrying = accountId !== undefined && retryKeys.current.has(accountId);
  const message =
    accountId === undefined ? null : (messages[accountId] ?? null);
  const state = useMemo(
    () => ({
      canReset,
      canConfirm,
      retrying,
      pending,
      confirmation,
      message,
    }),
    [canReset, canConfirm, retrying, pending, confirmation, message],
  );
  const actions = useMemo(
    () => ({ requestReset, cancelReset, confirmReset }),
    [requestReset, cancelReset, confirmReset],
  );
  return { state, actions };
}
