import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertCircle,
  Check,
  ChevronRight,
  FileText,
  GitBranch,
  GitPullRequest,
  Info,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DiffPreview } from "../../../components/DiffPreview";
import type { ResolvedTheme } from "../../../shared/types";
import type { WorkspaceGitDiff } from "../../workspaces/types";
import {
  readKanbanGitFileDiff,
  type KanbanGitBinding,
  type KanbanLocalReview,
} from "../api";
import { extractUnifiedDiffFilePatches } from "../unifiedDiff";

type Props = {
  review: KanbanLocalReview | null;
  bindings: KanbanGitBinding[];
  resolvedTheme: ResolvedTheme;
  loading: boolean;
  busy: boolean;
  error: string | null;
  githubConnected: boolean;
  onRetry: () => void;
  onApprove: () => void;
  onCompleteNoChanges: () => void;
  onRequestChanges: () => void;
  onPublishGithub: () => void;
  onClose: () => void;
};

function fileName(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function KanbanLocalReviewDrawer({
  review,
  bindings,
  resolvedTheme,
  loading,
  busy,
  error,
  githubConnected,
  onRetry,
  onApprove,
  onCompleteNoChanges,
  onRequestChanges,
  onPublishGithub,
  onClose,
}: Props) {
  const [repositoryIndex, setRepositoryIndex] = useState(0);
  const [fileIndex, setFileIndex] = useState(0);
  const [fileDiff, setFileDiff] = useState<WorkspaceGitDiff | null>(null);
  const [fileDiffLoading, setFileDiffLoading] = useState(false);
  const [fileDiffError, setFileDiffError] = useState<string | null>(null);
  const fileDiffRequest = useRef(0);
  const fileScrollRef = useRef<HTMLDivElement>(null);
  const repositories = review?.repositories ?? [];
  const nothingToMerge =
    repositories.length > 0 &&
    repositories.every(
      (item) => item.isEmpty || item.status === "nothing_to_merge",
    );
  const repository = repositories[Math.min(repositoryIndex, repositories.length - 1)] ?? null;
  const binding = repository
    ? bindings.find(
        (item) => item.sourceRepositoryPath === repository.sourceRepositoryPath,
      ) ?? null
    : null;
  const patches = useMemo(
    () => (repository ? extractUnifiedDiffFilePatches(repository.diff) : []),
    [repository],
  );
  const fileRows = useMemo(
    () =>
      repository?.files.length
        ? repository.files
        : patches.map((patch) => patch.newPath ?? patch.oldPath ?? "Changed file"),
    [patches, repository],
  );
  const selectedFile = fileRows[Math.min(fileIndex, fileRows.length - 1)] ?? null;
  const fileVirtualizer = useVirtualizer({
    count: fileRows.length,
    getScrollElement: () => fileScrollRef.current,
    estimateSize: () => 30,
    overscan: 8,
  });
  const measuredFileRows = fileVirtualizer.getVirtualItems();
  const visibleFileRows =
    measuredFileRows.length > 0
      ? measuredFileRows
      : fileRows.slice(0, 40).map((_, index) => ({
          index,
          key: fileRows[index],
          size: 30,
          start: index * 30,
        }));
  const fileListHeight = Math.max(
    fileVirtualizer.getTotalSize(),
    visibleFileRows.length * 30,
  );
  const binaryDiff = fileDiff?.sections.some((section) => section.isBinary) ?? false;
  const renderableSections = fileDiff?.sections.filter((section) => !section.isBinary) ?? [];
  const emptyDiff =
    Boolean(fileDiff) &&
    !binaryDiff &&
    renderableSections.every(
      (section) => section.baseContent === section.headContent && !section.content.trim(),
    );

  useEffect(() => {
    setRepositoryIndex(0);
    setFileIndex(0);
  }, [review?.cardId]);

  useEffect(() => {
    setFileIndex(0);
  }, [repositoryIndex]);

  useEffect(() => {
    const request = ++fileDiffRequest.current;
    setFileDiff(null);
    setFileDiffError(null);
    if (!selectedFile || !binding) {
      setFileDiffLoading(false);
      if (selectedFile && !binding) {
        setFileDiffError("The card worktree is unavailable for this repository.");
      }
      return;
    }

    setFileDiffLoading(true);
    void readKanbanGitFileDiff(binding, selectedFile)
      .then((nextDiff) => {
        if (request !== fileDiffRequest.current) return;
        setFileDiff(nextDiff);
      })
      .catch((diffError: unknown) => {
        if (request !== fileDiffRequest.current) return;
        setFileDiffError(
          diffError instanceof Error ? diffError.message : String(diffError),
        );
      })
      .finally(() => {
        if (request === fileDiffRequest.current) setFileDiffLoading(false);
      });
  }, [binding, selectedFile]);

  return (
    <aside className="kanban-local-review-drawer" aria-label="Local card review">
      <header>
        <div>
          <span className="eyebrow">Local review</span>
          <h2>{review?.title ?? "Review changes"}</h2>
        </div>
        <button
          type="button"
          className="kanban-icon-button"
          aria-label="Close local review"
          title="Close"
          disabled={busy}
          onClick={onClose}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      {loading ? (
        <div className="kanban-local-review-state" role="status">
          <Loader2 className="spin" size={18} aria-hidden="true" />
          <span>Loading repository changes...</span>
        </div>
      ) : error ? (
        <div className="kanban-local-review-state error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{error}</span>
          <button
            type="button"
            className="kanban-icon-button"
            aria-label="Retry local review"
            title="Retry"
            onClick={onRetry}
          >
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        </div>
      ) : review ? (
        <>
          <details className="kanban-local-review-context">
            <summary>
              <Info size={15} aria-hidden="true" />
              <span>Review context</span>
              <ChevronRight size={15} aria-hidden="true" />
            </summary>
            <div>
              <h3>Objective</h3>
              <p>{review.objective}</p>
              {review.summary ? (
                <>
                  <h3>Agent summary</h3>
                  <p>{review.summary}</p>
                </>
              ) : null}
            </div>
          </details>

          {repositories.length > 1 ? (
            <div className="kanban-local-review-repositories" role="tablist" aria-label="Repositories">
              {repositories.map((item, index) => (
                <button
                  key={item.sourceRepositoryPath}
                  type="button"
                  role="tab"
                  aria-selected={index === repositoryIndex}
                  onClick={() => setRepositoryIndex(index)}
                >
                  <GitBranch size={14} aria-hidden="true" />
                  <span>{item.relativePath === "." ? "Workspace repository" : item.relativePath}</span>
                  <small>+{item.additions} -{item.deletions}</small>
                </button>
              ))}
            </div>
          ) : null}

          {repository ? (
            <section className="kanban-local-review-repository">
              <div className="kanban-local-review-branch">
                {repositories.length === 1 ? (
                  <span className="kanban-local-review-repository-name">
                    <GitBranch size={14} aria-hidden="true" />
                    {repository.relativePath === "." ? "Workspace repository" : repository.relativePath}
                  </span>
                ) : null}
                <span>{repository.cardBranch}</span>
                <span aria-hidden="true">→</span>
                <span>{repository.baseBranch}</span>
                <strong data-status={repository.status}>{repository.status.replace(/_/g, " ")}</strong>
              </div>
              {repository.error ? (
                <p className="kanban-local-review-repository-error" role="alert">
                  {repository.error}
                </p>
              ) : null}
              {repository.isEmpty && repository.status !== "merged" ? (
                <div className="kanban-local-review-empty">No changed files were found.</div>
              ) : (
                <div className="kanban-local-review-diff-layout">
                  <div ref={fileScrollRef} className="kanban-local-review-files" aria-label="Changed files">
                    <div style={{ height: fileListHeight, position: "relative" }}>
                      {visibleFileRows.map((item) => {
                        const path = fileRows[item.index];
                        return (
                          <button
                            key={path}
                            type="button"
                            className={item.index === fileIndex ? "selected" : undefined}
                            aria-pressed={item.index === fileIndex}
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              height: item.size,
                              transform: `translateY(${item.start}px)`,
                            }}
                            onClick={() => setFileIndex(item.index)}
                          >
                            <span className="workspace-tree-chevron-placeholder" aria-hidden="true" />
                            <FileText size={14} aria-hidden="true" />
                            <span className="kanban-local-review-file-copy" title={path}>
                              <span>{fileName(path)}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="kanban-local-review-diff">
                    {fileDiffLoading ? (
                      <div className="file-preview-state" role="status">
                        <Loader2 className="file-preview-spinner" size={16} aria-hidden="true" />
                        <span>Loading diff</span>
                      </div>
                    ) : fileDiffError ? (
                      <div className="file-preview-state error" role="alert">
                        <AlertCircle size={16} aria-hidden="true" />
                        <span>{fileDiffError}</span>
                      </div>
                    ) : binaryDiff ? (
                      <div className="file-preview-state">
                        <FileText size={16} aria-hidden="true" />
                        <span>Binary diff is not available.</span>
                      </div>
                    ) : emptyDiff ? (
                      <div className="file-preview-state">
                        <FileText size={16} aria-hidden="true" />
                        <span>No diff available for this file.</span>
                      </div>
                    ) : fileDiff && renderableSections.length > 0 ? (
                      <DiffPreview
                        path={fileDiff.relativePath}
                        sections={renderableSections}
                        resolvedTheme={resolvedTheme}
                        layout="inline"
                      />
                    ) : (
                      <div className="file-preview-state">
                        <FileText size={16} aria-hidden="true" />
                        <span>Select a file to inspect its diff.</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          ) : null}
        </>
      ) : null}

      <footer>
        <button
          type="button"
          className="kanban-icon-button"
          aria-label="Request changes"
          title="Request changes"
          disabled={busy || !review}
          onClick={onRequestChanges}
        >
          <RefreshCw size={16} aria-hidden="true" />
        </button>
        {githubConnected && review?.canPublishGithub ? (
          <button
            type="button"
            className="kanban-icon-button"
            aria-label="Publish on GitHub"
            title="Publish on GitHub"
            disabled={busy}
            onClick={onPublishGithub}
          >
            <GitPullRequest size={16} aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          className="kanban-icon-button primary"
          aria-label={nothingToMerge ? "Complete without changes" : "Approve and merge locally"}
          title={nothingToMerge ? "Complete without changes" : "Approve and merge locally"}
          disabled={busy || !review || repositories.length === 0}
          onClick={nothingToMerge ? onCompleteNoChanges : onApprove}
        >
          {busy ? (
            <Loader2 className="spin" size={16} aria-hidden="true" />
          ) : (
            <Check size={16} aria-hidden="true" />
          )}
        </button>
      </footer>
    </aside>
  );
}
