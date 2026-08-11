import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Columns2,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  GitPullRequest,
  List,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
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

function patchStats(content: string) {
  let additions = 0;
  let deletions = 0;

  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
    if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
  }

  return { additions, deletions };
}

type ReviewTreeNode =
  | {
      kind: "directory";
      name: string;
      path: string;
      children: ReviewTreeNode[];
    }
  | {
      kind: "file";
      name: string;
      path: string;
      fileIndex: number;
    };

type ReviewTreeRow = ReviewTreeNode & { depth: number };

function compareReviewTreeNodes(left: ReviewTreeNode, right: ReviewTreeNode) {
  if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
  return left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function buildReviewFileTree(paths: string[]): ReviewTreeNode[] {
  const root: Extract<ReviewTreeNode, { kind: "directory" }> = {
    kind: "directory",
    name: "",
    path: "",
    children: [],
  };

  paths.forEach((originalPath, fileIndex) => {
    const parts = originalPath.split("/").filter(Boolean);
    if (parts.length === 0) return;
    let parent = root;

    parts.slice(0, -1).forEach((part) => {
      const path = parent.path ? `${parent.path}/${part}` : part;
      let directory = parent.children.find(
        (node): node is Extract<ReviewTreeNode, { kind: "directory" }> =>
          node.kind === "directory" && node.path === path,
      );
      if (!directory) {
        directory = { kind: "directory", name: part, path, children: [] };
        parent.children.push(directory);
      }
      parent = directory;
    });

    parent.children.push({
      kind: "file",
      name: parts[parts.length - 1],
      path: originalPath,
      fileIndex,
    });
  });

  const sortTree = (nodes: ReviewTreeNode[]) => {
    nodes.sort(compareReviewTreeNodes);
    nodes.forEach((node) => {
      if (node.kind === "directory") sortTree(node.children);
    });
  };
  sortTree(root.children);
  return root.children;
}

export function flattenReviewFileTree(
  nodes: ReviewTreeNode[],
  expandedPaths: ReadonlySet<string>,
  depth = 0,
): ReviewTreeRow[] {
  return nodes.flatMap((node) => {
    const row = { ...node, depth } as ReviewTreeRow;
    if (node.kind !== "directory" || !expandedPaths.has(node.path)) {
      return [row];
    }
    return [
      row,
      ...flattenReviewFileTree(node.children, expandedPaths, depth + 1),
    ];
  });
}

function reviewDirectoryPaths(nodes: ReviewTreeNode[]): string[] {
  return nodes.flatMap((node) =>
    node.kind === "directory"
      ? [node.path, ...reviewDirectoryPaths(node.children)]
      : [],
  );
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
  const [filesCollapsed, setFilesCollapsed] = useState(false);
  const [repositoryExpanded, setRepositoryExpanded] = useState(true);
  const [expandedDirectoryPaths, setExpandedDirectoryPaths] = useState<
    Set<string>
  >(new Set());
  const [diffLayout, setDiffLayout] = useState<"inline" | "side-by-side">(
    "inline",
  );
  const fileDiffRequest = useRef(0);
  const fileScrollRef = useRef<HTMLDivElement>(null);
  const repositories = review?.repositories ?? [];
  const nothingToMerge =
    repositories.length > 0 &&
    repositories.every(
      (item) => item.isEmpty || item.status === "nothing_to_merge",
    );
  const repository =
    repositories[Math.min(repositoryIndex, repositories.length - 1)] ?? null;
  const binding = repository
    ? (bindings.find(
        (item) => item.sourceRepositoryPath === repository.sourceRepositoryPath,
      ) ?? null)
    : null;
  const patches = useMemo(
    () => (repository ? extractUnifiedDiffFilePatches(repository.diff) : []),
    [repository],
  );
  const fileRows = useMemo(
    () =>
      repository?.files.length
        ? repository.files
        : patches.map(
            (patch) => patch.newPath ?? patch.oldPath ?? "Changed file",
          ),
    [patches, repository],
  );
  const selectedFile =
    fileRows[Math.min(fileIndex, fileRows.length - 1)] ?? null;
  const selectedPatch = selectedFile
    ? (patches.find(
        (patch) =>
          patch.newPath === selectedFile || patch.oldPath === selectedFile,
      ) ?? null)
    : null;
  const selectedFileStats = selectedPatch
    ? patchStats(selectedPatch.content)
    : { additions: 0, deletions: 0 };
  const fileTree = useMemo(() => buildReviewFileTree(fileRows), [fileRows]);
  const visibleTreeRows = useMemo(
    () =>
      repositoryExpanded
        ? flattenReviewFileTree(fileTree, expandedDirectoryPaths)
        : [],
    [expandedDirectoryPaths, fileTree, repositoryExpanded],
  );
  const fileVirtualizer = useVirtualizer({
    count: visibleTreeRows.length,
    getScrollElement: () => fileScrollRef.current,
    estimateSize: () => 30,
    overscan: 8,
  });
  const measuredFileRows = fileVirtualizer.getVirtualItems();
  const visibleFileRows =
    measuredFileRows.length > 0
      ? measuredFileRows
      : visibleTreeRows.slice(0, 40).map((row, index) => ({
          index,
          key: row.path,
          size: 30,
          start: index * 30,
        }));
  const fileListHeight = Math.max(
    fileVirtualizer.getTotalSize(),
    visibleFileRows.length * 30,
  );
  const binaryDiff =
    fileDiff?.sections.some((section) => section.isBinary) ?? false;
  const renderableSections =
    fileDiff?.sections.filter((section) => !section.isBinary) ?? [];
  const emptyDiff =
    Boolean(fileDiff) &&
    !binaryDiff &&
    renderableSections.every(
      (section) =>
        section.baseContent === section.headContent && !section.content.trim(),
    );

  useEffect(() => {
    setRepositoryIndex(0);
    setFileIndex(0);
    setFilesCollapsed(false);
    setRepositoryExpanded(true);
    setDiffLayout("inline");
  }, [review?.cardId]);

  useEffect(() => {
    setFileIndex(0);
    setRepositoryExpanded(true);
  }, [repositoryIndex]);

  useEffect(() => {
    setExpandedDirectoryPaths(new Set(reviewDirectoryPaths(fileTree)));
  }, [fileTree]);

  useEffect(() => {
    const request = ++fileDiffRequest.current;
    setFileDiff(null);
    setFileDiffError(null);
    if (!selectedFile || !binding) {
      setFileDiffLoading(false);
      if (selectedFile && !binding) {
        setFileDiffError(
          "The card worktree is unavailable for this repository.",
        );
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
    <aside
      className="kanban-local-review-drawer"
      aria-label="Local card review"
    >
      <header>
        <div className="kanban-local-review-heading">
          <h2>{review?.title ?? "Review changes"}</h2>
          <div className="kanban-local-review-heading-meta">
            <span aria-hidden="true" />
            <span>Local review</span>
            {repository ? (
              <>
                <i aria-hidden="true" />
                <span>{repository.status.replace(/_/g, " ")}</span>
              </>
            ) : null}
          </div>
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
          {repositories.length > 1 ? (
            <div
              className="kanban-local-review-repositories"
              role="tablist"
              aria-label="Repositories"
            >
              {repositories.map((item, index) => (
                <button
                  key={item.sourceRepositoryPath}
                  type="button"
                  role="tab"
                  aria-selected={index === repositoryIndex}
                  onClick={() => setRepositoryIndex(index)}
                >
                  <GitBranch size={14} aria-hidden="true" />
                  <span>
                    {item.relativePath === "."
                      ? "Workspace repository"
                      : item.relativePath}
                  </span>
                  <small>
                    +{item.additions} -{item.deletions}
                  </small>
                </button>
              ))}
            </div>
          ) : null}

          {repository ? (
            <section className="kanban-local-review-repository">
              <div className="kanban-local-review-summary">
                <div className="kanban-local-review-change-count">
                  <span>
                    {fileRows.length} {fileRows.length === 1 ? "file" : "files"}{" "}
                    changed
                  </span>
                  <span className="additions">+{repository.additions}</span>
                  <span className="deletions">-{repository.deletions}</span>
                </div>
                <div className="kanban-local-review-branch">
                  <GitBranch size={14} aria-hidden="true" />
                  <span>{repository.cardBranch}</span>
                  <span aria-hidden="true">→</span>
                  <span>{repository.baseBranch}</span>
                </div>
              </div>
              {repository.error ? (
                <p
                  className="kanban-local-review-repository-error"
                  role="alert"
                >
                  {repository.error}
                </p>
              ) : null}
              {repository.isEmpty && repository.status !== "merged" ? (
                <div className="kanban-local-review-empty">
                  No changed files were found.
                </div>
              ) : (
                <div
                  className={`kanban-local-review-diff-layout ${filesCollapsed ? "files-collapsed" : ""}`}
                >
                  <aside
                    className="kanban-local-review-explorer"
                    aria-label="Changed files explorer"
                  >
                    <div className="kanban-local-review-explorer-toolbar">
                      <button
                        type="button"
                        className="kanban-icon-button"
                        aria-label={
                          filesCollapsed
                            ? "Show changed files"
                            : "Hide changed files"
                        }
                        title={
                          filesCollapsed
                            ? "Show changed files"
                            : "Hide changed files"
                        }
                        onClick={() =>
                          setFilesCollapsed((collapsed) => !collapsed)
                        }
                      >
                        {filesCollapsed ? (
                          <PanelLeftOpen size={16} aria-hidden="true" />
                        ) : (
                          <PanelLeftClose size={16} aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    {!filesCollapsed ? (
                      <>
                        <div className="kanban-local-review-explorer-root workspace-tree-row directory">
                          <button
                            type="button"
                            className="workspace-tree-chevron"
                            aria-label={`${repositoryExpanded ? "Collapse" : "Expand"} ${
                              repository.relativePath === "."
                                ? "Workspace repository"
                                : repository.relativePath
                            }`}
                            aria-expanded={repositoryExpanded}
                            onClick={() =>
                              setRepositoryExpanded((expanded) => !expanded)
                            }
                          >
                            {repositoryExpanded ? (
                              <ChevronDown size={14} aria-hidden="true" />
                            ) : (
                              <ChevronRight size={14} aria-hidden="true" />
                            )}
                          </button>
                          <button
                            type="button"
                            className="workspace-tree-label"
                            title={repository.sourceRepositoryPath}
                            onClick={() =>
                              setRepositoryExpanded((expanded) => !expanded)
                            }
                          >
                            {repositoryExpanded ? (
                              <FolderOpen size={15} aria-hidden="true" />
                            ) : (
                              <Folder size={15} aria-hidden="true" />
                            )}
                            <span className="workspace-entry-name">
                              {repository.relativePath === "."
                                ? "Workspace repository"
                                : repository.relativePath}
                            </span>
                          </button>
                        </div>
                        <div
                          ref={fileScrollRef}
                          className="kanban-local-review-files"
                          aria-label="Changed files"
                        >
                          <div
                            style={{
                              height: fileListHeight,
                              position: "relative",
                            }}
                          >
                            {visibleFileRows.map((item) => {
                              const row = visibleTreeRows[item.index];
                              const path = row.path;
                              const directory = row.kind === "directory";
                              const expanded =
                                directory && expandedDirectoryPaths.has(path);
                              const patch = patches.find(
                                (candidate) =>
                                  candidate.newPath === path ||
                                  candidate.oldPath === path,
                              );
                              const stats = patch
                                ? patchStats(patch.content)
                                : null;
                              return (
                                <div
                                  key={path}
                                  className={`workspace-tree-row ${directory ? "directory" : "file"}${
                                    !directory && row.fileIndex === fileIndex
                                      ? " selected"
                                      : ""
                                  }`}
                                  style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    width: "100%",
                                    height: item.size,
                                    transform: `translateY(${item.start}px)`,
                                    "--depth": row.depth,
                                  } as CSSProperties}
                                >
                                  {directory ? (
                                    <button
                                      type="button"
                                      className="workspace-tree-chevron"
                                      aria-label={`${expanded ? "Collapse" : "Expand"} ${row.name}`}
                                      aria-expanded={expanded}
                                      onClick={() =>
                                        setExpandedDirectoryPaths((current) => {
                                          const next = new Set(current);
                                          if (expanded) next.delete(path);
                                          else next.add(path);
                                          return next;
                                        })
                                      }
                                    >
                                      {expanded ? (
                                        <ChevronDown size={14} aria-hidden="true" />
                                      ) : (
                                        <ChevronRight size={14} aria-hidden="true" />
                                      )}
                                    </button>
                                  ) : (
                                    <span
                                      className="workspace-tree-chevron-placeholder"
                                      aria-hidden="true"
                                    />
                                  )}
                                  <button
                                    type="button"
                                    className="workspace-tree-label"
                                    title={path}
                                    aria-label={directory ? undefined : row.name}
                                    aria-current={
                                      !directory && row.fileIndex === fileIndex
                                        ? "true"
                                        : undefined
                                    }
                                    onClick={() => {
                                      if (directory) {
                                        setExpandedDirectoryPaths((current) => {
                                          const next = new Set(current);
                                          if (expanded) next.delete(path);
                                          else next.add(path);
                                          return next;
                                        });
                                      } else {
                                        setFileIndex(row.fileIndex);
                                      }
                                    }}
                                  >
                                    {directory ? (
                                      expanded ? (
                                        <FolderOpen size={15} aria-hidden="true" />
                                      ) : (
                                        <Folder size={15} aria-hidden="true" />
                                      )
                                    ) : (
                                      <FileText size={15} aria-hidden="true" />
                                    )}
                                    <span className="workspace-entry-name">
                                      {row.name}
                                    </span>
                                    {stats ? (
                                      <small
                                        aria-label={`${stats.additions} additions, ${stats.deletions} deletions`}
                                      >
                                      <span className="additions">
                                        +{stats.additions}
                                      </span>
                                      <span className="deletions">
                                        -{stats.deletions}
                                      </span>
                                      </small>
                                    ) : null}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    ) : null}
                  </aside>
                  <div className="kanban-local-review-diff-column">
                    <div className="kanban-local-review-diff-toolbar">
                      <div className="kanban-local-review-selected-file">
                        <FileText size={15} aria-hidden="true" />
                        <strong title={selectedFile ?? undefined}>
                          {selectedFile
                            ? fileName(selectedFile)
                            : "Select a file"}
                        </strong>
                        {selectedFile ? (
                          <small>
                            <span className="additions">
                              +{selectedFileStats.additions}
                            </span>
                            <span className="deletions">
                              -{selectedFileStats.deletions}
                            </span>
                          </small>
                        ) : null}
                      </div>
                      <div className="kanban-local-review-diff-actions">
                        <div
                          className="kanban-local-review-layout-toggle"
                          role="group"
                          aria-label="Diff layout"
                        >
                          <button
                            type="button"
                            aria-label="Side-by-side diff"
                            title="Side-by-side diff"
                            aria-pressed={diffLayout === "side-by-side"}
                            onClick={() => setDiffLayout("side-by-side")}
                          >
                            <Columns2 size={16} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            aria-label="Inline diff"
                            title="Inline diff"
                            aria-pressed={diffLayout === "inline"}
                            onClick={() => setDiffLayout("inline")}
                          >
                            <List size={16} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="kanban-local-review-diff">
                      {fileDiffLoading ? (
                        <div className="file-preview-state" role="status">
                          <Loader2
                            className="file-preview-spinner"
                            size={16}
                            aria-hidden="true"
                          />
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
                          layout={diffLayout}
                        />
                      ) : (
                        <div className="file-preview-state">
                          <FileText size={16} aria-hidden="true" />
                          <span>Select a file to inspect its diff.</span>
                        </div>
                      )}
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
          aria-label={
            nothingToMerge
              ? "Complete without changes"
              : "Approve and merge locally"
          }
          title={
            nothingToMerge
              ? "Complete without changes"
              : "Approve and merge locally"
          }
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
