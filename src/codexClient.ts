import { invoke } from "@tauri-apps/api/core";
import type {
  CodexConnectResult,
  OssProvider,
  PreflightReport,
  Workspace,
} from "./types";

export function connectCodex() {
  return invoke<CodexConnectResult>("codex_connect");
}

export function stopCodex() {
  return invoke<void>("codex_stop");
}

export function codexRpc<T>(method: string, params: Record<string, unknown> = {}) {
  return invoke<T>("codex_rpc", { method, params });
}

export function resolveCodexServerRequest(id: string | number, result: unknown) {
  return invoke<void>("codex_resolve_server_request", { id, result });
}

export function runPreflight(input: {
  workspace: Workspace;
  prompt: string;
  useOss: boolean;
  ossProvider: OssProvider;
}) {
  return invoke<PreflightReport>("run_preflight", {
    path: input.workspace.path,
    prompt: input.prompt,
    useOss: input.useOss,
    ossProvider: input.ossProvider,
  });
}

export async function getAuthStatus() {
  return codexRpc<{
    authMethod: string | null;
    authToken: string | null;
    requiresOpenaiAuth: boolean | null;
  }>("getAuthStatus", { includeToken: false, refreshToken: true });
}

export async function startLogin() {
  return codexRpc<
    | { type: "apiKey" }
    | { type: "chatgpt"; loginId: string; authUrl: string }
    | {
        type: "chatgptDeviceCode";
        loginId: string;
        verificationUrl: string;
        userCode: string;
      }
    | { type: "chatgptAuthTokens" }
  >("account/login/start", { type: "chatgpt" });
}
