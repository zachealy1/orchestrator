import { useEffect, useMemo, useRef, useState } from "react";
import type { Workspace, WorkspaceGitDiff } from "../workspaces/types";
import type { CommitMessageGenerationSnapshot } from "../workspaces/runtimeState";
import type { WorkspaceGitOperationRequest, GitOperationKind } from "../../lib/gitOperations";
import { sourceControlApi, type SourceControlStatus, type GitCommitDetails, type GitHistoryCommit, type GitHistoryCursor } from "./api";
import { appendGraph, type GraphRow, type GraphState } from "./graphLayout";
import { gitOperationRequest, gitTargetKey, groupChanges, type ChangeSelection, type ChatGitTarget, type GitOperationOutcome } from "./types";

export type SourceControlServices = {
  execute: (request: WorkspaceGitOperationRequest) => Promise<GitOperationOutcome>;
  generate: (snapshot: CommitMessageGenerationSnapshot) => Promise<string>;
  refresh: (workspace: Workspace, target: ChatGitTarget) => Promise<void>;
};
type Input = {
  active: boolean; target: ChatGitTarget | null; workspace: Workspace | null;
  externallyBusy: boolean; accountId: number | null; model: string | null;
  services: SourceControlServices; api?: typeof sourceControlApi;
  activityVersion?: string;
};
type HistoryState = { key: string; commits: GitHistoryCommit[]; rows: GraphRow[]; graph: GraphState; cursor: GitHistoryCursor | null };
const emptyHistory = (key: string): HistoryState => ({ key, commits: [], rows: [], graph: { lanes: [], nextColor: 0 }, cursor: null });
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
export function gitError(error: unknown) {
  const detail = message(error);
  return /authentication|permission denied|terminal prompts disabled|could not read username|publickey/i.test(detail)
    ? `Git authentication failed. Update your Git credentials and try again. ${detail}` : detail;
}

export function useSourceControl(input: Input) {
  const { active, target, workspace, externallyBusy, api = sourceControlApi } = input;
  const key = gitTargetKey(target);
  const identity = useRef(key); identity.current = key;
  const epoch = useRef(0);
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState<"changes" | "history">("changes");
  const [snapshot, setSnapshot] = useState<{ key: string; data: SourceControlStatus } | null>(null);
  const [history, setHistory] = useState<HistoryState>(emptyHistory(""));
  const [loading, setLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [feedback, setFeedback] = useState<{ key: string; message: string } | null>(null);
  const [pending, setPending] = useState<{ key: string; label: string } | null>(null);
  const pendingKeys = useRef(new Set<string>());
  const [paging, setPaging] = useState(false);
  const pagingRef = useRef(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selection, setSelection] = useState<{ key: string; value: ChangeSelection } | null>(null);
  const [commitSelection, setCommitSelection] = useState<{ key: string; sha: string } | null>(null);
  const [details, setDetails] = useState<GitCommitDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [commitPath, setCommitPath] = useState<string | null>(null);
  const [diff, setDiff] = useState<{ identity: string; data: WorkspaceGitDiff } | null>(null);
  const [diffError, setDiffError] = useState("");
  const status = snapshot?.key === key ? snapshot.data : null;
  const groups = useMemo(() => groupChanges(status?.repository.files ?? []), [status]);
  const chosenChange = selection?.key === key && groups[selection.value.group].some(file => file.repositoryRelativePath === selection.value.path)
    ? selection.value : null;
  const sha = commitSelection?.key === key ? commitSelection.sha : null;
  const selectedDetails = details?.commit.sha === sha ? details : null;
  const draft = drafts[key] ?? "";
  const busy = externallyBusy || pendingKeys.current.has(key);
  const refresh = () => { setError(null); setRevision(value => value + 1); };

  useEffect(() => {
    const request = ++epoch.current;
    pagingRef.current = false; setPaging(false);
    if (!active || !target) { setLoading(false); setHistoryLoading(false); return; }
    setLoading(true); setHistoryLoading(true); setHistoryError("");
    const current = () => epoch.current === request && identity.current === key;
    void api.status(target).then(data => {
      if (current()) setSnapshot({ key, data });
    }, reason => { if (current()) { setSnapshot(null); setError({ key, message: gitError(reason) }); } })
      .finally(() => { if (current()) setLoading(false); });
    void api.history(target).then(page => {
      if (!current()) return;
      const graph = appendGraph(page.commits);
      setHistory({ key, commits: page.commits, rows: graph.rows, graph: graph.state, cursor: page.cursor });
    }, reason => { if (current()) { setHistory(emptyHistory(key)); setHistoryError(message(reason)); } })
      .finally(() => { if (current()) setHistoryLoading(false); });
    return () => { ++epoch.current; };
  }, [key, active, revision, target?.branch, input.activityVersion, api]);

  useEffect(() => {
    if (!active) return;
    const focus = () => { if (document.visibilityState !== "hidden" && !pendingKeys.current.has(identity.current)) refresh(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => { window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [active]);

  async function loadMore() {
    if (!target || historyLoading || !history.cursor || history.key !== key || pagingRef.current) return;
    const request = epoch.current; pagingRef.current = true; setPaging(true);
    try {
      const page = await api.history(target, history.cursor);
      if (request !== epoch.current || identity.current !== key) return;
      const graph = appendGraph(page.commits, history.graph);
      setHistory({ key, commits: [...history.commits, ...page.commits], rows: [...history.rows, ...graph.rows], graph: graph.state, cursor: page.cursor });
      setHistoryError("");
    } catch (reason) { if (request === epoch.current) setHistoryError(message(reason)); }
    finally { if (request === epoch.current) { pagingRef.current = false; setPaging(false); } }
  }

  useEffect(() => {
    let cancelled = false;
    setDetails(null); setCommitPath(null); setDetailsError("");
    if (!active || !target || !sha || tab !== "history") { setDetailsLoading(false); return; }
    setDetailsLoading(true);
    void api.commit(target, sha).then(result => {
      if (cancelled) return;
      setDetails(result); setCommitPath(result.files[0]?.path ?? null);
    }, reason => { if (!cancelled) setDetailsError(message(reason)); })
      .finally(() => { if (!cancelled) setDetailsLoading(false); });
    return () => { cancelled = true; };
  }, [key, sha, active, tab, revision, api]);

  const diffIdentity = JSON.stringify([key, tab, tab === "changes" ? chosenChange : [sha, commitPath], revision, input.activityVersion, target?.branch]);
  useEffect(() => {
    let cancelled = false;
    setDiffError("");
    if (!active || !target) return;
    const change = chosenChange;
    const promise = tab === "changes" && change
      ? api.workingDiff(target, change.path).then(result => ({ ...result,
        sections: result.sections.filter(section => change.group === "conflicts" || section.kind === change.group) }))
      : tab === "history" && sha && commitPath ? api.commitDiff(target, sha, commitPath) : null;
    if (promise) void promise.then(data => { if (!cancelled) setDiff({ identity: diffIdentity, data }); }, reason => {
      if (!cancelled) setDiffError(message(reason));
    });
    return () => { cancelled = true; };
  }, [diffIdentity, active, api]);

  async function mutate(label: string, action: () => Promise<string | void>) {
    if (!target || !workspace || busy || pendingKeys.current.has(key)) return;
    pendingKeys.current.add(key); setPending({ key, label }); setError(null); setFeedback(null);
    try {
      const result = await action();
      if (identity.current === key) setFeedback({ key, message: result || label });
    } catch (reason) {
      if (identity.current === key) setError({ key, message: gitError(reason) });
    } finally {
      try { await input.services.refresh(workspace, target); }
      catch (reason) { if (identity.current === key) setError({ key, message: `Refresh failed: ${message(reason)}` }); }
      pendingKeys.current.delete(key);
      setPending(value => value?.key === key ? null : value);
      if (identity.current === key) setRevision(value => value + 1);
    }
  }

  async function commit(kind: GitOperationKind) {
    if (!target || !workspace || (kind !== "push" && (!draft.trim() || !groups.staged.length || groups.conflicts.length))) return;
    await mutate(kind === "push" ? "Pushing…" : "Committing…", async () => {
      const result = await input.services.execute(gitOperationRequest(workspace, target, kind, draft.trim()));
      if (result.commitCompleted) setDrafts(values => values[key] === draft ? { ...values, [key]: "" } : values);
      if (!result.ok) throw new Error(result.error || "Git operation failed. Review the repository and try again.");
      return kind === "commit" ? "Staged changes committed." : kind === "push" ? "Branch pushed." : "Committed and pushed.";
    });
  }

  async function generate() {
    if (!target || !groups.staged.length) return;
    await mutate("Generating message…", async () => {
      const root = target.kind === "kanban-card" ? target.worktreePath : target.repositoryPath;
      const generated = await input.services.generate({
        workspacePath: target.kind === "kanban-card" ? root : target.workspacePath,
        repositoryPath: root, accountId: input.accountId, model: input.model,
        includeUnstaged: false, intentContext: null, files: groups.staged,
        changeKey: JSON.stringify(groups.staged),
      });
      setDrafts(values => ({ ...values, [key]: generated }));
      return "Commit message generated from staged changes.";
    });
  }

  return {
    key, tab, setTab, status, groups, loading, busy, pendingLabel: pending?.key === key ? pending.label : "",
    error: error?.key === key ? error.message : "", feedback: feedback?.key === key ? feedback.message : "",
    draft, setDraft: (value: string) => setDrafts(values => ({ ...values, [key]: value })),
    chosenChange, selectChange: (value: ChangeSelection) => setSelection({ key, value }),
    history: history.key === key ? history : emptyHistory(key), historyError, historyLoading, paging, loadMore,
    sha, selectCommit: (value: string) => setCommitSelection({ key, sha: value }),
    details: selectedDetails, detailsLoading, detailsError, commitPath, setCommitPath,
    diff: diff?.identity === diffIdentity ? diff.data : null, diffError,
    refresh, commit, generate,
    stage: (paths: string[] | null, stage: boolean) => target && mutate(stage ? "Files staged." : "Files unstaged.", () => api.stage(target, paths, stage)),
    synchronize: (action: "fetch" | "pull") => target && mutate(action === "fetch" ? "Fetching…" : "Pulling…", () => api.remote(target, action)),
  };
}
