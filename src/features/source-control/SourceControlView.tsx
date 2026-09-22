import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Check, ChevronRight, GitBranch, GitCommitHorizontal, GitPullRequestArrow, History, Layers2, Minus, Plus, RefreshCw, Sparkles } from "lucide-react";
import { DiffPreview } from "../../components/DiffPreview";
import { BranchSelect } from "../workspaces/BranchSelect";
import type { Workspace, WorkspaceGitRepositoryStatus } from "../workspaces/types";
import type { ResolvedTheme } from "../../shared/types";
import { useSourceControl, type SourceControlServices } from "./useSourceControl";
import { HistoryGraph } from "./HistoryGraph";
import type { ChangeGroup, ChatGitTarget } from "./types";

export type SourceControlViewProps = {
  active: boolean; workspaces: Workspace[]; workspace: Workspace | null;
  target: ChatGitTarget | null; targetError: string | null; targetLoading: boolean;
  unresolvedTargetPath: string | null; onRetryTarget: () => void;
  repositories: WorkspaceGitRepositoryStatus[]; branches: string[];
  canManageBranches: boolean; busy: boolean; resolvedTheme: ResolvedTheme;
  accountId: number | null; model: string | null; services: SourceControlServices;
  activityVersion?: string;
  onWorkspace: (id: number) => void; onRepository: (path: string) => void;
  onBranch: (branch: string) => Promise<void>; onCreateBranch: () => void;
};
const GROUPS: { id: ChangeGroup; label: string }[] = [
  { id: "conflicts", label: "Conflicts" }, { id: "staged", label: "Staged" },
  { id: "unstaged", label: "Unstaged" }, { id: "untracked", label: "Untracked" },
];

export function SourceControlView(props: SourceControlViewProps) {
  const { active, workspace, target } = props;
  const sc = useSourceControl({ active, workspace, target, externallyBusy: props.busy,
    accountId: props.accountId, model: props.model, services: props.services, activityVersion: props.activityVersion });
  const [layout, setLayout] = useState<"inline" | "side-by-side">("side-by-side");
  const selectedPath = sc.tab === "changes" ? sc.chosenChange?.path : sc.commitPath;
  const branch = sc.status ? sc.status.repository.currentBranch : target?.branch;
  const unavailable = sc.busy || sc.loading || !sc.status || !target;
  const hasStaged = sc.groups.staged.length > 0;
  const canCommit = !unavailable && hasStaged && !sc.groups.conflicts.length && Boolean(sc.draft.trim());
  const targetPath = (target?.kind === "kanban-card" ? target.worktreePath : target?.repositoryPath) ?? props.unresolvedTargetPath;
  const error = props.targetError || sc.error;
  const refresh = () => {
    if (!target || props.targetError) props.onRetryTarget();
    sc.refresh();
  };
  if (!active) return null;

  const diff = <div className="sc-diff-panel">
    <div className="sc-diff-heading">
      <span title={selectedPath || ""}>{selectedPath || "File comparison"}</span>
      <div className="sc-layout-picker" aria-label="Diff layout">
        <button type="button" aria-pressed={layout === "inline"} onClick={() => setLayout("inline")}>Inline</button>
        <button type="button" aria-pressed={layout === "side-by-side"} onClick={() => setLayout("side-by-side")}>Side by side</button>
      </div>
    </div>
    {sc.diffError ? <div className="sc-empty sc-error" role="alert">{sc.diffError}<button onClick={sc.refresh}>Retry</button></div>
      : !selectedPath ? <div className="sc-empty"><GitCommitHorizontal size={30} strokeWidth={1.2} /><p>Select a file to inspect its changes</p></div>
      : !sc.diff ? <div className="sc-empty" role="status">Loading comparison…</div>
      : sc.diff.sections.length ? <DiffPreview path={sc.diff.path} sections={sc.diff.sections} resolvedTheme={props.resolvedTheme} layout={layout} />
      : <div className="sc-empty">No text comparison is available for this file.</div>}
  </div>;

  return <section className="source-control-view" hidden={!active} aria-label="Source control" data-tauri-drag-region="false">
    <header className="sc-header">
      <div className="sc-heading"><GitBranch size={21} /><h1>Source control</h1></div>
      <div className="sc-selectors">
        <select aria-label="Git workspace" value={workspace?.id ?? ""} onChange={event => props.onWorkspace(Number(event.target.value))}>
          {!workspace && <option value="">Select workspace</option>}
          {props.workspaces.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        {props.repositories.length > 1 && <><ChevronRight size={13} /><select aria-label="Git repository" value={target?.repositoryPath ?? ""}
          onChange={event => props.onRepository(event.target.value)}>
          {!target && <option value="">Select repository</option>}
          {props.repositories.map(item => <option key={item.repository.rootPath} value={item.repository.rootPath}>{item.repository.label}</option>)}
        </select></>}
      </div>
      <div className="sc-sync-actions">
        <button type="button" onClick={() => void sc.synchronize("fetch")} disabled={unavailable || !sc.status?.remotes.length}><ArrowDownToLine size={14} />Fetch</button>
        <button type="button" onClick={() => void sc.synchronize("pull")} disabled={unavailable || !sc.status?.upstream}
          title={sc.status?.upstream ? `Fast-forward only from ${sc.status.upstream}` : "Set an upstream branch before pulling"}><GitPullRequestArrow size={14} />Pull</button>
        <button type="button" aria-label="Refresh source control" data-tooltip="Refresh source control" onClick={refresh} disabled={sc.busy || props.targetLoading}><RefreshCw size={14} /></button>
      </div>
    </header>
    <div className="sc-target">
      {!props.canManageBranches || target?.kind !== "workspace" ? <GitBranch size={14} /> : null}
      {props.canManageBranches && target?.kind === "workspace" ? <BranchSelect
        ariaLabel="Current Git branch" branch={branch ?? null} branches={[...new Set([...(branch ? [branch] : []), ...props.branches])]}
        disabled={unavailable} onChange={value => { void props.onBranch(value).then(sc.refresh); }} onCreateBranch={props.onCreateBranch}
      /> : <strong>{branch || "Detached HEAD / unborn branch"}</strong>}
      {target?.kind === "kanban-card" && <span className="sc-worktree-tag">Card worktree · branch locked</span>}
      <code title={targetPath ?? undefined}>{targetPath || (props.targetLoading ? "Resolving repository…" : "No repository selected")}</code>
    </div>
    <div className="sc-tab-bar" role="tablist" aria-label="Source control views" onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const tab = event.key === "Home" ? "changes" : event.key === "End" ? "history" : sc.tab === "changes" ? "history" : "changes";
      sc.setTab(tab); event.currentTarget.querySelector<HTMLButtonElement>(`#sc-${tab}-tab`)?.focus();
    }}>
      <button type="button" role="tab" id="sc-changes-tab" tabIndex={sc.tab === "changes" ? 0 : -1} aria-controls="sc-changes" aria-selected={sc.tab === "changes"} onClick={() => sc.setTab("changes")}><Layers2 size={15} />Changes{sc.status && <span>{sc.status.repository.files.length}</span>}</button>
      <button type="button" role="tab" id="sc-history-tab" tabIndex={sc.tab === "history" ? 0 : -1} aria-controls="sc-history" aria-selected={sc.tab === "history"} onClick={() => sc.setTab("history")}><History size={15} />History</button>
      {sc.pendingLabel ? <span role="status">{sc.pendingLabel}</span> : sc.feedback ? <span role="status">{sc.feedback}</span> : null}
    </div>
    {error && <div className="sc-notice sc-error" role="alert">{error}<button onClick={refresh} disabled={sc.busy || props.targetLoading}>Retry</button></div>}
    {!target ? <div className="sc-empty"><GitBranch size={32} strokeWidth={1.2} /><p>{props.targetLoading ? "Resolving the selected repository or worktree…" : workspace ? "Choose a Git repository in this workspace." : "Select a workspace to get started."}</p></div>
      : sc.tab === "changes" ? <div className="sc-changes" id="sc-changes" role="tabpanel" aria-labelledby="sc-changes-tab">
        <aside className="sc-file-panel" aria-label="Changed files and commit actions">
          <div className="sc-commit-composer">
            <label htmlFor="sc-commit-message">Commit message</label>
            <textarea id="sc-commit-message" placeholder="Describe your staged changes…" value={sc.draft}
              disabled={sc.busy} onChange={event => sc.setDraft(event.target.value)} rows={3} />
            <div className="sc-commit-options"><small>Commits staged changes only</small>
              <button type="button" disabled={unavailable || !hasStaged || Boolean(sc.groups.conflicts.length)} onClick={() => void sc.generate()} aria-label="Generate commit message" data-tooltip="Generate message from staged changes"><Sparkles size={14} /></button></div>
            <div className="sc-commit-actions"><button type="button" className="sc-primary" disabled={!canCommit} onClick={() => void sc.commit("commit")}><Check size={14} />Commit</button>
              <button type="button" disabled={!canCommit || !sc.status?.repository.currentBranch || !(sc.status.repository.hasUpstream || sc.status.repository.hasOrigin)} onClick={() => void sc.commit("commit-and-push")}>Commit and Push</button></div>
            <button type="button" className="sc-push" disabled={unavailable || !sc.status?.repository.canPush} onClick={() => void sc.commit("push")}><ArrowUpFromLine size={14} />Push{sc.status?.repository.aheadCount ? ` · ${sc.status.repository.aheadCount} ahead` : ""}</button>
          </div>
          <div className="sc-files-toolbar"><span>{sc.status?.repository.files.length ?? 0} changed files</span>
            <button type="button" disabled={unavailable || ![...sc.groups.unstaged, ...sc.groups.untracked].length} onClick={() => void sc.stage(null, true)} title="Stage all permitted files">Stage All</button>
            <button type="button" disabled={unavailable || !hasStaged} onClick={() => void sc.stage(null, false)}>Unstage All</button>
          </div>
          <div className="sc-file-groups">
            {sc.loading && !sc.status ? <p className="sc-muted" role="status">Loading changes…</p> : null}
            {GROUPS.map(group => sc.groups[group.id].length ? <section key={group.id} aria-label={`${group.label} files`}>
              <h2>{group.label}<span>{sc.groups[group.id].length}</span></h2>
              {group.id === "conflicts" && <p className="sc-conflict-help">Resolve conflicts in your editor before staging.</p>}
              {sc.groups[group.id].map(file => <div className="sc-file-row" key={file.repositoryRelativePath}>
                <button type="button" className="sc-file-select" aria-pressed={sc.chosenChange?.group === group.id && sc.chosenChange.path === file.repositoryRelativePath}
                  onClick={() => sc.selectChange({ group: group.id, path: file.repositoryRelativePath })} title={file.oldRelativePath ? `${file.oldRelativePath} → ${file.repositoryRelativePath}` : file.repositoryRelativePath}>
                  <span className={`sc-file-badge sc-status-${file.statusKind}`}>{file.badge}</span><span>{file.repositoryRelativePath}</span>
                </button>
                {group.id !== "conflicts" && <button type="button" className="sc-file-action" aria-label={`${group.id === "staged" ? "Unstage" : "Stage"} ${file.repositoryRelativePath}`}
                  data-tooltip={group.id === "staged" ? "Unstage file" : "Stage file"} disabled={unavailable}
                  onClick={() => void sc.stage([file.repositoryRelativePath], group.id !== "staged")}>{group.id === "staged" ? <Minus size={14} /> : <Plus size={14} />}</button>}
              </div>)}
            </section> : null)}
            {sc.status && !sc.status.repository.files.length && <div className="sc-clean"><Check size={22} /><p>Working tree is clean</p></div>}
          </div>
        </aside>{diff}
      </div> : <div className="sc-history" id="sc-history" role="tabpanel" aria-labelledby="sc-history-tab">
        {sc.historyError ? <div className="sc-notice sc-error" role="alert">{sc.historyError}<button onClick={() => sc.history.commits.length ? void sc.loadMore() : sc.refresh()}>Retry history</button></div> : null}
        {sc.history.commits.length ? <HistoryGraph commits={sc.history.commits} rows={sc.history.rows} selected={sc.sha} onSelect={sc.selectCommit}
          hasMore={Boolean(sc.history.cursor)} paging={sc.paging} onMore={() => void sc.loadMore()} />
          : <div className="sc-empty">{sc.historyLoading ? "Loading history…" : "No commits in this repository yet."}</div>}
        <div className="sc-commit-details">
          <aside className="sc-file-panel">
            {sc.detailsError ? <div className="sc-notice sc-error" role="alert">{sc.detailsError}<button onClick={sc.refresh}>Retry</button></div>
              : sc.details ? <>
                <div className="sc-commit-info"><strong>{sc.details.commit.subject}</strong><code>{sc.sha?.slice(0, 12)}</code><span>{sc.details.commit.author} · {new Date(sc.details.commit.date).toLocaleString()}</span>
                  <small>{sc.details.commit.isShallowBoundary ? "Shallow boundary · parent unavailable. Deepen the repository history to inspect this comparison." : sc.details.parent ? `Compared with first parent ${sc.details.parent.slice(0, 8)}` : "Root commit · compared with empty tree"}</small></div>
                <div className="sc-file-groups">{sc.details.files.map(file => <button type="button" key={file.path} className="sc-file-select" aria-pressed={sc.commitPath === file.path} title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path} onClick={() => sc.setCommitPath(file.path)}><span className="sc-file-badge">{file.status[0]}</span><span>{file.path}</span></button>)}
                  {!sc.details.files.length && <p className="sc-muted">No file changes in this workspace scope.</p>}</div>
              </> : <div className="sc-empty">{sc.detailsLoading ? "Loading commit…" : "Select a commit to inspect it"}</div>}
          </aside>{diff}
        </div>
      </div>}
  </section>;
}
