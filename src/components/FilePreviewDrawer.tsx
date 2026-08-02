import { memo, type KeyboardEvent, type PointerEvent } from "react";
import { AlertCircle, FileText, Loader2, X } from "lucide-react";
import type {
  ResolvedTheme,
  WorkspaceGitDiffSection,
  WorkspaceGitFileStatus,
  WorkspacePreviewState,
} from "../types";
import { CodePreview } from "./CodePreview";
import { DiffPreview } from "./DiffPreview";

type PreviewMode = WorkspacePreviewState["mode"];
type DiffLayout = "side-by-side" | "inline";

type Props = {
  previewState: WorkspacePreviewState;
  previewGitStatus: WorkspaceGitFileStatus | null;
  previewRenderableDiffSections: WorkspaceGitDiffSection[];
  previewDiffHasBinary: boolean;
  previewDiffEmpty: boolean;
  previewDiffLayout: DiffLayout;
  resolvedTheme: ResolvedTheme;
  previewDrawerWidth: number;
  previewResizing: boolean;
  minWidth: number;
  maxWidth: number;
  onModeChange: (mode: PreviewMode) => void;
  onClose: () => void;
  onResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
  onResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
};

export const FilePreviewDrawer = memo(function FilePreviewDrawer({
  previewState,
  previewGitStatus,
  previewRenderableDiffSections,
  previewDiffHasBinary,
  previewDiffEmpty,
  previewDiffLayout,
  resolvedTheme,
  previewDrawerWidth,
  previewResizing,
  minWidth,
  maxWidth,
  onModeChange,
  onClose,
  onResizeStart,
  onResizeKeyDown,
}: Props) {
  if (!previewState.file) {
    return null;
  }

  const file = previewState.file;

  return (
    <aside
      className={`file-preview-drawer ${previewResizing ? "resizing" : ""}`}
      aria-label="File preview"
      aria-live="polite"
      style={{ width: `${previewDrawerWidth}px` }}
    >
      <div
        className="file-preview-resize-handle"
        role="separator"
        tabIndex={0}
        aria-label="Resize file preview"
        aria-orientation="vertical"
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        aria-valuenow={previewDrawerWidth}
        onPointerDown={onResizeStart}
        onKeyDown={onResizeKeyDown}
      />
      <header>
        <div className="file-preview-title">
          <p className="eyebrow">
            {previewState.mode === "diff" ? "Git diff" : "Preview"}
          </p>
          <h2>{file.name}</h2>
          <span>{file.relativePath}</span>
        </div>
        <div className="file-preview-actions">
          {previewGitStatus ? (
            <div
              className={`file-preview-mode-toggle mode-${previewState.mode}`}
              role="group"
              aria-label="File preview mode"
            >
              <button
                type="button"
                className={previewState.mode === "preview" ? "active" : ""}
                aria-pressed={previewState.mode === "preview"}
                onClick={() => onModeChange("preview")}
                disabled={previewGitStatus.statusKind === "deleted" || file.gitGhost}
              >
                Preview
              </button>
              <button
                type="button"
                className={previewState.mode === "diff" ? "active" : ""}
                aria-pressed={previewState.mode === "diff"}
                onClick={() => onModeChange("diff")}
              >
                Diff
              </button>
            </div>
          ) : null}
          <button
            className="file-preview-close"
            type="button"
            aria-label="Close file preview"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>
      </header>

      {previewState.mode === "preview" && previewState.status === "loading" ? (
        <div className="file-preview-state">
          <Loader2 className="file-preview-spinner" size={16} aria-hidden="true" />
          <span>Loading preview</span>
        </div>
      ) : null}

      {previewState.mode === "preview" && previewState.status === "error" ? (
        <div className="file-preview-state error">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{previewState.error ?? "Unable to preview file"}</span>
        </div>
      ) : null}

      {previewState.mode === "preview" &&
      previewState.status === "loaded" &&
      previewState.preview ? (
        <>
          {previewState.preview.isBinary ? (
            <div className="file-preview-state">
              <FileText size={16} aria-hidden="true" />
              <span>Binary or unsupported file preview.</span>
            </div>
          ) : (
            <CodePreview
              path={previewState.preview.path}
              content={previewState.preview.content}
              resolvedTheme={resolvedTheme}
              truncated={previewState.preview.truncated}
              complete={previewState.preview.complete}
              version={previewState.preview.version}
              lines={previewState.preview.lines}
            />
          )}
        </>
      ) : null}

      {previewState.mode === "diff" && previewState.diffStatus === "loading" ? (
        <div className="file-preview-state">
          <Loader2 className="file-preview-spinner" size={16} aria-hidden="true" />
          <span>Loading diff</span>
        </div>
      ) : null}

      {previewState.mode === "diff" && previewState.diffStatus === "error" ? (
        <div className="file-preview-state error">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{previewState.diffError ?? "Unable to load diff"}</span>
        </div>
      ) : null}

      {previewState.mode === "diff" && previewState.diffStatus === "loaded" ? (
        <>
          {previewDiffHasBinary ? (
            <div className="file-preview-state">
              <FileText size={16} aria-hidden="true" />
              <span>Binary diff is not available.</span>
            </div>
          ) : null}
          {previewDiffEmpty ? (
            <div className="file-preview-state">
              <FileText size={16} aria-hidden="true" />
              <span>No diff available for this file.</span>
            </div>
          ) : null}
          {previewRenderableDiffSections.length > 0 ? (
            <DiffPreview
              path={file.relativePath}
              sections={previewRenderableDiffSections}
              resolvedTheme={resolvedTheme}
              layout={previewDiffLayout}
            />
          ) : null}
        </>
      ) : null}
    </aside>
  );
});
