import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { GitlabConnectionStatus } from "../../features/gitlab/api";
import type { GithubConnectionStatus } from "../../features/github/api";
import type { KanbanBoardSnapshotRecord, KanbanCardRecord, KanbanGitBinding, KanbanLocalReview } from "../../features/kanban/api";
import type { KanbanPullRequestRecord } from "../../features/reviews/api";
import type { Workspace, WorkspaceGitRepositoryStatus } from "../../features/workspaces/types";

// This entry is loaded only by gitlab-demo.html. No native commands leave this mock.
export const workspace: Workspace = {
  id: 987654, path: "/demo/atlas", label: "Atlas", default_account_id: null,
  selected_git_repository_path: null, created_at: "2026-09-16T10:00:00Z", last_opened_at: "2026-09-16T10:00:00Z",
};
const timestamp = "2026-09-16T10:00:00Z";
export const githubConnection: GithubConnectionStatus = {
  available: true, connected: true, login: "alex-demo", displayName: "Alex Morgan", avatarUrl: null,
  status: "connected", message: null, cliVersion: "2.96.0", deviceCode: null,
  verificationUri: null, loginGeneration: null, browserOpened: false,
};
export const repositories: WorkspaceGitRepositoryStatus[] = ["web", "platform", "docs"].map(label => ({
  workspacePath: workspace.path, gitRoot: `${workspace.path}/${label}`, currentBranch: "main",
  hasOrigin: true, hasUpstream: true, files: [],
  repository: { rootPath: `${workspace.path}/${label}`, relativePath: label, label },
}));
function hostConnection(host: string): GitlabConnectionStatus {
  return { host, available: true, connected: true, login: "alex-demo", displayName: "Alex Morgan",
    avatarUrl: null, status: "connected", message: null, cliVersion: "1.117.0" };
}
export let connections: GitlabConnectionStatus[] = [];
let board: KanbanBoardSnapshotRecord;
let notify: (message: string) => void = () => undefined;
let generation = 0;

function request(repo: string, provider: "github" | "gitlab", number: number, overrides: Partial<KanbanPullRequestRecord> = {}): KanbanPullRequestRecord {
  const host = provider === "github" ? "github.com" : repo === "platform" ? "gitlab.acme.example:8443" : "gitlab.com";
  const path = repo === "platform" ? "acme/engineering/platform" : `acme/${repo}`;
  return { provider, host, projectId: provider === "gitlab" ? 420 + number : null, projectPath: path,
    sourceRepositoryPath: `${workspace.path}/${repo}`, relativePath: repo, owner: path.slice(0, path.lastIndexOf("/")), repository: repo,
    number, url: `https://${host}/${path}/${provider === "gitlab" ? "-/merge_requests" : "pull"}/${number}`,
    baseBranch: "main", headBranch: "orchestrator/improve-navigation", draft: true, state: "open",
    publicationStatus: "draft", error: null, updatedAt: timestamp, ...overrides };
}
function card(id: string, title: string, repos: string[], overrides: Partial<KanbanCardRecord> = {}): KanbanCardRecord {
  return { id, workspaceId: workspace.id, chatId: 100 + id.length, title,
    description: "Sample card for the GitLab integration demo.", accountId: null, accessMode: "ask-for-approval",
    model: "gpt-5.3-codex", reasoningLevel: "medium", repositoryScope: "selected", stage: "in_review", sortPosition: 1024,
    executionState: "completed", reviewState: "awaiting_review", reviewChannel: "gitlab", currentAttemptId: `attempt-${id}`,
    stateVersion: 1, archivedAt: null, deletedAt: null, approvedAt: null, lastError: null, hasInheritedContext: false, hasStartedTurn: true,
    createdAt: timestamp, updatedAt: timestamp,
    repositories: repos.map(label => ({ repositoryPath: `${workspace.path}/${label}`, relativePath: label, label, includeDirtyChanges: false })),
    pullRequests: [], ...overrides };
}
export type Scenario = "connected" | "offline" | "expired" | "unavailable" | "closed" | "merged";
export function resetDemo(scenario: Scenario = "connected") {
  generation++;
  connections = [hostConnection("gitlab.com"), hostConnection("gitlab.acme.example:8443")];
  if (scenario === "offline" || scenario === "expired") {
    connections[1] = { ...connections[1], connected: false, status: scenario === "expired" ? "reconnect_required" : "disconnected",
      message: scenario === "expired" ? "Your token has expired. Reconnect this host to resume publishing." : null };
  }
  if (scenario === "unavailable") connections = connections.map(c => ({ ...c, available: false, connected: false, status: "unavailable", message: "The bundled GitLab CLI is missing. Reinstall Orchestrator to restore it." }));
  board = {
    workspaceId: workspace.id, revision: (board?.revision ?? 0) + 1,
    preferencesJson: JSON.stringify({ search: "", filters: {}, groupBy: "none", columnOrder: ["todo", "in_progress", "in_review", "done"] }),
    columns: [{ key: "todo", position: 0 }, { key: "in_progress", position: 1 }, { key: "in_review", position: 2 }, { key: "done", position: 3 }],
    cards: [
      card("next", "Improve keyboard navigation", ["web"], { stage: "todo", executionState: "idle", reviewState: "none", reviewChannel: null, hasStartedTurn: false, currentAttemptId: null }),
      card("running", "Add service health checks", ["platform"], { stage: "in_progress", executionState: "running", reviewState: "none", reviewChannel: null }),
      card("draft", "Polish the workspace switcher", ["web"], { description: "Draft merge request on GitLab.com.", pullRequests: [request("web", "gitlab", 42)] }),
      card("mixed", "Ship shared navigation", ["platform", "docs"], { description: "One card, a GitLab merge request and a GitHub pull request.", sortPosition: 2048, reviewChannel: "mixed", pullRequests: [request("platform", "gitlab", 18), request("docs", "github", 128)] }),
      card("local", "Review the empty state copy", ["platform"], { description: "Inspect the diff, then publish a draft merge request when the host is connected.", sortPosition: 3072, reviewChannel: "local" }),
      card("retry", "Handle session timeouts", ["web"], { description: "A failed publication can be retried from the card menu.", sortPosition: 4096, pullRequests: [request("web", "gitlab", 43, { number: null, url: null, publicationStatus: "failed", state: "unknown", error: "gitlab.com was temporarily unavailable. Retry publication." })] }),
      card("done", "Add accessible focus states", ["web"], { stage: "done", reviewState: "approved", pullRequests: [request("web", "gitlab", 39, { draft: false, state: "merged", publicationStatus: "merged" })] }),
      card("archived", "Update the deployment guide", ["platform"], { stage: "done", archivedAt: timestamp, reviewState: "approved", pullRequests: [request("platform", "gitlab", 14, { draft: false, state: "merged", publicationStatus: "merged" })] }),
    ],
  };
  if (scenario === "closed") board.cards[2].pullRequests = [request("web", "gitlab", 42, { draft: false, state: "closed", publicationStatus: "closed" })];
  if (scenario === "merged") {
    for (const item of board.cards.filter(c => c.id === "draft" || c.id === "mixed")) {
      item.pullRequests = item.pullRequests?.map(pr => ({ ...pr, draft: false, state: "merged", publicationStatus: "merged" }));
      item.stage = "done"; item.reviewState = "approved";
    }
  }
}
function bindings(item: KanbanCardRecord): KanbanGitBinding[] {
  return item.repositories.map(repo => ({ sourceRepositoryPath: repo.repositoryPath, relativePath: repo.relativePath,
    executionRoot: `/demo/worktrees/${item.id}`, sourceBranch: "main", baseBranch: "main", baseCommit: "demo-base",
    cardBranch: `orchestrator/${item.id}`, worktreePath: `/demo/worktrees/${item.id}/${repo.label}`, status: "ready", error: null }));
}
function snapshot(includeArchived = false) {
  return structuredClone({ ...board, cards: board.cards.filter(c => !c.deletedAt && (includeArchived || !c.archivedAt)) });
}
function requirement(path: string) {
  const repo = path.split("/").pop();
  const provider = repo === "docs" ? "github" : "gitlab";
  const host = repo === "docs" ? "github.com" : repo === "platform" ? "gitlab.acme.example:8443" : "gitlab.com";
  const connected = provider === "github" || connections.some(c => c.host === host && c.connected);
  return { repositoryPath: path, provider, host, message: connected ? null : `Connect ${host} in Settings to publish merge requests for ${repo}. Completed cards stay in local review.` };
}
const baseContent = 'export const emptyState = {\n  title: "No workspaces",\n  description: "Create a workspace.",\n};\n';
const headContent = 'export const emptyState = {\n  title: "Your next idea starts here",\n  description: "Open a repository to start working with your team.",\n  action: "Open repository",\n};\n';
const diff = 'diff --git a/src/emptyState.ts b/src/emptyState.ts\n--- a/src/emptyState.ts\n+++ b/src/emptyState.ts\n@@ -1,4 +1,5 @@\n export const emptyState = {\n-  title: "No workspaces",\n-  description: "Create a workspace.",\n+  title: "Your next idea starts here",\n+  description: "Open a repository to start working with your team.",\n+  action: "Open repository",\n };\n';
function localReview(item: KanbanCardRecord): KanbanLocalReview {
  const blocker = item.repositories.map(r => requirement(r.repositoryPath).message).find(Boolean) ?? null;
  return { cardId: item.id, title: item.title, objective: item.description, summary: "Clarified the empty state and added a direct action to open a repository.", reviewChannel: "local",
    canPublishGithub: false, canPublishRemote: !blocker, publicationDestination: "gitlab", publicationBlocker: blocker,
    repositories: bindings(item).map(b => ({ ...b, error: null, additions: 3, deletions: 2, files: ["src/emptyState.ts"], diff, isEmpty: false })) };
}

export function installDemo(onNotice: (message: string) => void) {
  if (!import.meta.env.DEV) throw new Error("The GitLab demo is available only in the development server.");
  notify = onNotice;
  resetDemo();
  mockWindows("gitlab-demo");
  mockIPC(async (command, payload) => {
    const args = (payload ?? {}) as Record<string, unknown>;
    const input = (args.request ?? args) as Record<string, unknown>;
    const item = board.cards.find(c => c.id === input.cardId);
    switch (command) {
      case "gitlab_connections": return structuredClone(connections);
      case "gitlab_connect": {
        const host = String(args.host).replace(/^https:\/\//i, "").replace(/\/$/, "").toLowerCase();
        if (!/^[a-z0-9.-]+(?::\d+)?$/.test(host)) throw new Error("Enter an HTTPS GitLab host without a subpath.");
        if (args.token === "invalid" || args.token === "expired") throw new Error("The token is invalid or expired. Check its api scope and try again.");
        let connection = connections.find(c => c.host === host);
        if (!connection) { connection = hostConnection(host); connections.push(connection); }
        connection.connected = false; connection.status = "connecting"; connection.message = null;
        const pending = connection;
        const currentGeneration = generation;
        window.setTimeout(() => {
          if (generation !== currentGeneration || pending.status !== "connecting") return;
          Object.assign(pending, hostConnection(host));
          notify(`Demo: connected to ${host}.`);
          window.dispatchEvent(new Event("focus"));
        }, 2400);
        return null;
      }
      case "gitlab_disconnect":
      case "gitlab_cancel_connection": {
        const connection = connections.find(c => c.host === args.host);
        if (connection) Object.assign(connection, { connected: false, status: "disconnected", message: null });
        return null;
      }
      case "review_connection_requirements": return (args.paths as string[]).map(requirement);
      case "kanban_workspace_bootstrap": return { snapshot: snapshot(Boolean(args.includeArchived)), bindings: board.cards.map(c => ({ cardId: c.id, bindings: bindings(c) })) };
      case "kanban_board_snapshot": return snapshot(Boolean(args.includeArchived));
      case "kanban_list_git_bindings": return item ? bindings(item) : [];
      case "kanban_git_reconcile": return { binding: input.binding, sourceAvailable: true, worktreeAvailable: true, branchAvailable: true, errors: [] };
      case "kanban_save_git_bindings": return input.bindings;
      case "list_git_branches": return { branches: ["main", "develop", "release"], currentBranch: "main" };
      case "review_sync_kanban_requests": return 0;
      case "kanban_update_preferences": {
        if (typeof input.preferencesJson === "string") board.preferencesJson = input.preferencesJson;
        board.revision++; return snapshot(true);
      }
      case "kanban_local_review":
      case "kanban_use_local_review":
        if (!item) throw new Error("Sample card not found.");
        item.reviewChannel = "local"; return localReview(item);
      case "kanban_git_file_diff": return { path: "/demo/atlas/platform/src/emptyState.ts", relativePath: "src/emptyState.ts", sections: [{ kind: "unstaged", title: "Changes", baseLabel: "main", headLabel: "Card branch", baseContent, headContent, baseTruncated: false, headTruncated: false, content: diff, isBinary: false }] };
      case "review_publish_kanban_card": {
        if (!item) throw new Error("Sample card not found.");
        const blocker = localReview(item).publicationBlocker;
        if (blocker) throw new Error(blocker);
        item.reviewChannel = "gitlab";
        item.pullRequests = item.repositories.map(r => request(r.label, "gitlab", r.label === "platform" ? 19 : 43));
        item.stateVersion++; board.revision++;
        return { cardId: item.id, pullRequests: structuredClone(item.pullRequests) };
      }
      case "kanban_approve_local_review":
      case "kanban_complete_local_review_without_changes":
      case "review_complete_kanban_without_request":
        if (!item) throw new Error("Sample card not found.");
        item.stage = "done"; item.reviewState = "approved"; board.revision++;
        return command === "kanban_approve_local_review" ? localReview(item) : structuredClone(item);
      case "kanban_archive_card":
        if (!item) throw new Error("Sample card not found.");
        item.archivedAt = input.archived === false ? null : timestamp; board.revision++;
        return structuredClone(item);
      case "plugin:opener|open_url": notify(`Demo link: ${String(args.url)}`); return null;
      default: throw new Error(`This demo focuses on GitLab connections and reviews. ${command} is not simulated.`);
    }
  }, { shouldMockEvents: true });
}
