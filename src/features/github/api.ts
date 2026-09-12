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
  loginGeneration: number | null;
  browserOpened: boolean;
};

export type { KanbanPullRequestRecord } from "../reviews/api";
export { publishKanbanCard, syncKanbanPullRequests, completeKanbanWithoutPullRequest, openPullRequest } from "../reviews/api";

export function loadGithubConnection() {
  return commands.githubConnectionStatus() as Promise<GithubConnectionStatus>;
}

export function beginGithubConnection() {
  return commands.githubConnect() as Promise<GithubConnectionStatus>;
}

export function continueGithubConnection(generation: number, copyCode: boolean) {
  return commands.githubContinueConnection(
    generation,
    copyCode,
  ) as Promise<GithubConnectionStatus>;
}

export function cancelGithubConnection() {
  return commands.githubCancelConnection();
}

export function disconnectGithub() {
  return commands.githubDisconnect();
}
