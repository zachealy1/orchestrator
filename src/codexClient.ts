import { invoke } from "@tauri-apps/api/core";
import type {
  CodexConnectResult,
  CodexModel,
  ComposerContextFile,
  ModelListResponse,
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

export async function listCodexModels() {
  const models: CodexModel[] = [];
  let cursor: string | null = null;

  do {
    const response: ModelListResponse = await codexRpc<ModelListResponse>("model/list", {
      includeHidden: false,
      limit: 100,
      cursor,
    });
    models.push(...response.data.filter((model: CodexModel) => !model.hidden));
    cursor = response.nextCursor;
  } while (cursor);

  return models;
}

export async function readCodexFile(path: string) {
  const response = await codexRpc<{ dataBase64: string }>("fs/readFile", { path });
  return decodeBase64Utf8(response.dataBase64);
}

export async function setThreadGoal(threadId: string, objective: string) {
  return codexRpc("thread/goal/set", {
    threadId,
    objective,
    status: "active",
    tokenBudget: null,
  });
}

export async function searchCodexFiles(query: string, workspacePath: string | null) {
  if (!workspacePath || !query.trim()) {
    return [];
  }

  try {
    const response = await codexRpc<unknown>("fuzzyFileSearch", {
      query,
      roots: [workspacePath],
      cancellationToken: null,
    });
    return extractFileSearchResults(response, workspacePath);
  } catch {
    return [];
  }
}

function decodeBase64Utf8(value: string) {
  const binary = globalThis.atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function extractFileSearchResults(payload: unknown, workspacePath: string): ComposerContextFile[] {
  const files = readArray(readObject(payload).files)
    .map((item) => readObject(item))
    .map((item): ComposerContextFile | null => {
      const relativePath = readString(item.path);
      const root = readString(item.root) ?? workspacePath;
      const name = readString(item.file_name) ?? basename(relativePath);

      if (!relativePath || !name) {
        return null;
      }

      return {
        path: joinPath(root, relativePath),
        name,
        source: "search" as const,
        status: "ready" as const,
      };
    })
    .filter((file): file is ComposerContextFile => file !== null);

  return files.slice(0, 8);
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function basename(path: string | null) {
  if (!path) {
    return null;
  }

  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function joinPath(root: string, path: string) {
  if (path.startsWith("/")) {
    return path;
  }

  return `${root.replace(/[\\/]+$/, "")}/${path.replace(/^[\\/]+/, "")}`;
}
