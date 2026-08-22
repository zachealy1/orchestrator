import { commands } from "./generated/tauri";
import type {
  RunCommandActivity,
  RunEditedFile,
  RunToolActivity,
} from "./lib/codexEventReducer";
import {
  describeToolActivity,
  normalizeToolActivityStatus,
} from "./lib/toolActivity";
import type {
  AgentNotificationPermissionStatus,
  AgentNotificationRequest,
  AgentNotificationSendResult,
  AgentNotificationTarget,
} from "./lib/agentNotifications";
import type { WorkspaceCommitIntentContext } from "./lib/commitMessage";
import type { ActiveCodexLogin, CodexAccountResponse, CodexConnectResult, CodexLoginResponse, CodexModel, ModelListResponse, OssProvider } from "./features/codex/types";
import type { BrowserRuntimeStatus, BrowserSessionState, BrowserSessionTarget, DefaultBrowserCapabilityStatus, DefaultBrowserTab, PreparedBrowserSession } from "./features/browser/types";
import type { CodexSkillSummary, ComposerContextFile, DroppedContextPathInspection, ImageAttachmentPreview } from "./features/composer/types";
import type { ExternalTranscriptSnapshot, ExternalThreadHistoryIndex } from "./features/conversations/types";
import type { GitBranchList, Workspace, WorkspaceFilePreview, WorkspaceGitActionResult, WorkspaceGitDiff, WorkspaceGitOverview, WorkspaceGitRepository, WorkspaceTreeEntry } from "./features/workspaces/types";
import type { PreflightReport } from "./features/runs/types";
import type { PromptQueueContextInspection } from "./features/queue/types";
import type { LocalWebPreviewProbeResult } from "./lib/webPreview";
import type { ThreadGoalSetResponse } from "./lib/goalProgress";
import type { SubagentTranscript } from "./lib/subagents";

function commandResult<T>(result: Promise<unknown>): Promise<T> {
  return result as Promise<T>;
}

export function readBrowserRuntimeStatus() {
  return commandResult<BrowserRuntimeStatus>(commands.browserRuntimeStatus());
}

export function prepareBrowserSession(target: BrowserSessionTarget) {
  return commandResult<PreparedBrowserSession>(commands.browserSessionPrepare(target));
}

export function readBrowserSessionStatus(token: string) {
  return commandResult<BrowserSessionState>(commands.browserSessionStatus(token));
}

export function focusBrowserSession(token: string) {
  return commandResult<BrowserSessionState>(commands.browserSessionFocus(token));
}

export function updateBrowserSessionTarget(
  token: string,
  target: BrowserSessionTarget,
) {
  return commandResult<BrowserSessionState>(
    commands.browserSessionUpdateTarget(token, target),
  );
}

export function stopBrowserSession(token: string) {
  return commandResult<BrowserSessionState>(commands.browserSessionStop(token));
}

export function readDefaultBrowserCapabilityStatus() {
  return commandResult<DefaultBrowserCapabilityStatus>(
    commands.defaultBrowserCapabilityStatus(),
  );
}

export function installDefaultBrowserExtension() {
  return commandResult<void>(commands.defaultBrowserInstallExtension());
}

export function openDefaultBrowserAccessibilitySettings() {
  return commandResult<void>(commands.defaultBrowserOpenAccessibilitySettings());
}

export function listDefaultBrowserTabs(token: string) {
  return commandResult<DefaultBrowserTab[]>(commands.browserSessionListTabs(token));
}

export function attachDefaultBrowserTab(token: string, tabId: number) {
  return commandResult<BrowserSessionState>(
    commands.browserSessionAttachTab(token, tabId),
  );
}

export function probeLocalWebPreview(url: string) {
  return commandResult<LocalWebPreviewProbeResult>(commands.probeLocalWebPreview(url));
}

export function connectCodex(accountId: number) {
  return commandResult<CodexConnectResult>(commands.codexConnect(accountId));
}

export function connectDefaultCodexProfile() {
  return commandResult<CodexConnectResult>(commands.codexDefaultProfileConnect());
}

export function stopCodex(accountId: number) {
  return commandResult<void>(commands.codexStop(accountId));
}

export function readActiveCodexLogin() {
  return commandResult<ActiveCodexLogin | null>(commands.codexActiveLogin());
}

export function stopDefaultCodexProfile() {
  return commandResult<void>(commands.codexDefaultProfileStop());
}

export function continueTaskInCodexDesktop(
  workspacePath: string,
  prompt: string,
) {
  return commandResult<void>(
    commands.codexDesktopContinueTask(workspacePath, prompt),
  );
}

export function readAgentNotificationPermissionStatus() {
  return commandResult<AgentNotificationPermissionStatus>(
    commands.agentNotificationPermissionStatus(),
  );
}

export function requestAgentNotificationPermission() {
  return commandResult<AgentNotificationPermissionStatus>(
    commands.agentNotificationRequestPermission(),
  );
}

export function sendAgentNotification(request: AgentNotificationRequest) {
  return commandResult<AgentNotificationSendResult>(
    commands.agentNotificationSend({
      title: request.title,
      body: request.body,
      groupKey: request.groupKey ?? null,
      target: {
        eventKey: request.target.eventKey,
        kind: request.target.kind,
        workspaceId: request.target.workspaceId ?? null,
        chatId: request.target.chatId ?? null,
        runId: request.target.runId ?? null,
        entryClientId: request.target.entryClientId ?? null,
        requestId: request.target.requestId ?? null,
        planItemId: request.target.planItemId ?? null,
        accountId: request.target.accountId ?? null,
        profileKey: request.target.profileKey ?? null,
        threadId: request.target.threadId ?? null,
        turnId: request.target.turnId ?? null,
        subagentThreadId: request.target.subagentThreadId ?? null,
      },
    }),
  );
}

export function removeAgentNotification(eventKey: string) {
  return commandResult<void>(commands.agentNotificationRemove(eventKey));
}

export function takePendingAgentNotificationActivation() {
  return commandResult<AgentNotificationTarget | null>(
    commands.agentNotificationTakePendingActivation(),
  );
}

export function openAgentNotificationSettings() {
  return commandResult<void>(commands.agentNotificationOpenSettings());
}

export function deleteCodexProfile(accountId: number) {
  return commandResult<void>(commands.codexDeleteProfile(accountId));
}

export function codexRpc<T>(accountId: number, method: string, params: unknown = {}) {
  return commandResult<T>(commands.codexRpc(accountId, method, params));
}

export function codexDefaultProfileRpc<T>(method: string, params: unknown = {}) {
  return commandResult<T>(commands.codexDefaultProfileRpc(method, params));
}

export function readProjectedSubagentThread(input: {
  accountId: number | null;
  profileKey: string;
  threadId: string;
}) {
  return commandResult<SubagentTranscript>(
    commands.codexProjectedSubagentThreadRead(
      input.accountId,
      input.profileKey,
      input.threadId,
    ),
  );
}

export type HistoricalTurnActivityResponse = {
  commands: Array<Omit<RunCommandActivity, "output">>;
  editedFiles: RunEditedFile[];
  toolActivities: RunToolActivity[];
  nextCursor: string | null;
};

export async function loadDefaultProfileTurnActivity(input: {
  threadId: string;
  turnId: string;
  cursor?: string | null;
  limit?: number;
}) {
  const response = await commands.codexDefaultProfileTurnActivity(
    input.threadId,
    input.turnId,
    input.cursor ?? null,
    input.limit ?? 50,
  );
  return projectHistoricalTurnActivityResponse(response);
}

export async function loadPersistedRunActivity(input: {
  runId: number;
  cursor?: string | null;
  limit?: number;
}) {
  const response = await commands.codexPersistedRunActivity(
    input.runId,
    input.cursor ?? null,
    input.limit ?? 100,
  );
  return projectHistoricalTurnActivityResponse(response);
}

function projectHistoricalTurnActivityResponse(
  response: Awaited<ReturnType<typeof commands.codexDefaultProfileTurnActivity>>,
) {
  return {
    commands: response.commands.map((command) => ({
      ...command,
      status: normalizeHistoricalCommandStatus(command.status),
    })),
    editedFiles: response.editedFiles as RunEditedFile[],
    toolActivities: (response.toolActivities ?? []).map((activity) => {
      const status = normalizeToolActivityStatus(activity.status, "completed");
      const presentation = describeToolActivity(
        {
          type: activity.itemType,
          server: activity.server,
          tool: activity.tool,
          arguments: activity.title ? { title: activity.title } : {},
        },
        status,
      );
      return {
        id: activity.id,
        ...presentation,
        safeDetails: activity.safeDetails,
        status,
        startedAt: null,
        completedAt: null,
        durationMs: activity.durationMs,
      } satisfies RunToolActivity;
    }),
    nextCursor: response.nextCursor,
  } satisfies HistoricalTurnActivityResponse;
}

function normalizeHistoricalCommandStatus(
  status: string,
): Omit<RunCommandActivity, "output">["status"] {
  if (status === "pending" || status === "running" || status === "failed" || status === "declined") {
    return status;
  }
  if (status === "awaiting-approval") return "awaiting-approval";
  return "completed";
}

export function indexDefaultProfileThread(input: {
  threadId: string;
  sourceVersion: string;
  pageSize?: number;
  requestId: string;
}) {
  return commandResult<ExternalThreadHistoryIndex>(
    commands.codexDefaultProfileThreadIndex(
      input.threadId,
      input.sourceVersion,
      input.pageSize ?? 20,
      input.requestId,
    ),
  );
}

export function cancelDefaultProfileThreadIndex(requestId: string) {
  return commandResult<void>(commands.codexDefaultProfileThreadIndexCancel(requestId));
}

export function syncDefaultProfileThreadTranscript(input: {
  threadId: string;
  sourceVersion: string;
  pageSize?: number;
  requestId: string;
}) {
  return commandResult<ExternalTranscriptSnapshot>(
    commands.codexDefaultProfileThreadTranscriptSync(
      input.threadId,
      input.sourceVersion,
      input.pageSize ?? 20,
      input.requestId,
    ),
  );
}

export function cancelDefaultProfileThreadTranscript(requestId: string) {
  return commandResult<void>(
    commands.codexDefaultProfileThreadTranscriptCancel(requestId),
  );
}

export function resolveCodexServerRequest(
  accountId: number,
  id: string | number,
  requestToken: string,
  result: unknown,
) {
  return commandResult<void>(
    commands.codexResolveServerRequest(accountId, id, requestToken, result),
  );
}

export function resolveDefaultCodexServerRequest(
  id: string | number,
  requestToken: string,
  result: unknown,
) {
  return commandResult<void>(
    commands.codexDefaultProfileResolveServerRequest(id, requestToken, result),
  );
}

export function listGitBranches(path: string, repositoryPath?: string | null) {
  return commandResult<GitBranchList>(
    commands.listGitBranches(path, repositoryPath ?? null),
  );
}

export function checkoutGitBranch(
  workspacePath: string,
  branch: string,
  repositoryPath?: string | null,
) {
  return commandResult<{ branch: string }>(
    commands.checkoutGitBranchInWorkspace(
      workspacePath,
      repositoryPath ?? null,
      branch,
    ),
  );
}

export function createGitBranch(
  workspacePath: string,
  branch: string,
  repositoryPath?: string | null,
) {
  return commandResult<{ branch: string }>(
    commands.createGitBranchInWorkspace(
      workspacePath,
      repositoryPath ?? null,
      branch,
    ),
  );
}

export function commitWorkspaceChanges(
  workspacePath: string,
  message: string,
  includeUnstaged: boolean,
  repositoryPath?: string | null,
) {
  return commandResult<WorkspaceGitActionResult>(
    commands.commitWorkspaceChanges(
      workspacePath,
      repositoryPath ?? null,
      message,
      includeUnstaged,
    ),
  );
}

export function generateWorkspaceCommitMessage(input: {
  workspacePath: string;
  repositoryPath?: string | null;
  accountId: number | null;
  includeUnstaged: boolean;
  model: string | null;
  intentContext?: WorkspaceCommitIntentContext | null;
}) {
  return commandResult<{ message: string; source: "codex" }>(
    commands.generateWorkspaceCommitMessage(
      input.workspacePath,
      input.repositoryPath ?? null,
      input.accountId,
      input.includeUnstaged,
      input.model,
      input.intentContext ?? null,
    ),
  );
}

export function generateChatTitle(input: {
  workspacePath: string;
  accountId: number;
  model: string | null;
  initialPrompt: string;
}) {
  return commandResult<{ title: string }>(
    commands.generateChatTitle(
      input.workspacePath,
      input.accountId,
      input.model,
      input.initialPrompt,
    ),
  );
}

export function pushWorkspaceBranch(
  workspacePath: string,
  repositoryPath?: string | null,
) {
  return commandResult<WorkspaceGitActionResult>(
    commands.pushWorkspaceBranch(workspacePath, repositoryPath ?? null),
  );
}

export function discoverWorkspaceGitRepositories(workspacePath: string) {
  return commandResult<WorkspaceGitRepository[]>(
    commands.discoverWorkspaceGitRepositories(workspacePath),
  );
}

export function listWorkspaceGitStatus(
  workspacePath: string,
  forceDiscovery = false,
) {
  return commandResult<WorkspaceGitOverview>(
    commands.listWorkspaceGitStatus(workspacePath, forceDiscovery),
  );
}

export function readWorkspaceGitDiff(
  workspacePath: string,
  filePath: string,
  repositoryPath?: string | null,
) {
  return commandResult<WorkspaceGitDiff>(
    commands.readWorkspaceGitDiff(
      workspacePath,
      repositoryPath ?? null,
      filePath,
    ),
  );
}

export function undoWorkspaceGitDiff(
  workspacePath: string,
  diff: string,
  pathStrip?: number | null,
) {
  return commandResult<WorkspaceGitActionResult>(
    commands.undoWorkspaceGitDiff(workspacePath, diff, pathStrip ?? null),
  );
}

export function listWorkspaceDirectory(
  workspacePath: string,
  directoryPath: string,
) {
  return commandResult<WorkspaceTreeEntry[]>(
    commands.listWorkspaceDirectory(workspacePath, directoryPath),
  );
}

export function readWorkspaceFilePreview(workspacePath: string, filePath: string) {
  return commandResult<WorkspaceFilePreview>(
    commands.readWorkspaceFilePreview(workspacePath, filePath),
  );
}

export function readWorkspaceFilePreviewChunk(
  workspacePath: string,
  filePath: string,
  offset: number,
  version: string,
) {
  return commandResult<WorkspaceFilePreview>(
    commands.readWorkspaceFilePreviewChunk(
      workspacePath,
      filePath,
      offset,
      version,
    ),
  );
}

export function readWorkspaceFilePreviewVersion(
  workspacePath: string,
  filePath: string,
) {
  return commandResult<string>(
    commands.readWorkspaceFilePreviewVersion(workspacePath, filePath),
  );
}

export function prepareImageAttachment(path: string) {
  return commandResult<ImageAttachmentPreview | null>(
    commands.prepareImageAttachment(path),
  );
}

export function inspectDroppedContextPaths(paths: string[]) {
  return commandResult<DroppedContextPathInspection>(
    commands.inspectDroppedContextPaths(paths),
  );
}

export function inspectPromptQueueContext(
  workspacePath: string,
  paths: string[],
) {
  return commandResult<PromptQueueContextInspection>(
    commands.inspectPromptQueueContext(workspacePath, paths),
  );
}

export function runPreflight(input: {
  workspace: Workspace;
  prompt: string;
  useOss: boolean;
  ossProvider: OssProvider;
}) {
  return commandResult<PreflightReport>(
    commands.runPreflight(
      input.workspace.path,
      input.prompt,
      input.useOss,
      input.ossProvider,
    ),
  );
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

export async function listCodexSkills(
  accountId: number,
  input: { forceReload?: boolean } = {},
) {
  const methods: Array<[string, Record<string, unknown>]> = [
    ["skills/list", { cwds: [], forceReload: input.forceReload ?? false }],
    ["skill/list", { includeHidden: false }],
  ];
  let lastError: unknown = null;

  for (const [method, params] of methods) {
    try {
      const response = await codexRpc<unknown>(accountId, method, params);
      return extractCodexSkills(response);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to load Codex skills.");
}

export async function listDefaultCodexSkills(
  input: { forceReload?: boolean } = {},
) {
  const methods: Array<[string, Record<string, unknown>]> = [
    ["skills/list", { cwds: [], forceReload: input.forceReload ?? false }],
    ["skill/list", { includeHidden: false }],
  ];
  let lastError: unknown = null;

  for (const [method, params] of methods) {
    try {
      const response = await codexDefaultProfileRpc<unknown>(method, params);
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
  const topLevelSource =
    readArray(payload).length > 0
      ? readArray(payload)
      : readArray(root.skills).length > 0
        ? readArray(root.skills)
        : readArray(root.data).length > 0
          ? readArray(root.data)
          : readArray(root.items);
  const groupedSkills = topLevelSource.flatMap((item) =>
    readArray(readObject(item).skills),
  );
  const source = groupedSkills.length > 0 ? groupedSkills : topLevelSource;

  const seen = new Set<string>();
  return source
    .map((item) => readObject(item))
    .map((item): CodexSkillSummary | null => {
      if (item.hidden === true || item.enabled === false) {
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
          readString(item.shortDescription) ??
          readString(readObject(item.interface).shortDescription) ??
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
