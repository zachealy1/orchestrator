import { openUrl } from "@tauri-apps/plugin-opener";
import { commands } from "../../generated/tauri";

export type KanbanPullRequestRecord = {
  provider?: "github" | "gitlab";
  host?: string;
  projectId?: number | null;
  projectPath?: string | null;
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

export function publishKanbanCard(cardId: string) {
  return commands.reviewPublishKanbanCard(cardId);
}
export function syncKanbanPullRequests(
  workspaceId?: number | null,
  knownBoardRevision?: number | null,
) {
  return commands.reviewSyncKanbanRequests(
    workspaceId ?? null,
    knownBoardRevision ?? null,
  );
}
export function completeKanbanWithoutPullRequest(cardId: string) {
  return commands.reviewCompleteKanbanWithoutRequest(cardId);
}
export function openPullRequest(url: string) {
  return openUrl(url);
}
export function loadReviewRequirements(paths: string[]) {
  return commands.reviewConnectionRequirements(paths);
}
export function reviewRequestNoun(channel?: string | null) {
  return channel === "gitlab"
    ? "merge request"
    : channel === "mixed"
      ? "review request"
      : "pull request";
}
export function reviewRequestNumber(request: KanbanPullRequestRecord) {
  return `${request.provider === "gitlab" ? "!" : "#"}${request.number}`;
}
export function requestGroupChannel(
  requests: readonly KanbanPullRequestRecord[],
) {
  const providers = new Set(
    requests.map((request) => request.provider ?? "github"),
  );
  return providers.size > 1
    ? "mixed"
    : providers.has("gitlab")
      ? "gitlab"
      : "github";
}
