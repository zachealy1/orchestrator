import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSourceControl } from "./useSourceControl";
import { groupChanges, type ChatGitTarget } from "./types";
import type { SourceControlStatus, GitHistoryPage, GitHistoryCommit } from "./api";
import type { Workspace, WorkspaceGitFileStatus, WorkspaceGitDiff } from "../workspaces/types";

const workspace: Workspace = { id: 1, label: "App", path: "/repo", selected_git_repository_path: "/repo", default_account_id: null, created_at: "", last_opened_at: "" };
const target: ChatGitTarget = { kind: "workspace", workspaceId: 1, workspacePath: "/repo", repositoryPath: "/repo", repositoryLabel: "App", branch: "main" };
const file: WorkspaceGitFileStatus = { path: "/repo/file.ts", relativePath: "file.ts", repositoryRelativePath: "file.ts", repositoryPath: "/repo", oldRelativePath: null, indexStatus: "M", worktreeStatus: "M", statusKind: "modified", badge: "M" };
const status: SourceControlStatus = { repository: { repository: { rootPath: "/repo", relativePath: ".", label: "App" }, workspacePath: "/repo", gitRoot: "/repo", currentBranch: "main", aheadCount: 0, additions: 1, deletions: 1, files: [file], canPush: true, hasOrigin: true, hasUpstream: true }, remotes: ["origin"], upstream: "origin/main" };
const diff: WorkspaceGitDiff = { path: file.path, relativePath: "file.ts", sections: ["staged", "unstaged"].map(kind => ({kind: kind as "staged" | "unstaged", title: kind, baseLabel: "base", headLabel: "head", baseContent: "old", headContent: "new", baseTruncated: false, headTruncated: false, content: "", isBinary: false})) };
function setup() {
  return { active: true, target: target as ChatGitTarget | null, workspace, externallyBusy: false, accountId: 7, model: "model",
    services: { execute: vi.fn(async () => ({ ok: true, commitCompleted: true })), generate: vi.fn(async () => "Generated staged message"), refresh: vi.fn(async () => {}) },
    api: { status: vi.fn(async () => status), history: vi.fn(async (): Promise<GitHistoryPage> => ({ commits: [], cursor: null })), stage: vi.fn(async () => {}), remote: vi.fn(async () => "Fetched"), commit: vi.fn(), commitDiff: vi.fn(), workingDiff: vi.fn(async () => diff) },
  };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

describe("source control controller", () => {
  it("separates partial staging and never offers automatic conflict staging", () => {
    const groups = groupChanges([file, { ...file, repositoryRelativePath: "new", statusKind: "untracked", indexStatus: "?", worktreeStatus: "?" }, { ...file, statusKind: "conflicted" }]);
    expect(groups.staged).toEqual([file]); expect(groups.unstaged).toEqual([file]);
    expect(groups.untracked).toHaveLength(1); expect(groups.conflicts).toHaveLength(1);
  });
  it("uses staged-only commits, preserves drafts across navigation and target changes, and refreshes after mutations", async () => {
    const props = setup(); const { result, rerender } = renderHook(p => useSourceControl(p), { initialProps: props });
    await waitFor(() => expect(result.current.status).not.toBeNull());
    act(() => result.current.setDraft("First repo message"));
    rerender({ ...props, active: false }); expect(result.current.draft).toBe("First repo message");
    const other = { ...target, repositoryPath: "/repo/nested" };
    rerender({ ...props, target: other }); act(() => result.current.setDraft("Nested message"));
    rerender(props); expect(result.current.draft).toBe("First repo message");
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.commit("commit"); });
    expect(props.services.execute).toHaveBeenCalledWith(expect.objectContaining({ includeUnstaged: false, repositoryPath: "/repo", commitMessage: "First repo message" }));
    expect(result.current.draft).toBe(""); expect(props.services.refresh).toHaveBeenCalledWith(workspace, target);
    rerender({ ...props, target: other }); expect(result.current.draft).toBe("Nested message");
  });
  it("rejects stale status and diffs after repository changes", async () => {
    const props = setup(); const delayed = deferred<SourceControlStatus>(); props.api.status.mockImplementationOnce(() => delayed.promise);
    const { result, rerender } = renderHook(p => useSourceControl(p), { initialProps: props });
    const other = { ...target, repositoryPath: "/repo/other" };
    const otherStatus = { ...status, upstream: "other/main" };
    props.api.status.mockResolvedValue(otherStatus); rerender({ ...props, target: other });
    await waitFor(() => expect(result.current.status).toBe(otherStatus));
    await act(async () => { delayed.resolve(status); await delayed.promise; });
    expect(result.current.status).toBe(otherStatus);
    const delayedDiff = deferred<WorkspaceGitDiff>(); props.api.workingDiff.mockImplementationOnce(() => delayedDiff.promise);
    act(() => result.current.selectChange({ group: "staged", path: "file.ts" }));
    rerender(props);
    await act(async () => { delayedDiff.resolve(diff); await delayedDiff.promise; });
    expect(result.current.diff).toBeNull();
  });
  it("shows the selected staged or unstaged comparison and stages only the requested file", async () => {
    const props = setup(); const { result } = renderHook(() => useSourceControl(props));
    await waitFor(() => expect(result.current.status).not.toBeNull());
    act(() => result.current.selectChange({ group: "staged", path: "file.ts" }));
    await waitFor(() => expect(result.current.diff?.sections.map(section => section.kind)).toEqual(["staged"]));
    act(() => result.current.selectChange({ group: "unstaged", path: "file.ts" }));
    await waitFor(() => expect(result.current.diff?.sections.map(section => section.kind)).toEqual(["unstaged"]));
    await act(async () => { await result.current.stage(["file.ts"], true); });
    expect(props.api.stage).toHaveBeenCalledWith(target, ["file.ts"], true);
  });
  it("retains graph lanes across pages and ignores a page arriving after changing repositories", async () => {
    const props = setup();
    const commit = (sha: string, parents: string[]): GitHistoryCommit => ({ sha, parents, subject: sha, author: "Author", date: "2026-09-22", refs: [], isShallowBoundary: false });
    const cursor = { repositoryPath: "/repo", tips: ["merge"], refs: [], offset: 100 };
    props.api.history.mockResolvedValueOnce({ commits: [commit("merge", ["left", "right"])], cursor });
    const { result, rerender } = renderHook(p => useSourceControl(p), { initialProps: props });
    await waitFor(() => expect(result.current.historyLoading).toBe(false));
    const firstRow = result.current.history.rows[0];
    props.api.history.mockResolvedValueOnce({ commits: [commit("left", ["base"])], cursor: { ...cursor, offset: 200 } });
    await act(async () => { await result.current.loadMore(); });
    expect(props.api.history).toHaveBeenLastCalledWith(target, cursor);
    expect(result.current.history.rows[0]).toBe(firstRow);
    expect(result.current.history.rows[1].edges).toContainEqual({ from: 1, to: 1, color: 1, start: "top", end: "bottom" });
    const delayed = deferred<GitHistoryPage>(); props.api.history.mockImplementationOnce(() => delayed.promise);
    let pending!: Promise<void>;
    act(() => { pending = result.current.loadMore(); });
    props.api.history.mockResolvedValueOnce({ commits: [commit("other", [])], cursor: null });
    rerender({ ...props, target: { ...target, repositoryPath: "/repo/other" } });
    await waitFor(() => expect(result.current.history.commits[0]?.sha).toBe("other"));
    await act(async () => { delayed.resolve({ commits: [commit("right", ["base"])], cursor: null }); await pending; });
    expect(result.current.history.commits.map(item => item.sha)).toEqual(["other"]);
    expect(result.current.paging).toBe(false);
  });
  it("preserves a failed commit draft, reports authentication errors, and blocks duplicate mutations", async () => {
    const props = setup(); props.services.execute.mockResolvedValue({ ok: false, commitCompleted: false });
    const { result } = renderHook(() => useSourceControl(props)); await waitFor(() => expect(result.current.status).not.toBeNull());
    act(() => result.current.setDraft("Keep on failure")); await act(async () => { await result.current.commit("commit"); });
    expect(result.current.draft).toBe("Keep on failure"); expect(result.current.error).toContain("failed");
    const pending = deferred<string>(); props.api.remote.mockImplementationOnce(() => pending.promise);
    let action: Promise<void> | null = null;
    act(() => { action = result.current.synchronize("fetch"); });
    await act(async () => { await result.current.synchronize("pull"); }); expect(props.api.remote).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve("Fetched"); await action; });
    props.api.remote.mockRejectedValueOnce(new Error("Permission denied (publickey)"));
    await act(async () => { await result.current.synchronize("pull"); }); expect(result.current.error).toContain("Update your Git credentials");
  });
  it("clears the draft when commit succeeds but push fails and generates from staged changes only", async () => {
    const props = setup(); props.services.execute.mockResolvedValue({ ok: false, commitCompleted: true });
    const { result } = renderHook(() => useSourceControl(props)); await waitFor(() => expect(result.current.status).not.toBeNull());
    await act(async () => { await result.current.generate(); });
    expect(props.services.generate).toHaveBeenCalledWith(expect.objectContaining({ includeUnstaged: false, files: [file] }));
    expect(result.current.draft).toBe("Generated staged message");
    await act(async () => { await result.current.commit("commit-and-push"); }); expect(result.current.draft).toBe("");
  });
});
