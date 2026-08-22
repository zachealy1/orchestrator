import type { CodexAccessMode, CodexProfileKey } from "../codex/types";

export type BrowserFamily = "chrome" | "edge" | "brave" | "safari";
export type BrowserSessionBackend = "browser-bridge" | "safari-mcp";

export type DefaultBrowserInfo = {
  bundleId: string | null;
  name: string | null;
  path: string | null;
  supported: boolean;
  family: BrowserFamily | null;
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
  browserSkillVersion: string | null;
  browserServiceCompatible: boolean;
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
  unavailableReason: string | null;
  browserSkillVersion: string;
  browserServiceCompatible: boolean;
  backendHealthy: boolean;
};

export type PreparedBrowserSession = {
  token: string;
  config: Record<string, unknown>;
  state: BrowserSessionState;
};

export type BrowserSessionPreparation = {
  session: PreparedBrowserSession | null;
  unavailableReason: string | null;
  browserFamily: BrowserFamily | null;
};
