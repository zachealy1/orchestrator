import { commands } from "../../generated/tauri";
export type GitlabConnectionStatus = {
  host: string;
  available: boolean;
  connected: boolean;
  login: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  status: string;
  message: string | null;
  cliVersion: string | null;
};
export async function loadGitlabConnections(): Promise<
  GitlabConnectionStatus[]
> {
  return commands.gitlabConnections();
}
export async function connectGitlab(host: string, token: string | null) {
  await commands.gitlabConnect(host, token);
}
export async function cancelGitlabConnection(host: string) {
  await commands.gitlabCancelConnection(host);
}
export async function disconnectGitlab(host: string) {
  await commands.gitlabDisconnect(host);
}
