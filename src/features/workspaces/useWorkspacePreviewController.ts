import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { readWorkspaceGitDiff } from "../../codexClient";
import { useStableEvent } from "../../shared/reactRuntime";
import {
  preferredWorkspaceGitRepository,
  workspaceCacheKey,
  type WorkspaceGitStatusState,
} from "./gitModel";
import type {
  Workspace,
  WorkspaceGitDiff,
  WorkspaceGitFileStatus,
  WorkspacePreviewState,
  WorkspaceTreeEntry,
} from "./types";
import {
  pathBelongsToWorkspace,
  workspaceFileEntryFromResponseLink,
} from "./workspaceFiles";
import {
  workspacePreviewCacheKey,
  type WorkspaceFilePreviewService,
} from "./WorkspaceFilePreviewService";
import type { OpenWorkspaceFilePreviewOptions } from "./runtimeState";
import type { CodePreviewHighlightingService } from "../../lib/codePreviewHighlighting";

export const PREVIEW_DRAWER_DEFAULT_WIDTH = 520;
export const PREVIEW_DRAWER_MIN_WIDTH = 360;
export const PREVIEW_DRAWER_VIEWPORT_GUTTER = 360;
export const PREVIEW_DRAWER_RESIZE_STEP = 40;
export const PREVIEW_DRAWER_RESIZE_LARGE_STEP = 80;
export const DIFF_DRAWER_PREFERRED_WIDTH = 860;
export const DIFF_SIDE_BY_SIDE_MIN_WIDTH = 760;

type WorkspacePreviewControllerOptions = {
  filePreviews: WorkspaceFilePreviewService;
  previewHighlighting?: Pick<CodePreviewHighlightingService, "warm">;
  workspaces: Workspace[];
  selectedWorkspace: Workspace | null;
  gitStatusStates: Record<number, WorkspaceGitStatusState>;
  gitStatusByWorkspaceId: Map<
    number,
    Map<string, WorkspaceGitFileStatus>
  >;
  gitStatusByRelativePath: Map<string, WorkspaceGitFileStatus>;
};

type InvalidateWorkspacePreviewOptions = {
  reloadOpenPreview?: boolean;
};

type ActivePreviewContext = {
  workspace: Workspace;
  gitStatus?: WorkspaceGitFileStatus | null;
  diffRequest?: OpenWorkspaceFilePreviewOptions["diffRequest"];
};

function previewDiffCacheKey(
  workspace: Workspace,
  file: WorkspaceTreeEntry,
  context: ActivePreviewContext | null,
) {
  return context?.workspace.path === workspace.path && context.diffRequest
    ? context.diffRequest.cacheKey
    : workspaceCacheKey(workspace.path, file.path);
}

const emptyPreviewState = (): WorkspacePreviewState => ({
  status: "idle",
  mode: "preview",
  file: null,
  preview: null,
  error: null,
  diffStatus: "idle",
  diff: null,
  diffError: null,
});

export function useWorkspacePreviewController({
  filePreviews,
  previewHighlighting,
  workspaces,
  selectedWorkspace,
  gitStatusStates,
  gitStatusByWorkspaceId,
  gitStatusByRelativePath,
}: WorkspacePreviewControllerOptions) {
  const [previewState, setPreviewState] =
    useState<WorkspacePreviewState>(emptyPreviewState);
  const [previewDrawerWidth, setPreviewDrawerWidth] = useState(
    PREVIEW_DRAWER_DEFAULT_WIDTH,
  );
  const [previewResizing, setPreviewResizing] = useState(false);
  const previewStateRef = useRef(previewState);
  const previewResizingRef = useRef(previewResizing);
  const previewRequestId = useRef(0);
  const activePreviewCacheKeyRef = useRef<string | null>(null);
  const activePreviewContextRef = useRef<ActivePreviewContext | null>(null);
  const fileDiffCache = useRef(new Map<string, WorkspaceGitDiff>());
  const fileDiffRequestCache = useRef(
    new Map<string, Promise<WorkspaceGitDiff>>(),
  );

  previewStateRef.current = previewState;
  previewResizingRef.current = previewResizing;

  useEffect(() => {
    function handleResize() {
      setPreviewDrawerWidth((current) => clampPreviewDrawerWidth(current));
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!previewResizing) return;

    function handlePointerMove(event: PointerEvent) {
      setPreviewDrawerWidth(
        clampPreviewDrawerWidth(window.innerWidth - event.clientX),
      );
    }

    function handlePointerUp() {
      setPreviewResizing(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [previewResizing]);

  const previewGitStatus = useMemo(() => {
    if (!previewState.file) {
      return null;
    }

    const activeContext = activePreviewContextRef.current;
    if (activeContext?.gitStatus !== undefined) {
      return activeContext.gitStatus;
    }

    const workspace =
      workspaces.find((candidate) =>
        pathBelongsToWorkspace(previewState.file?.path ?? "", candidate.path),
      ) ?? selectedWorkspace;

    if (!workspace) {
      return null;
    }

    return (
      gitStatusByWorkspaceId
        .get(workspace.id)
        ?.get(previewState.file.relativePath) ?? null
    );
  }, [gitStatusByWorkspaceId, previewState.file, selectedWorkspace, workspaces]);
  const previewDiffSections = useMemo(
    () => previewState.diff?.sections ?? [],
    [previewState.diff],
  );
  const previewRenderableDiffSections = useMemo(
    () => previewDiffSections.filter((section) => !section.isBinary),
    [previewDiffSections],
  );
  const previewDiffHasBinary = useMemo(
    () => previewDiffSections.some((section) => section.isBinary),
    [previewDiffSections],
  );
  const previewDiffEmpty =
    previewState.diffStatus === "loaded" && previewDiffSections.length === 0;
  const previewDiffLayout =
    previewDrawerWidth >= DIFF_SIDE_BY_SIDE_MIN_WIDTH
      ? ("side-by-side" as const)
      : ("inline" as const);
  const previewDrawerMaxWidth = getMaxPreviewDrawerWidth();

  const growPreviewDrawerForDiff = useStableEvent(() => {
    setPreviewDrawerWidth((current) =>
      clampPreviewDrawerWidth(Math.max(current, DIFF_DRAWER_PREFERRED_WIDTH)),
    );
  });

  const loadWorkspaceFilePreview = useStableEvent(
    async (
      workspace: Workspace,
      file: WorkspaceTreeEntry,
      requestId = previewRequestId.current,
    ) => {
      const cacheKey = workspacePreviewCacheKey(workspace.path, file.path);
      const cachedPreview = filePreviews.getCached(workspace.path, file.path);
      if (cachedPreview) {
        if (
          previewRequestId.current !== requestId ||
          activePreviewCacheKeyRef.current !== cacheKey
        ) {
          return;
        }
        setPreviewState((current) => ({
          ...current,
          status: "loaded",
          file,
          preview: cachedPreview,
          error: null,
        }));
        return;
      }

      setPreviewState((current) => ({
        ...current,
        status: "loading",
        error: null,
      }));

      try {
        const preview = await filePreviews.load(workspace.path, file.path, {
          shouldContinue: () =>
            activePreviewCacheKeyRef.current === cacheKey,
        });
        if (
          previewRequestId.current !== requestId ||
          activePreviewCacheKeyRef.current !== cacheKey
        ) {
          return;
        }
        setPreviewState((current) => ({
          ...current,
          status: "loaded",
          file,
          preview,
          error: null,
        }));
      } catch (error) {
        if (
          previewRequestId.current !== requestId ||
          activePreviewCacheKeyRef.current !== cacheKey
        ) {
          return;
        }
        setPreviewState((current) => ({
          ...current,
          status: "error",
          file,
          preview: current.preview,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    },
  );

  const loadWorkspaceFileDiff = useStableEvent(
    async (
      workspace: Workspace,
      file: WorkspaceTreeEntry,
      requestId = previewRequestId.current,
    ) => {
      const activeContext = activePreviewContextRef.current;
      const diffRequest =
        activeContext?.workspace.path === workspace.path
          ? activeContext.diffRequest
          : undefined;
      const cacheKey = previewDiffCacheKey(workspace, file, activeContext);
      const cachedDiff = fileDiffCache.current.get(cacheKey);
      if (cachedDiff) {
        setPreviewState((current) => ({
          ...current,
          diffStatus: "loaded",
          diff: cachedDiff,
          diffError: null,
        }));
        return;
      }

      setPreviewState((current) => ({
        ...current,
        diffStatus: "loading",
        diffError: null,
      }));

      try {
        const existingRequest = fileDiffRequestCache.current.get(cacheKey);
        const overview = gitStatusStates[workspace.id]?.snapshot ?? null;
        const repositoryPath =
          gitStatusByWorkspaceId
            .get(workspace.id)
            ?.get(file.relativePath)?.repositoryPath ??
          preferredWorkspaceGitRepository(
            overview,
            workspace.selected_git_repository_path,
          )?.repository.rootPath ??
          null;
        const request =
          existingRequest ??
          (diffRequest
            ? diffRequest.load()
            : readWorkspaceGitDiff(
                workspace.path,
                file.path,
                repositoryPath,
              )
          ).finally(() => {
              fileDiffRequestCache.current.delete(cacheKey);
            });
        if (!existingRequest) {
          fileDiffRequestCache.current.set(cacheKey, request);
        }

        const diff = await request;
        fileDiffCache.current.set(cacheKey, diff);
        if (previewRequestId.current !== requestId) {
          return;
        }
        setPreviewState((current) => ({
          ...current,
          diffStatus: "loaded",
          diff,
          diffError: null,
        }));
      } catch (error) {
        if (previewRequestId.current !== requestId) {
          return;
        }
        setPreviewState((current) => ({
          ...current,
          diffStatus: "error",
          diff: null,
          diffError: error instanceof Error ? error.message : String(error),
        }));
      }
    },
  );

  const invalidateWorkspacePreviewCaches = useStableEvent(
    (
      workspace: Workspace,
      filePath?: string,
      options: InvalidateWorkspacePreviewOptions = {},
    ) => {
      filePreviews.invalidate(workspace.path, filePath);
      deletePreviewCacheEntries(fileDiffCache.current, workspace, filePath);
      deletePreviewCacheEntries(
        fileDiffRequestCache.current,
        workspace,
        filePath,
      );

      if (!options.reloadOpenPreview) {
        return;
      }

      const openPreview = previewStateRef.current;
      const openFile = openPreview.file;
      if (
        !openFile ||
        !pathBelongsToWorkspace(openFile.path, workspace.path) ||
        (filePath && openFile.path !== filePath)
      ) {
        return;
      }

      const requestId = previewRequestId.current + 1;
      previewRequestId.current = requestId;
      if (openPreview.mode === "diff") {
        const activeWorkspace =
          activePreviewContextRef.current?.workspace ?? workspace;
        void loadWorkspaceFileDiff(activeWorkspace, openFile, requestId);
        return;
      }

      void loadWorkspaceFilePreview(workspace, openFile, requestId);
    },
  );

  const openWorkspaceFilePreview = useStableEvent(
    async (
      workspace: Workspace,
      file: WorkspaceTreeEntry,
      options: OpenWorkspaceFilePreviewOptions = {},
    ) => {
      void previewHighlighting?.warm(file.path).catch(() => undefined);
      const requestId = previewRequestId.current + 1;
      previewRequestId.current = requestId;
      const gitStatus =
        options.gitStatus !== undefined
          ? options.gitStatus
          : gitStatusByRelativePath.get(file.relativePath) ?? null;
      const mode =
        options.mode ??
        (gitStatus?.statusKind === "deleted" || file.gitGhost
          ? "diff"
          : "preview");
      const cacheKey = workspacePreviewCacheKey(workspace.path, file.path);
      activePreviewCacheKeyRef.current = cacheKey;
      activePreviewContextRef.current = {
        workspace,
        gitStatus,
        diffRequest: options.diffRequest,
      };
      if (options.forceRefresh) {
        invalidateWorkspacePreviewCaches(workspace, file.path);
        if (options.diffRequest) {
          fileDiffCache.current.delete(options.diffRequest.cacheKey);
          fileDiffRequestCache.current.delete(options.diffRequest.cacheKey);
        }
      }
      const cachedPreview = options.forceRefresh
        ? null
        : await filePreviews.getValidatedCached(workspace.path, file.path);
      if (
        previewRequestId.current !== requestId ||
        activePreviewCacheKeyRef.current !== cacheKey
      ) {
        return;
      }
      // In-flight native chunks are transport state, not renderable documents.
      // Keep the preview in its loading state until the stable version has been
      // fully assembled and prepared.
      const visiblePreview = cachedPreview;
      const diffCacheKey = previewDiffCacheKey(
        workspace,
        file,
        activePreviewContextRef.current,
      );
      const cachedDiff = fileDiffCache.current.get(diffCacheKey) ?? null;
      setPreviewState({
        status:
          mode === "preview"
            ? visiblePreview
              ? "loaded"
              : "loading"
            : visiblePreview
              ? "loaded"
              : "idle",
        mode,
        file,
        preview: visiblePreview,
        error: null,
        diffStatus:
          mode === "diff"
            ? cachedDiff
              ? "loaded"
              : "loading"
            : cachedDiff
              ? "loaded"
              : "idle",
        diff: cachedDiff,
        diffError: null,
      });

      if (mode === "diff") {
        growPreviewDrawerForDiff();
        if (!cachedDiff) {
          await loadWorkspaceFileDiff(workspace, file, requestId);
        }
        return;
      }

      if (!cachedPreview) {
        await loadWorkspaceFilePreview(workspace, file, requestId);
      }
    },
  );

  const openTaskResponseFileLink = useStableEvent((href: string) => {
    if (!selectedWorkspace) {
      return false;
    }

    const file = workspaceFileEntryFromResponseLink(href, selectedWorkspace);
    if (!file) {
      return false;
    }

    void openWorkspaceFilePreview(selectedWorkspace, file, {
      forceRefresh: true,
    });
    return true;
  });

  const setWorkspacePreviewMode = useStableEvent(
    (mode: "preview" | "diff") => {
      const file = previewState.file;
      const workspace =
        activePreviewContextRef.current?.workspace ?? selectedWorkspace;
      if (!file || !workspace || previewState.mode === mode) {
        return;
      }

      setPreviewState((current) => ({ ...current, mode }));
      const cacheKey = previewDiffCacheKey(
        workspace,
        file,
        activePreviewContextRef.current,
      );
      const cachedPreview = filePreviews.getCached(workspace.path, file.path);
      const cachedDiff = fileDiffCache.current.get(cacheKey);
      if (mode === "preview" && cachedPreview) {
        setPreviewState((current) => ({
          ...current,
          mode,
          status: "loaded",
          preview: cachedPreview,
          error: null,
        }));
        return;
      }
      if (mode === "diff" && cachedDiff) {
        growPreviewDrawerForDiff();
        setPreviewState((current) => ({
          ...current,
          mode,
          diffStatus: "loaded",
          diff: cachedDiff,
          diffError: null,
        }));
        return;
      }

      if (mode === "preview" && previewState.status === "idle") {
        void loadWorkspaceFilePreview(workspace, file);
      }
      if (mode === "diff" && previewState.diffStatus === "idle") {
        growPreviewDrawerForDiff();
        void loadWorkspaceFileDiff(workspace, file);
      } else if (mode === "diff") {
        growPreviewDrawerForDiff();
      }
    },
  );

  const closeWorkspaceFilePreview = useStableEvent(() => {
    previewRequestId.current += 1;
    activePreviewCacheKeyRef.current = null;
    activePreviewContextRef.current = null;
    setPreviewState(emptyPreviewState());
  });

  const removeWorkspacePreview = useStableEvent((workspace: Workspace) => {
    if (
      previewStateRef.current.file &&
      pathBelongsToWorkspace(previewStateRef.current.file.path, workspace.path)
    ) {
      activePreviewCacheKeyRef.current = null;
      activePreviewContextRef.current = null;
      setPreviewState(emptyPreviewState());
    }
    filePreviews.invalidate(workspace.path);
    deletePreviewCacheEntries(fileDiffCache.current, workspace);
    deletePreviewCacheEntries(fileDiffRequestCache.current, workspace);
  });

  const startPreviewDrawerResize = useStableEvent(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      setPreviewResizing(true);
    },
  );

  const resizePreviewDrawer = useStableEvent((delta: number) => {
    setPreviewDrawerWidth((current) =>
      clampPreviewDrawerWidth(current + delta),
    );
  });

  const handlePreviewResizeKeyDown = useStableEvent(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey
        ? PREVIEW_DRAWER_RESIZE_LARGE_STEP
        : PREVIEW_DRAWER_RESIZE_STEP;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        resizePreviewDrawer(step);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        resizePreviewDrawer(-step);
      }

      if (event.key === "Home") {
        event.preventDefault();
        setPreviewDrawerWidth(PREVIEW_DRAWER_MIN_WIDTH);
      }

      if (event.key === "End") {
        event.preventDefault();
        setPreviewDrawerWidth(getMaxPreviewDrawerWidth());
      }
    },
  );

  return {
    previewState,
    previewResizingRef,
    openWorkspaceFilePreview,
    openTaskResponseFileLink,
    invalidateWorkspacePreviewCaches,
    closeWorkspaceFilePreview,
    removeWorkspacePreview,
    drawerProps: {
      previewState,
      previewGitStatus,
      previewRenderableDiffSections,
      previewDiffHasBinary,
      previewDiffEmpty,
      previewDiffLayout,
      previewDrawerWidth,
      previewResizing,
      minWidth: PREVIEW_DRAWER_MIN_WIDTH,
      maxWidth: previewDrawerMaxWidth,
      onModeChange: setWorkspacePreviewMode,
      onClose: closeWorkspaceFilePreview,
      onResizeStart: startPreviewDrawerResize,
      onResizeKeyDown: handlePreviewResizeKeyDown,
    },
  };
}

function deletePreviewCacheEntries<T>(
  cache: Map<string, T>,
  workspace: Workspace,
  filePath?: string,
) {
  if (filePath) {
    cache.delete(workspaceCacheKey(workspace.path, filePath));
    return;
  }

  const prefix = `${workspace.path}\u0000`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

export function getMaxPreviewDrawerWidth() {
  if (typeof window === "undefined") {
    return PREVIEW_DRAWER_DEFAULT_WIDTH;
  }

  return Math.max(
    PREVIEW_DRAWER_MIN_WIDTH,
    window.innerWidth - PREVIEW_DRAWER_VIEWPORT_GUTTER,
  );
}

export function clampPreviewDrawerWidth(width: number) {
  return Math.min(
    Math.max(width, PREVIEW_DRAWER_MIN_WIDTH),
    getMaxPreviewDrawerWidth(),
  );
}
