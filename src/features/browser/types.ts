import type { CodexAccessMode, CodexProfileKey } from "../codex/types";

export type BrowserSessionLifecycleStatus =
  | "prepared"
  | "ready"
  | "starting"
  | "running"
  | "awaiting-approval"
  | "stopping"
  | "stopped"
  | "error";

export type BrowserRuntimeStatus = {
  available: boolean;
  message: string | null;
};

export type BrowserSessionTarget = {
  profileKey: CodexProfileKey;
  workspaceId: number;
  chatId: number | null;
  runId: number | null;
  entryId: string;
  threadId: string | null;
  turnId: string | null;
  accessMode: CodexAccessMode;
};

export type BrowserSessionState = {
  token: string;
  status: BrowserSessionLifecycleStatus;
  target: BrowserSessionTarget;
  browserPid: number | null;
  error: string | null;
};

export type PreparedBrowserSession = {
  token: string;
  config: Record<string, unknown>;
  state: BrowserSessionState;
};
