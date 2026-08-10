import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertCircle,
  Check,
  FileCode2,
  GitBranch,
  GitPullRequest,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KanbanLocalReview } from "../api";
import { extractUnifiedDiffFilePatches } from "../unifiedDiff";

type Props = {
  review: KanbanLocalReview | null;
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

export function KanbanLocalReviewDrawer({
  review,
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
  const fileScrollRef = useRef<HTMLDivElement>(null);
  const diffScrollRef = useRef<HTMLDivElement>(null);
  const repositories = review?.repositories ?? [];
  const nothingToMerge =
    repositories.length > 0 &&
    repositories.every(
      (item) => item.isEmpty || item.status === "nothing_to_merge",
    );
  const repository = repositories[Math.min(repositoryIndex, repositories.length - 1)] ?? null;
  const patches = useMemo(
    () => (repository ? extractUnifiedDiffFilePatches(repository.diff) : []),
    [repository],
  );
  const fileRows = repository?.files.length
    ? repository.files
    : patches.map((patch) => patch.newPath ?? patch.oldPath ?? "Changed file");
  const selectedFile = fileRows[Math.min(fileIndex, fileRows.length - 1)] ?? null;
  const selectedPatch = selectedFile
    ? patches.find(
        (patch) => patch.newPath === selectedFile || patch.oldPath === selectedFile,
      )?.content ?? ""
    : repository?.diff ?? "";
  const diffLines = useMemo(() => selectedPatch.split(/\r?\n/), [selectedPatch]);
  const fileVirtualizer = useVirtualizer({
    count: fileRows.length,
    getScrollElement: () => fileScrollRef.current,
    estimateSize: () => 34,
    overscan: 8,
  });
  const diffVirtualizer = useVirtualizer({
    count: diffLines.length,
    getScrollElement: () => diffScrollRef.current,
    estimateSize: () => 20,
    overscan: 30,
  });

  useEffect(() => {
    setRepositoryIndex(0);
    setFileIndex(0);
  }, [review?.cardId]);

  useEffect(() => {
    setFileIndex(0);
  }, [repositoryIndex]);

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
          <section className="kanban-local-review-copy">
            <h3>Objective</h3>
            <p>{review.objective}</p>
            {review.summary ? (
              <>
                <h3>Agent summary</h3>
                <p>{review.summary}</p>
              </>
            ) : null}
          </section>

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

          {repository ? (
            <section className="kanban-local-review-repository">
              <div className="kanban-local-review-branch">
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
                  <div ref={fileScrollRef} className="kanban-local-review-files">
                    <div style={{ height: fileVirtualizer.getTotalSize(), position: "relative" }}>
                      {fileVirtualizer.getVirtualItems().map((item) => (
                        <button
                          key={fileRows[item.index]}
                          type="button"
                          className={item.index === fileIndex ? "selected" : undefined}
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
                          <FileCode2 size={14} aria-hidden="true" />
                          <span title={fileRows[item.index]}>{fileRows[item.index]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div ref={diffScrollRef} className="kanban-local-review-diff" tabIndex={0}>
                    <div style={{ height: diffVirtualizer.getTotalSize(), position: "relative" }}>
                      {diffVirtualizer.getVirtualItems().map((item) => {
                        const line = diffLines[item.index] ?? "";
                        const tone = line.startsWith("+") && !line.startsWith("+++")
                          ? "addition"
                          : line.startsWith("-") && !line.startsWith("---")
                            ? "deletion"
                            : "context";
                        return (
                          <div
                            key={item.key}
                            className="kanban-local-review-diff-line"
                            data-tone={tone}
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              height: item.size,
                              transform: `translateY(${item.start}px)`,
                            }}
                          >
                            <span>{item.index + 1}</span>
                            <code>{line || " "}</code>
                          </div>
                        );
                      })}
                    </div>
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
