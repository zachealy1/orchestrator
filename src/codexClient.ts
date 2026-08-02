import { invoke } from "@tauri-apps/api/core";
import type {
  RunCommandActivity,
  RunEditedFile,
} from "./lib/codexEventReducer";
import type {
  AgentNotificationPermissionStatus,
  AgentNotificationRequest,
  AgentNotificationSendResult,
  AgentNotificationTarget,
} from "./lib/agentNotifications";
import type { WorkspaceCommitIntentContext } from "./lib/commitMessage";
import type {
  ActiveCodexLogin,
  CodexAccountResponse,
  BrowserRuntimeStatus,
  BrowserSessionState,
  BrowserSessionTarget,
  CodexConnectResult,
  CodexLoginResponse,
  CodexModel,
  CodexSkillSummary,
  ComposerContextFile,
  DroppedContextPathInspection,
  ExternalTranscriptSnapshot,
  ExternalThreadHistoryIndex,
  GitBranchList,
  ImageAttachmentPreview,
  ModelListResponse,
  OssProvider,
  PreflightReport,
  PromptQueueContextInspection,
  PreparedBrowserSession,
  Workspace,
  WorkspaceFilePreview,
  WorkspaceGitActionResult,
  WorkspaceGitDiff,
  WorkspaceGitOverview,
  WorkspaceGitRepository,
  WorkspaceTreeEntry,
} from "./types";
import type { LocalWebPreviewProbeResult } from "./lib/webPreview";
import type { ThreadGoalSetResponse } from "./lib/goalProgress";
import type { SubagentTranscript } from "./lib/subagents";

export function readBrowserRuntimeStatus() {
  return invoke<BrowserRuntimeStatus>("browser_runtime_status");
}

export function prepareBrowserSession(target: BrowserSessionTarget) {
  return invoke<PreparedBrowserSession>("browser_session_prepare", { target });
}

export function readBrowserSessionStatus(token: string) {
  return invoke<BrowserSessionState>("browser_session_status", { token });
}

export function focusBrowserSession(token: string) {
  return invoke<BrowserSessionState>("browser_session_focus", { token });
}

export function updateBrowserSessionTarget(
  token: string,
  target: BrowserSessionTarget,
) {
  return invoke<BrowserSessionState>("browser_session_update_target", {
    token,
    target,
  });
}

export function stopBrowserSession(token: string) {
  return invoke<BrowserSessionState>("browser_session_stop", { token });
}

export function probeLocalWebPreview(url: string) {
  return invoke<LocalWebPreviewProbeResult>("probe_local_web_preview", { url });
}

export function connectCodex(accountId: number) {
  return invoke<CodexConnectResult>("codex_connect", { accountId });
}

export function connectDefaultCodexProfile() {
  return invoke<CodexConnectResult>("codex_default_profile_connect");
}

export function stopCodex(accountId: number) {
  return invoke<void>("codex_stop", { accountId });
}

export function readActiveCodexLogin() {
  return invoke<ActiveCodexLogin | null>("codex_active_login");
}

export function stopDefaultCodexProfile() {
  return invoke<void>("codex_default_profile_stop");
}

export function readAgentNotificationPermissionStatus() {
  return invoke<AgentNotificationPermissionStatus>(
    "agent_notification_permission_status",
  );
}

export function requestAgentNotificationPermission() {
  return invoke<AgentNotificationPermissionStatus>(
    "agent_notification_request_permission",
  );
}

export function sendAgentNotification(request: AgentNotificationRequest) {
  return invoke<AgentNotificationSendResult>("agent_notification_send", {
    request,
  });
}

export function removeAgentNotification(eventKey: string) {
  return invoke<void>("agent_notification_remove", { eventKey });
}

export function takePendingAgentNotificationActivation() {
  return invoke<AgentNotificationTarget | null>(
    "agent_notification_take_pending_activation",
  );
}

export function openAgentNotificationSettings() {
  return invoke<void>("agent_notification_open_settings");
}

export function deleteCodexProfile(accountId: number) {
  return invoke<void>("codex_delete_profile", { accountId });
}

export function codexRpc<T>(accountId: number, method: string, params: unknown = {}) {
  return invoke<T>("codex_rpc", { accountId, method, params });
}

export function codexDefaultProfileRpc<T>(method: string, params: unknown = {}) {
  return invoke<T>("codex_default_profile_rpc", { method, params });
}

export function readProjectedSubagentThread(input: {
  accountId: number | null;
  profileKey: string;
  threadId: string;
}) {
  return invoke<SubagentTranscript>("codex_projected_subagent_thread_read", {
    accountId: input.accountId,
    profileKey: input.profileKey,
    threadId: input.threadId,
  });
}

export type HistoricalTurnActivityResponse = {
  commands: Array<Omit<RunCommandActivity, "output">>;
  editedFiles: RunEditedFile[];
  nextCursor: string | null;
};

export function loadDefaultProfileTurnActivity(input: {
  threadId: string;
  turnId: string;
  cursor?: string | null;
  limit?: number;
}) {
  return invoke<HistoricalTurnActivityResponse>(
    "codex_default_profile_turn_activity",
    {
      threadId: input.threadId,
      turnId: input.turnId,
      cursor: input.cursor ?? null,
      limit: input.limit ?? 50,
    },
  );
}

export function indexDefaultProfileThread(input: {
  threadId: string;
  sourceVersion: string;
  pageSize?: number;
  requestId: string;
}) {
  return invoke<ExternalThreadHistoryIndex>(
    "codex_default_profile_thread_index",
    {
      threadId: input.threadId,
      sourceVersion: input.sourceVersion,
      pageSize: input.pageSize ?? 20,
      requestId: input.requestId,
    },
  );
}

export function cancelDefaultProfileThreadIndex(requestId: string) {
  return invoke<void>("codex_default_profile_thread_index_cancel", {
    requestId,
  });
}

export function syncDefaultProfileThreadTranscript(input: {
  threadId: string;
  sourceVersion: string;
  pageSize?: number;
  requestId: string;
}) {
  return invoke<ExternalTranscriptSnapshot>(
    "codex_default_profile_thread_transcript_sync",
    {
      threadId: input.threadId,
      sourceVersion: input.sourceVersion,
      pageSize: input.pageSize ?? 20,
      requestId: input.requestId,
    },
  );
}

export function cancelDefaultProfileThreadTranscript(requestId: string) {
  return invoke<void>("codex_default_profile_thread_transcript_cancel", {
    requestId,
  });
}

export function resolveCodexServerRequest(
  accountId: number,
  id: string | number,
  requestToken: string,
  result: unknown,
) {
  return invoke<void>("codex_resolve_server_request", {
    accountId,
    id,
    requestToken,
    result,
  });
}

export function resolveDefaultCodexServerRequest(
  id: string | number,
  requestToken: string,
  result: unknown,
) {
  return invoke<void>("codex_default_profile_resolve_server_request", {
    id,
    requestToken,
    result,
  });
}

export function listGitBranches(path: string, repositoryPath?: string | null) {
  return invoke<GitBranchList>("list_git_branches", {
    path,
    repositoryPath: repositoryPath ?? null,
  });
}

export function checkoutGitBranch(
  workspacePath: string,
  branch: string,
  repositoryPath?: string | null,
) {
  return invoke<{ branch: string }>("checkout_git_branch_in_workspace", {
    workspacePath,
    repositoryPath: repositoryPath ?? null,
    branch,
  });
}

export function createGitBranch(
  workspacePath: string,
  branch: string,
  repositoryPath?: string | null,
) {
  return invoke<{ branch: string }>("create_git_branch_in_workspace", {
    workspacePath,
    repositoryPath: repositoryPath ?? null,
    branch,
  });
}

export function commitWorkspaceChanges(
  workspacePath: string,
  message: string,
  includeUnstaged: boolean,
  repositoryPath?: string | null,
) {
  return invoke<WorkspaceGitActionResult>("commit_workspace_changes", {
    workspacePath,
    repositoryPath: repositoryPath ?? null,
    message,
    includeUnstaged,
  });
}

export function generateWorkspaceCommitMessage(input: {
  workspacePath: string;
  repositoryPath?: string | null;
  accountId: number | null;
  includeUnstaged: boolean;
  model: string | null;
  intentContext?: WorkspaceCommitIntentContext | null;
}) {
  return invoke<{ message: string; source: "codex" }>(
    "generate_workspace_commit_message",
    {
      workspacePath: input.workspacePath,
      repositoryPath: input.repositoryPath ?? null,
      accountId: input.accountId,
      includeUnstaged: input.includeUnstaged,
      model: input.model,
      intentContext: input.intentContext ?? null,
    },
  );
}

export function generateChatTitle(input: {
  workspacePath: string;
  accountId: number;
  model: string | null;
  initialPrompt: string;
}) {
  return invoke<{ title: string }>("generate_chat_title", {
    workspacePath: input.workspacePath,
    accountId: input.accountId,
    model: input.model,
    initialPrompt: input.initialPrompt,
  });
}

export function pushWorkspaceBranch(
  workspacePath: string,
  repositoryPath?: string | null,
) {
  return invoke<WorkspaceGitActionResult>("push_workspace_branch", {
    workspacePath,
    repositoryPath: repositoryPath ?? null,
  });
}

export function discoverWorkspaceGitRepositories(workspacePath: string) {
  return invoke<WorkspaceGitRepository[]>(
    "discover_workspace_git_repositories",
    { workspacePath },
  );
}

export function listWorkspaceGitStatus(
  workspacePath: string,
  forceDiscovery = false,
) {
  return invoke<WorkspaceGitOverview>("list_workspace_git_status", {
    workspacePath,
    forceDiscovery,
  });
}

export function readWorkspaceGitDiff(
  workspacePath: string,
  filePath: string,
  repositoryPath?: string | null,
) {
  return invoke<WorkspaceGitDiff>("read_workspace_git_diff", {
    workspacePath,
    repositoryPath: repositoryPath ?? null,
    filePath,
  });
}

export function undoWorkspaceGitDiff(workspacePath: string, diff: string) {
  return invoke<WorkspaceGitActionResult>("undo_workspace_git_diff", {
    workspacePath,
    diff,
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

export function prepareImageAttachment(path: string) {
  return invoke<ImageAttachmentPreview | null>("prepare_image_attachment", {
    path,
  });
}

export function inspectDroppedContextPaths(paths: string[]) {
  return invoke<DroppedContextPathInspection>("inspect_dropped_context_paths", {
    paths,
  });
}

export function inspectPromptQueueContext(
  workspacePath: string,
  paths: string[],
) {
  return invoke<PromptQueueContextInspection>("inspect_prompt_queue_context", {
    workspacePath,
    paths,
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
    useHostedLoginSuccessPage: true,
    appBrand: "codex",
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

export async function readDefaultCodexFile(path: string) {
  const response = await codexDefaultProfileRpc<{ dataBase64: string }>(
    "fs/readFile",
    { path },
  );
  return decodeBase64Utf8(response.dataBase64);
}

export async function setThreadGoal(
  accountId: number,
  threadId: string,
  objective: string,
) {
  return codexRpc<ThreadGoalSetResponse>(accountId, "thread/goal/set", {
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
