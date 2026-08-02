import { commands } from "../../generated/tauri";
import type { CodexAccountProfile, CodexAccountStatus } from "../../features/accounts/types";
import { FrontendDatabase } from "../database";

export function createAccountRepository(database: FrontendDatabase) {
  const getDatabase = () => database.get();
  const selectOne = <T>(query: string, bindValues: unknown[] = []) =>
    database.selectOne<T>(query, bindValues);

  async function listCodexAccounts() {
    const db = await getDatabase();
    return db.select<CodexAccountProfile[]>(
      `SELECT id, label, email, plan_type, status, last_error, last_used_at,
        created_at, updated_at, deleted_at
       FROM codex_accounts
       WHERE deleted_at IS NULL
       ORDER BY COALESCE(last_used_at, created_at) DESC, id DESC`,
    );
  }
  
  async function listDuplicateProfilesPendingCleanup() {
    const db = await getDatabase();
    const rows = await db.select<Array<{ id: number }>>(
      `SELECT id
       FROM codex_accounts
       WHERE deleted_at IS NOT NULL
         AND last_error = 'Duplicate account consolidated'`,
    );
    return rows.map((row) => row.id);
  }
  
  async function completeDuplicateProfileCleanup(accountId: number) {
    const db = await getDatabase();
    await db.execute(
      `UPDATE codex_accounts
       SET last_error = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND deleted_at IS NOT NULL
         AND last_error = 'Duplicate account consolidated'`,
      [accountId],
    );
  }
  
  async function createCodexAccount(label = "New Codex account") {
    const db = await getDatabase();
    const result = await db.execute(
      `INSERT INTO codex_accounts (label, status)
       VALUES ($1, 'pending')`,
      [label],
    );
    const account = await selectOne<CodexAccountProfile>(
      `SELECT id, label, email, plan_type, status, last_error, last_used_at,
        created_at, updated_at, deleted_at
       FROM codex_accounts WHERE id = $1`,
      [result.lastInsertId],
    );
    if (!account) {
      throw new Error("Codex account profile was not created");
    }
    return account;
  }
  
  async function updateCodexAccount(
    accountId: number,
    fields: Partial<{
      label: string;
      email: string | null;
      planType: string | null;
      status: CodexAccountStatus;
      lastError: string | null;
      touchLastUsed: boolean;
    }>,
  ) {
    const db = await getDatabase();
    const assignments: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown) => {
      assignments.push(`${column} = $${assignments.length + 1}`);
      values.push(value);
    };
  
    if ("label" in fields) add("label", fields.label);
    if ("email" in fields) add("email", fields.email);
    if ("planType" in fields) add("plan_type", fields.planType);
    if ("status" in fields) add("status", fields.status);
    if ("lastError" in fields) add("last_error", fields.lastError);
    if (fields.touchLastUsed) assignments.push("last_used_at = CURRENT_TIMESTAMP");
    assignments.push("updated_at = CURRENT_TIMESTAMP");
    values.push(accountId);
  
    await db.execute(
      `UPDATE codex_accounts SET ${assignments.join(", ")}
       WHERE id = $${values.length} AND deleted_at IS NULL`,
      values,
    );
  }
  
  async function renameCodexAccount(accountId: number, label: string) {
    await updateCodexAccount(accountId, { label: label.trim() });
  }
  
  async function setWorkspaceDefaultAccount(
    workspaceId: number,
    accountId: number | null,
  ) {
    const db = await getDatabase();
    await db.execute(
      "UPDATE workspaces SET default_account_id = $1 WHERE id = $2",
      [accountId, workspaceId],
    );
  }
  
  async function softDeleteCodexAccount(accountId: number) {
    await commands.softDeleteCodexAccountTransaction(accountId);
  }
  

  return {
    listCodexAccounts,
    listDuplicateProfilesPendingCleanup,
    completeDuplicateProfileCleanup,
    createCodexAccount,
    updateCodexAccount,
    renameCodexAccount,
    setWorkspaceDefaultAccount,
    softDeleteCodexAccount,
  };
}

export type AccountRepository = ReturnType<typeof createAccountRepository>;
