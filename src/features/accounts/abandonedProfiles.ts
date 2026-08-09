import type { CodexAccountProfile } from "./types";

export const DEFAULT_CODEX_ACCOUNT_LABEL = "New Codex account";

export function isAbandonedCodexProfile(
  account: CodexAccountProfile,
  activeLoginAccountId: number | null,
) {
  return (
    account.id !== activeLoginAccountId &&
    account.label.trim() === DEFAULT_CODEX_ACCOUNT_LABEL &&
    !account.email?.trim() &&
    !account.plan_type &&
    (account.status === "pending" || account.status === "signed_out")
  );
}

export async function cleanupAbandonedCodexProfiles(
  accounts: CodexAccountProfile[],
  activeLoginAccountId: number | null,
  softDeleteAccount: (accountId: number) => Promise<void>,
  deleteProfile: (accountId: number) => Promise<void>,
) {
  const removedIds = new Set<number>();
  const warnings: string[] = [];
  await Promise.all(
    accounts
      .filter((account) =>
        isAbandonedCodexProfile(account, activeLoginAccountId),
      )
      .map(async (account) => {
        try {
          await softDeleteAccount(account.id);
          removedIds.add(account.id);
        } catch (error) {
          warnings.push(error instanceof Error ? error.message : String(error));
          return;
        }
        try {
          await deleteProfile(account.id);
        } catch (error) {
          warnings.push(error instanceof Error ? error.message : String(error));
        }
      }),
  );

  return {
    accounts: accounts.filter((account) => !removedIds.has(account.id)),
    warnings,
  };
}
