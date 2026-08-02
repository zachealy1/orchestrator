import type { CodexPlanType, CodexProfileKey } from "../codex/types";

export type CodexAccountStatus = "pending" | "signed_in" | "signed_out" | "error";

export type CodexAccountProfile = {
  id: number;
  label: string;
  email: string | null;
  plan_type: CodexPlanType | null;
  status: CodexAccountStatus;
  last_error: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PendingAccountHandoff = {
  workspaceId: number;
  chatId: number;
  fromProfileKey: CodexProfileKey | null;
  fromThreadId: string | null;
  targetAccountId: number;
  targetProfileKey: CodexProfileKey;
};

export type AccountHandoffCandidate = PendingAccountHandoff & {
  fromLabel: string;
  targetLabel: string;
  status: "idle" | "selecting";
  error: string | null;
};
