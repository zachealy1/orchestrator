import type { CodexAccessMode, CodexProfileKey } from "../codex/types";

export type BrowserExecutionTarget = "default-browser" | "isolated";
export type BrowserSessionBackend = "default-browser" | "isolated";

export type DefaultBrowserInfo = {
  bundleId: string | null;
  name: string | null;
  path: string | null;
  supported: boolean;
};

export type DefaultBrowserCapabilityStatus = {
  browser: DefaultBrowserInfo | null;
  extensionId: string;
  extensionConnected: boolean;
  nativeHostInstalled: boolean;
  accessibilityTrusted: boolean;
  extensionPath: string | null;
  message: string | null;
};

export type DefaultBrowserTab = {
  id: number;
  title: string;
  origin: string;
  active: boolean;
  inCurrentGroup: boolean;
};

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
  defaultBrowser: DefaultBrowserCapabilityStatus | null;
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
  executionTarget: BrowserExecutionTarget;
  chatTitle: string;
};

export type BrowserSessionState = {
  token: string;
  status: BrowserSessionLifecycleStatus;
  target: BrowserSessionTarget;
  browserPid: number | null;
  error: string | null;
  backend: BrowserSessionBackend;
  browser: DefaultBrowserInfo | null;
  extensionConnected: boolean;
  chatGroupKey: string | null;
  controlledTabId: number | null;
  fallbackReason: string | null;
};

export type PreparedBrowserSession = {
  token: string;
  config: Record<string, unknown>;
  state: BrowserSessionState;
};
