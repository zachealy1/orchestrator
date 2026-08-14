import { openUrl } from "@tauri-apps/plugin-opener";
import { commands } from "../../generated/tauri";

export type GithubConnectionStatus = {
  available: boolean;
  connected: boolean;
  login: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  status: string;
  message: string | null;
  cliVersion: string | null;
  deviceCode: string | null;
  verificationUri: string | null;
};

export type KanbanPullRequestRecord = {
  sourceRepositoryPath: string;
  relativePath: string;
  owner: string | null;
  repository: string | null;
  number: number | null;
  url: string | null;
  baseBranch: string;
  headBranch: string;
  draft: boolean;
  state: string;
  publicationStatus:
    | "queued"
    | "publishing"
    | "draft"
    | "ready"
    | "closed"
    | "merged"
    | "failed"
    | "nothing_to_publish";
  error: string | null;
  updatedAt: string;
};

export function loadGithubConnection() {
  return commands.githubConnectionStatus() as Promise<GithubConnectionStatus>;
}

export function beginGithubConnection() {
  return commands.githubConnect() as Promise<GithubConnectionStatus>;
}

export function cancelGithubConnection() {
  return commands.githubCancelConnection();
}

export function disconnectGithub() {
  return commands.githubDisconnect();
}

export function publishKanbanCard(cardId: string) {
  return commands.githubPublishKanbanCard(cardId);
}

export function syncKanbanPullRequests(workspaceId?: number | null) {
  return commands.githubSyncKanbanPullRequests(workspaceId ?? null);
}

export function completeKanbanWithoutPullRequest(cardId: string) {
  return commands.githubCompleteKanbanWithoutPullRequest(cardId);
}

export function openPullRequest(url: string) {
  return openUrl(url);
}
