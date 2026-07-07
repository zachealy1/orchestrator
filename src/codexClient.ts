import { invoke } from "@tauri-apps/api/core";
import type {
  CodexAccountResponse,
  CodexConnectResult,
  CodexLoginResponse,
  CodexModel,
  CodexSkillSummary,
  ComposerContextFile,
  GitBranchList,
  ModelListResponse,
  OssProvider,
  PreflightReport,
  Workspace,
  WorkspaceFilePreview,
  WorkspaceGitActionResult,
  WorkspaceGitDiff,
  WorkspaceGitStatusSnapshot,
  WorkspaceTreeEntry,
} from "./types";

export function connectCodex(accountId: number) {
  return invoke<CodexConnectResult>("codex_connect", { accountId });
}

export function stopCodex(accountId: number) {
  return invoke<void>("codex_stop", { accountId });
}

export function deleteCodexProfile(accountId: number) {
  return invoke<void>("codex_delete_profile", { accountId });
}

export function codexRpc<T>(accountId: number, method: string, params: unknown = {}) {
  return invoke<T>("codex_rpc", { accountId, method, params });
}

export function resolveCodexServerRequest(
  accountId: number,
  id: string | number,
  result: unknown,
) {
  return invoke<void>("codex_resolve_server_request", { accountId, id, result });
}

export function listGitBranches(path: string) {
  return invoke<GitBranchList>("list_git_branches", { path });
}

export function checkoutGitBranch(path: string, branch: string) {
  return invoke<{ branch: string }>("checkout_git_branch", { path, branch });
}

export function commitWorkspaceChanges(
  workspacePath: string,
  message: string,
  includeUnstaged: boolean,
) {
  return invoke<WorkspaceGitActionResult>("commit_workspace_changes", {
    workspacePath,
    message,
    includeUnstaged,
  });
}

export function pushWorkspaceBranch(workspacePath: string) {
  return invoke<WorkspaceGitActionResult>("push_workspace_branch", {
    workspacePath,
  });
}

export function listWorkspaceGitStatus(workspacePath: string) {
  return invoke<WorkspaceGitStatusSnapshot>("list_workspace_git_status", {
    workspacePath,
  });
}

export function readWorkspaceGitDiff(workspacePath: string, filePath: string) {
  return invoke<WorkspaceGitDiff>("read_workspace_git_diff", {
    workspacePath,
    filePath,
  });
}

export function listWorkspaceDirectory(
  workspacePath: string,
  directoryPath: string,
) {
  return invoke<WorkspaceTreeEntry[]>("list_workspace_directory", {
    workspacePath,
    directoryPath,
  });
}

export function readWorkspaceFilePreview(workspacePath: string, filePath: string) {
  return invoke<WorkspaceFilePreview>("read_workspace_file_preview", {
    workspacePath,
    filePath,
  });
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

export async function readCodexAccount(
  accountId: number,
  input: { refreshToken?: boolean } = {},
) {
  return codexRpc<CodexAccountResponse>(accountId, "account/read", {
    refreshToken: input.refreshToken ?? true,
  });
}

export async function startCodexLogin(accountId: number) {
  return codexRpc<CodexLoginResponse>(accountId, "account/login/start", {
    type: "chatgpt",
  });
}

export async function cancelCodexLogin(accountId: number, loginId: string) {
  return codexRpc<void>(accountId, "account/login/cancel", { loginId });
}

export async function logoutCodexAccount(accountId: number) {
  return codexRpc<void>(accountId, "account/logout", null);
}

export async function listCodexModels(accountId: number) {
  const models: CodexModel[] = [];
  let cursor: string | null = null;

  do {
    const response: ModelListResponse = await codexRpc<ModelListResponse>(
      accountId,
      "model/list",
      {
        includeHidden: false,
        limit: 100,
        cursor,
      },
    );
    models.push(...response.data.filter((model: CodexModel) => !model.hidden));
    cursor = response.nextCursor;
  } while (cursor);

  return models;
}

export async function listCodexSkills(accountId: number) {
  const methods = ["skill/list", "skills/list"];
  let lastError: unknown = null;

  for (const method of methods) {
    try {
      const response = await codexRpc<unknown>(accountId, method, {
        includeHidden: false,
      });
      return extractCodexSkills(response);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to load Codex skills.");
}

export async function readCodexFile(accountId: number, path: string) {
  const response = await codexRpc<{ dataBase64: string }>(accountId, "fs/readFile", {
    path,
  });
  return decodeBase64Utf8(response.dataBase64);
}

export async function setThreadGoal(
  accountId: number,
  threadId: string,
  objective: string,
) {
  return codexRpc(accountId, "thread/goal/set", {
    threadId,
    objective,
    status: "active",
    tokenBudget: null,
  });
}

export async function searchCodexFiles(
  accountId: number,
  query: string,
  workspacePath: string | null,
) {
  if (!workspacePath || !query.trim()) {
    return [];
  }

  try {
    const response = await codexRpc<unknown>(accountId, "fuzzyFileSearch", {
      query,
      roots: [workspacePath],
      cancellationToken: null,
    });
    return extractFileSearchResults(response, workspacePath);
  } catch {
    return [];
  }
}

function extractCodexSkills(payload: unknown): CodexSkillSummary[] {
  const root = readObject(payload);
  const source =
    readArray(payload).length > 0
      ? readArray(payload)
      : readArray(root.skills).length > 0
        ? readArray(root.skills)
        : readArray(root.data).length > 0
          ? readArray(root.data)
          : readArray(root.items);

  const seen = new Set<string>();
  return source
    .map((item) => readObject(item))
    .map((item): CodexSkillSummary | null => {
      if (item.hidden === true) {
        return null;
      }

      const id =
        readString(item.id) ??
        readString(item.name) ??
        readString(item.title) ??
        readString(item.slug);
      const name =
        readString(item.name) ??
        readString(item.title) ??
        readString(item.displayName) ??
        id;

      if (!id || !name || seen.has(id)) {
        return null;
      }

      seen.add(id);
      return {
        id,
        name,
        description:
          readString(item.description) ??
          readString(item.summary) ??
          readString(item.subtitle),
      };
    })
    .filter((skill): skill is CodexSkillSummary => skill !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
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
