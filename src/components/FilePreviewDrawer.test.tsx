import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilePreviewDrawer } from "./FilePreviewDrawer";
import type { WorkspacePreviewState } from "../types";

const file = {
  name: "App.tsx",
  path: "/repo/orchestrator/src/App.tsx",
  relativePath: "src/App.tsx",
  kind: "file" as const,
};

const basePreviewState: WorkspacePreviewState = {
  status: "idle",
  mode: "preview",
  file,
  preview: null,
  error: null,
  diffStatus: "idle",
  diff: null,
  diffError: null,
};

function renderDrawer(previewState: WorkspacePreviewState) {
  return render(
    <FilePreviewDrawer
      previewState={previewState}
      previewGitStatus={null}
      previewRenderableDiffSections={[]}
      previewDiffHasBinary={false}
      previewDiffEmpty={false}
      previewDiffLayout="side-by-side"
      resolvedTheme="dark"
      previewDrawerWidth={520}
      previewResizing={false}
      minWidth={360}
      maxWidth={900}
      onModeChange={vi.fn()}
      onClose={vi.fn()}
      onResizeStart={vi.fn()}
      onResizeKeyDown={vi.fn()}
    />,
  );
}

describe("FilePreviewDrawer", () => {
  it("animates the preview loading icon", () => {
    renderDrawer({
      ...basePreviewState,
      status: "loading",
      mode: "preview",
    });

    const loadingState = screen.getByText("Loading preview").closest(".file-preview-state");
    expect(loadingState?.querySelector("svg")).toHaveClass("file-preview-spinner");
  });

  it("animates the diff loading icon", () => {
    renderDrawer({
      ...basePreviewState,
      mode: "diff",
      diffStatus: "loading",
    });

    const loadingState = screen.getByText("Loading diff").closest(".file-preview-state");
    expect(loadingState?.querySelector("svg")).toHaveClass("file-preview-spinner");
  });
});
