import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceFilePreview } from "./types";
import {
  WorkspaceFilePreviewService,
  type WorkspaceFilePreviewReader,
} from "./WorkspaceFilePreviewService";
import {
  PREVIEW_DRAWER_MIN_WIDTH,
  useWorkspacePreviewController,
} from "./useWorkspacePreviewController";
import type {
  Workspace,
  WorkspaceGitFileStatus,
  WorkspaceTreeEntry,
} from "./types";

const mocks = vi.hoisted(() => ({
  readWorkspaceGitDiff: vi.fn(),
}));

vi.mock("../../codexClient", () => ({
  readWorkspaceFilePreview: vi.fn(),
  readWorkspaceFilePreviewChunk: vi.fn(),
  readWorkspaceFilePreviewVersion: vi.fn(),
  readWorkspaceGitDiff: mocks.readWorkspaceGitDiff,
}));

const workspace: Workspace = {
  id: 1,
  path: "/repo",
  label: "repo",
  default_account_id: null,
  selected_git_repository_path: "/repo",
  last_opened_at: "2026-08-02T00:00:00.000Z",
  created_at: "2026-08-02T00:00:00.000Z",
};

function entry(name: string): WorkspaceTreeEntry {
  return {
    name,
    path: `/repo/${name}`,
    relativePath: name,
    kind: "file",
  };
}

function preview(
  file: WorkspaceTreeEntry,
  content: string,
  overrides: Partial<WorkspaceFilePreview> = {},
): WorkspaceFilePreview {
  return {
    path: file.path,
    relativePath: file.relativePath,
    content,
    truncated: false,
    isBinary: false,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function renderPreviewController(
  service: WorkspaceFilePreviewService,
  statuses = new Map<string, WorkspaceGitFileStatus>(),
) {
  return renderHook(() =>
    useWorkspacePreviewController({
      filePreviews: service,
      workspaces: [workspace],
      selectedWorkspace: workspace,
      gitStatusStates: {
        [workspace.id]: {
          status: "loaded",
          snapshot: null,
          error: null,
        },
      },
      gitStatusByWorkspaceId: new Map([[workspace.id, statuses]]),
      gitStatusByRelativePath: statuses,
    }),
  );
}

describe("useWorkspacePreviewController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publishes an initial chunk before replacing it with the completed preview", async () => {
    const file = entry("large.txt");
    const finalChunk = deferred<WorkspaceFilePreview>();
    const reader: WorkspaceFilePreviewReader = {
      readInitial: vi.fn().mockResolvedValue(
        preview(file, "partial", {
          complete: false,
          nextOffset: 7,
          totalBytes: 11,
          version: "v1",
        }),
      ),
      readChunk: vi.fn().mockReturnValue(finalChunk.promise),
      readVersion: vi.fn(),
    };
    const service = new WorkspaceFilePreviewService(reader);
    const { result } = renderPreviewController(service);
    let loading!: Promise<void>;

    act(() => {
      loading = result.current.openWorkspaceFilePreview(workspace, file);
    });
    await waitFor(() =>
      expect(result.current.previewState.preview?.content).toBe("partial"),
    );

    finalChunk.resolve(
      preview(file, "tail", {
        complete: true,
        nextOffset: 11,
        totalBytes: 11,
        version: "v1",
      }),
    );
    await act(() => loading);

    expect(result.current.previewState).toMatchObject({
      status: "loaded",
      preview: { content: "partialtail", complete: true },
    });
  });

  it("keeps a newly selected file visible when an older chunk resolves", async () => {
    const first = entry("first.txt");
    const second = entry("second.txt");
    const staleChunk = deferred<WorkspaceFilePreview>();
    const reader: WorkspaceFilePreviewReader = {
      readInitial: vi.fn((_workspacePath, filePath) =>
        Promise.resolve(
          filePath === first.path
            ? preview(first, "first partial", {
                complete: false,
                nextOffset: 13,
                totalBytes: 18,
                version: "first-v1",
              })
            : preview(second, "second complete", { complete: true }),
        ),
      ),
      readChunk: vi.fn().mockReturnValue(staleChunk.promise),
      readVersion: vi.fn(),
    };
    const service = new WorkspaceFilePreviewService(reader);
    const { result } = renderPreviewController(service);
    let firstLoad!: Promise<void>;

    act(() => {
      firstLoad = result.current.openWorkspaceFilePreview(workspace, first);
    });
    await waitFor(() =>
      expect(result.current.previewState.preview?.content).toBe("first partial"),
    );
    await act(() =>
      result.current.openWorkspaceFilePreview(workspace, second),
    );
    expect(result.current.previewState.preview?.content).toBe("second complete");

    staleChunk.resolve(
      preview(first, " stale", {
        complete: true,
        nextOffset: 18,
        totalBytes: 18,
        version: "first-v1",
      }),
    );
    await act(() => firstLoad);

    expect(result.current.previewState.preview?.content).toBe("second complete");
  });

  it("opens deleted files as diffs and owns drawer keyboard sizing", async () => {
    const file = entry("deleted.ts");
    const status: WorkspaceGitFileStatus = {
      path: file.path,
      relativePath: file.relativePath,
      repositoryPath: "/repo",
      repositoryRelativePath: file.relativePath,
      oldRelativePath: null,
      indexStatus: "D",
      worktreeStatus: " ",
      statusKind: "deleted",
      badge: "D",
    };
    const service = new WorkspaceFilePreviewService({
      readInitial: vi.fn().mockResolvedValue(preview(file, "", { complete: true })),
      readChunk: vi.fn(),
      readVersion: vi.fn(),
    });
    mocks.readWorkspaceGitDiff.mockResolvedValue({
      path: file.path,
      relativePath: file.relativePath,
      sections: [],
    });
    const { result } = renderPreviewController(
      service,
      new Map([[file.relativePath, status]]),
    );

    await act(() => result.current.openWorkspaceFilePreview(workspace, file));

    expect(mocks.readWorkspaceGitDiff).toHaveBeenCalledWith(
      workspace.path,
      file.path,
      "/repo",
    );
    expect(result.current.previewState).toMatchObject({
      mode: "diff",
      diffStatus: "loaded",
    });
    expect(result.current.drawerProps.previewDrawerWidth).toBe(
      result.current.drawerProps.maxWidth,
    );

    act(() => {
      result.current.drawerProps.onResizeKeyDown({
        key: "Home",
        shiftKey: false,
        preventDefault: vi.fn(),
      } as never);
    });
    expect(result.current.drawerProps.previewDrawerWidth).toBe(
      PREVIEW_DRAWER_MIN_WIDTH,
    );
  });

  it("retains a card-specific diff request across preview mode changes", async () => {
    const worktreeWorkspace = {
      ...workspace,
      path: "/cards/card-1/repo",
      selected_git_repository_path: "/cards/card-1/repo",
    };
    const file = {
      ...entry("game.ts"),
      path: "/cards/card-1/repo/game.ts",
    };
    const service = new WorkspaceFilePreviewService({
      readInitial: vi.fn().mockResolvedValue(preview(file, "updated", { complete: true })),
      readChunk: vi.fn(),
      readVersion: vi.fn(),
    });
    const loadCardDiff = vi.fn().mockResolvedValue({
      path: file.path,
      relativePath: file.relativePath,
      sections: [
        {
          kind: "unstaged",
          title: "Card changes",
          baseLabel: "main:game.ts",
          headLabel: "codex/card:game.ts",
          baseContent: "before\n",
          headContent: "updated\n",
          baseTruncated: false,
          headTruncated: false,
          content: "@@ -1 +1 @@\n-before\n+updated\n",
          isBinary: false,
        },
      ],
    });
    const { result } = renderPreviewController(service);

    await act(() =>
      result.current.openWorkspaceFilePreview(worktreeWorkspace, file, {
        diffRequest: {
          cacheKey: "card-1\u0000game.ts",
          load: loadCardDiff,
        },
      }),
    );
    act(() => result.current.drawerProps.onModeChange("diff"));

    await waitFor(() =>
      expect(result.current.previewState.diff?.sections[0]).toMatchObject({
        title: "Card changes",
        headContent: "updated\n",
      }),
    );
    expect(loadCardDiff).toHaveBeenCalledTimes(1);
    expect(mocks.readWorkspaceGitDiff).not.toHaveBeenCalled();
  });
});
