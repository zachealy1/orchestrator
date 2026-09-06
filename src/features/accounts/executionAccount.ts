import type { CodexAccountProfile } from "./types";

export function executionAccountAvailable(
  accountId: number | null | undefined,
  accounts: CodexAccountProfile[],
  sharedProfileAvailable: boolean,
): accountId is number {
  return accountId === 0
    ? sharedProfileAvailable
    : accounts.some((account) =>
        account.id === accountId && account.status === "signed_in" && !account.deleted_at,
      );
}

// Only for new work: an existing conversation's captured identity must not fall back.
export function selectAvailableExecutionAccount({
  preferredAccountId,
  currentAccountId,
  accounts,
  sharedProfileAvailable,
}: {
  preferredAccountId?: number | null;
  currentAccountId?: number | null;
  accounts: CodexAccountProfile[];
  sharedProfileAvailable: boolean;
}): number | null {
  return [preferredAccountId, currentAccountId, 0, ...accounts.map((account) => account.id)]
    .find((id) => executionAccountAvailable(id, accounts, sharedProfileAvailable)) ?? null;
}
