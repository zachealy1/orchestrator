import { useEffect, useMemo, useRef, useState } from "react";
import { consumeCodexRateLimitResetCredit } from "../../codexClient";
import { useStableEvent } from "../../shared/reactRuntime";
import type {
  AnalyticsUsageAccount,
  CodexRateLimitResetCredit,
  CodexUsageLimitsAccountState,
  CodexUsageResetOutcome,
} from "./usageLimits";

export type UsageResetConfirmation = {
  account: AnalyticsUsageAccount;
  idempotencyKey: string;
  credit: CodexRateLimitResetCredit | null;
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
  const retryAttempts = useRef(new Map<number, Pick<UsageResetConfirmation, "idempotencyKey" | "credit">>());
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
  const canRequest = (account: AnalyticsUsageAccount | null, creditId?: string) => {
    if (
      !account ||
      submittingRef.current ||
      unsupported.has(account.accountId) ||
      !isAvailable(account)
    )
      return false;
    const state = getAccountState(account.accountId);
    const retry = retryAttempts.current.get(account.accountId);
    const credits = state.snapshot?.raw.rateLimitResetCredits;
    const credit = credits?.credits?.find((entry) => entry.id === creditId);
    const available = (credits?.availableCount ?? 0) > 0 &&
      (creditId === undefined || (credit?.status === "available" &&
        (credit.expiresAt === null || credit.expiresAt * 1_000 > Date.now())));
    return (
      state.status === "ready" &&
      !state.stale &&
      !state.refreshing &&
      (retry ? creditId === undefined || creditId === retry.credit?.id : available)
    );
  };

  useEffect(() => {
    if (confirmation && !isAvailable(confirmation.account)) {
      confirmationRef.current = null;
      setConfirmation(null);
    }
    for (const accountId of retryAttempts.current.keys()) {
      if (!accounts.some((account) => account.accountId === accountId))
        retryAttempts.current.delete(accountId);
    }
  });

  const requestReset = useStableEvent((creditId?: string) => {
    if (
      !selectedAccount ||
      !canRequest(selectedAccount, creditId) ||
      confirmationRef.current
    )
      return;
    const retry = retryAttempts.current.get(selectedAccount.accountId);
    const credit = retry?.credit ?? getAccountState(selectedAccount.accountId)
      .snapshot?.raw.rateLimitResetCredits?.credits?.find((entry) => entry.id === creditId) ?? null;
    const attempt: UsageResetConfirmation = {
      account: { ...selectedAccount },
      idempotencyKey: retry?.idempotencyKey ?? crypto.randomUUID(),
      credit,
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
    if (!attempt || !canRequest(attempt.account, attempt.credit?.id)) return;
    const { account, idempotencyKey, credit } = attempt;
    submittingRef.current = true;
    setPending(true);
    retryAttempts.current.set(account.accountId, { idempotencyKey, credit });
    setConfirmation({ ...attempt, status: "submitting", error: null });
    try {
      const result = await consumeCodexRateLimitResetCredit(
        account.profileKey,
        account.accountId,
        idempotencyKey,
        credit?.id,
      );
      retryAttempts.current.delete(account.accountId);
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
        retryAttempts.current.delete(account.accountId);
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
  const canConfirm = confirmation !== null && canRequest(confirmation.account, confirmation.credit?.id);
  const retrying = accountId !== undefined && retryAttempts.current.has(accountId);
  const retryCredit = accountId === undefined ? null : retryAttempts.current.get(accountId)?.credit ?? null;
  const message =
    accountId === undefined ? null : (messages[accountId] ?? null);
  const state = useMemo(
    () => ({
      canReset,
      canConfirm,
      retrying,
      retryCredit,
      pending,
      confirmation,
      message,
    }),
    [canReset, canConfirm, retrying, retryCredit, pending, confirmation, message],
  );
  const actions = useMemo(
    () => ({ requestReset, cancelReset, confirmReset }),
    [requestReset, cancelReset, confirmReset],
  );
  return { state, actions };
}
