import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import { useDismissibleContextMenu } from "../../shared/useDismissibleContextMenu";
import type { WorkspaceGitStatusState } from "./gitModel";
import type { WorkspaceCommitIntentContext } from "../../lib/commitMessage";
import {
  restoreInterruptedGitOperations,
  type WorkspaceGitOperationState,
} from "../../lib/gitOperations";
import type { BranchCreationDialogState } from "./BranchCreationDialog";
import type {
  Workspace,
  WorkspaceContextMenuState,
  WorkspaceDirectoryState,
  WorkspaceFilePreview,
  WorkspaceGitDiff,
  WorkspacePreviewState,
  WorkspaceTreeEntry,
} from "./types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type WorkspaceControllerOptions = {
  previewDrawerDefaultWidth: number;
  clampPreviewDrawerWidth?: (width: number) => number;
};

const preservePreviewDrawerWidth = (width: number) => width;

export type WorkspaceController = {
  workspaces: Workspace[];
  setWorkspaces: StateSetter<Workspace[]>;
  workspacesRef: MutableRefObject<Workspace[]>;
  selectedWorkspace: Workspace | null;
  setSelectedWorkspace: StateSetter<Workspace | null>;
  selectedWorkspaceRef: MutableRefObject<Workspace | null>;
  workspaceLocationsKey: string;
  workspaceContextMenu: WorkspaceContextMenuState | null;
  setWorkspaceContextMenu: StateSetter<WorkspaceContextMenuState | null>;
  workspaceContextMenuRef: RefObject<HTMLDivElement | null>;
  workspaceDeleteCandidate: Workspace | null;
  setWorkspaceDeleteCandidate: StateSetter<Workspace | null>;
  expandedWorkspaceIds: Set<number>;
  setExpandedWorkspaceIds: StateSetter<Set<number>>;
  expandedDirectoryPaths: Set<string>;
  setExpandedDirectoryPaths: StateSetter<Set<string>>;
  directoryStates: Record<string, WorkspaceDirectoryState>;
  setDirectoryStates: StateSetter<Record<string, WorkspaceDirectoryState>>;
  directoryEntriesCache: MutableRefObject<Map<string, WorkspaceTreeEntry[]>>;
  directoryRequestCache: MutableRefObject<
    Map<string, Promise<WorkspaceTreeEntry[]>>
  >;
  directoryRequestGenerations: MutableRefObject<Map<string, number>>;
  previewState: WorkspacePreviewState;
  setPreviewState: StateSetter<WorkspacePreviewState>;
  previewStateRef: MutableRefObject<WorkspacePreviewState>;
  filePreviewCache: MutableRefObject<Map<string, WorkspaceFilePreview>>;
  filePreviewRequestCache: MutableRefObject<
    Map<string, Promise<WorkspaceFilePreview>>
  >;
  fileDiffCache: MutableRefObject<Map<string, WorkspaceGitDiff>>;
  fileDiffRequestCache: MutableRefObject<
    Map<string, Promise<WorkspaceGitDiff>>
  >;
  gitStatusStates: Record<number, WorkspaceGitStatusState>;
  setGitStatusStates: StateSetter<Record<number, WorkspaceGitStatusState>>;
  previewDrawerWidth: number;
  setPreviewDrawerWidth: StateSetter<number>;
  previewResizing: boolean;
  setPreviewResizing: StateSetter<boolean>;
  previewResizingRef: MutableRefObject<boolean>;
  branches: string[];
  setBranches: StateSetter<string[]>;
  selectedBranch: string | null;
  setSelectedBranch: StateSetter<string | null>;
  branchCreationDialog: BranchCreationDialogState | null;
  setBranchCreationDialog: StateSetter<BranchCreationDialogState | null>;
  branchCreationPendingWorkspaceId: number | null;
  setBranchCreationPendingWorkspaceId: StateSetter<number | null>;
  branchCreationInputRef: RefObject<HTMLInputElement | null>;
  branchCreationInFlightRef: MutableRefObject<boolean>;
  commitDialogOpen: boolean;
  setCommitDialogOpen: StateSetter<boolean>;
  commitIntentContext: WorkspaceCommitIntentContext | null;
  setCommitIntentContext: StateSetter<WorkspaceCommitIntentContext | null>;
  commitMessage: string;
  setCommitMessage: StateSetter<string>;
  commitDialogMessage: string;
  setCommitDialogMessage: StateSetter<string>;
  commitDialogError: boolean;
  setCommitDialogError: StateSetter<boolean>;
  includeUnstagedChanges: boolean;
  setIncludeUnstagedChanges: StateSetter<boolean>;
  gitOperationsByWorkspace: Record<number, WorkspaceGitOperationState | undefined>;
  setGitOperationsByWorkspace: StateSetter<
    Record<number, WorkspaceGitOperationState | undefined>
  >;
  lastCommitSubjectsRef: MutableRefObject<
    Map<string, { subject: string; changeKey: string }>
  >;
  gitActionInFlightRef: MutableRefObject<boolean>;
  gitOperationInFlightWorkspaceIdsRef: MutableRefObject<Set<number>>;
  gitOperationSequenceRef: MutableRefObject<number>;
  previewRequestId: MutableRefObject<number>;
  gitStatusRefreshCache: MutableRefObject<Map<number, Promise<void>>>;
  workspaceFileIndexCache: MutableRefObject<Map<number, WorkspaceTreeEntry[]>>;
  workspaceFileIndexRequestCache: MutableRefObject<
    Map<number, Promise<WorkspaceTreeEntry[]>>
  >;
};

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

export function useWorkspaceController({
  previewDrawerDefaultWidth,
  clampPreviewDrawerWidth = preservePreviewDrawerWidth,
}: WorkspaceControllerOptions): WorkspaceController {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(
    null,
  );
  const [workspaceContextMenu, setWorkspaceContextMenu] =
    useState<WorkspaceContextMenuState | null>(null);
  const [workspaceDeleteCandidate, setWorkspaceDeleteCandidate] =
    useState<Workspace | null>(null);
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [expandedDirectoryPaths, setExpandedDirectoryPaths] =
    useState<Set<string>>(() => new Set());
  const [directoryStates, setDirectoryStates] = useState<
    Record<string, WorkspaceDirectoryState>
  >({});
  const [previewState, setPreviewState] =
    useState<WorkspacePreviewState>(emptyPreviewState);
  const [gitStatusStates, setGitStatusStates] = useState<
    Record<number, WorkspaceGitStatusState>
  >({});
  const [previewDrawerWidth, setPreviewDrawerWidth] = useState(
    previewDrawerDefaultWidth,
  );
  const [previewResizing, setPreviewResizing] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [branchCreationDialog, setBranchCreationDialog] =
    useState<BranchCreationDialogState | null>(null);
  const [branchCreationPendingWorkspaceId, setBranchCreationPendingWorkspaceId] =
    useState<number | null>(null);
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [commitIntentContext, setCommitIntentContext] =
    useState<WorkspaceCommitIntentContext | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [commitDialogMessage, setCommitDialogMessage] = useState("");
  const [commitDialogError, setCommitDialogError] = useState(false);
  const [includeUnstagedChanges, setIncludeUnstagedChanges] = useState(true);
  const [gitOperationsByWorkspace, setGitOperationsByWorkspace] = useState<
    Record<number, WorkspaceGitOperationState | undefined>
  >(restoreInterruptedGitOperations);

  const workspacesRef = useRef(workspaces);
  const selectedWorkspaceRef = useRef(selectedWorkspace);
  const previewStateRef = useRef(previewState);
  const previewResizingRef = useRef(previewResizing);
  const workspaceContextMenuRef = useRef<HTMLDivElement | null>(null);
  const directoryEntriesCache = useRef(new Map<string, WorkspaceTreeEntry[]>());
  const directoryRequestCache = useRef(
    new Map<string, Promise<WorkspaceTreeEntry[]>>(),
  );
  const directoryRequestGenerations = useRef(new Map<string, number>());
  const filePreviewCache = useRef(new Map<string, WorkspaceFilePreview>());
  const filePreviewRequestCache = useRef(
    new Map<string, Promise<WorkspaceFilePreview>>(),
  );
  const fileDiffCache = useRef(new Map<string, WorkspaceGitDiff>());
  const fileDiffRequestCache = useRef(
    new Map<string, Promise<WorkspaceGitDiff>>(),
  );
  const previewRequestId = useRef(0);
  const gitStatusRefreshCache = useRef(new Map<number, Promise<void>>());
  const workspaceFileIndexCache = useRef(
    new Map<number, WorkspaceTreeEntry[]>(),
  );
  const workspaceFileIndexRequestCache = useRef(
    new Map<number, Promise<WorkspaceTreeEntry[]>>(),
  );
  const branchCreationInputRef = useRef<HTMLInputElement | null>(null);
  const branchCreationInFlightRef = useRef(false);
  const lastCommitSubjectsRef = useRef(
    new Map<string, { subject: string; changeKey: string }>(),
  );
  const gitActionInFlightRef = useRef(false);
  const gitOperationInFlightWorkspaceIdsRef = useRef(new Set<number>());
  const gitOperationSequenceRef = useRef(0);

  workspacesRef.current = workspaces;
  selectedWorkspaceRef.current = selectedWorkspace;
  previewStateRef.current = previewState;
  previewResizingRef.current = previewResizing;

  const workspaceLocationsKey = useMemo(
    () =>
      workspaces
        .map((workspace) => `${workspace.id}\u0000${workspace.path}`)
        .join("\u0001"),
    [workspaces],
  );

  const dismissWorkspaceContextMenu = useCallback(
    () => setWorkspaceContextMenu(null),
    [],
  );
  useDismissibleContextMenu(
    workspaceContextMenu !== null,
    workspaceContextMenuRef,
    dismissWorkspaceContextMenu,
  );

  useEffect(() => {
    function handleResize() {
      setPreviewDrawerWidth((current) => clampPreviewDrawerWidth(current));
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampPreviewDrawerWidth]);

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
  }, [clampPreviewDrawerWidth, previewResizing]);

  return {
    workspaces,
    setWorkspaces,
    workspacesRef,
    selectedWorkspace,
    setSelectedWorkspace,
    selectedWorkspaceRef,
    workspaceLocationsKey,
    workspaceContextMenu,
    setWorkspaceContextMenu,
    workspaceContextMenuRef,
    workspaceDeleteCandidate,
    setWorkspaceDeleteCandidate,
    expandedWorkspaceIds,
    setExpandedWorkspaceIds,
    expandedDirectoryPaths,
    setExpandedDirectoryPaths,
    directoryStates,
    setDirectoryStates,
    directoryEntriesCache,
    directoryRequestCache,
    directoryRequestGenerations,
    previewState,
    setPreviewState,
    previewStateRef,
    filePreviewCache,
    filePreviewRequestCache,
    fileDiffCache,
    fileDiffRequestCache,
    gitStatusStates,
    setGitStatusStates,
    previewDrawerWidth,
    setPreviewDrawerWidth,
    previewResizing,
    setPreviewResizing,
    previewResizingRef,
    branches,
    setBranches,
    selectedBranch,
    setSelectedBranch,
    branchCreationDialog,
    setBranchCreationDialog,
    branchCreationPendingWorkspaceId,
    setBranchCreationPendingWorkspaceId,
    branchCreationInputRef,
    branchCreationInFlightRef,
    commitDialogOpen,
    setCommitDialogOpen,
    commitIntentContext,
    setCommitIntentContext,
    commitMessage,
    setCommitMessage,
    commitDialogMessage,
    setCommitDialogMessage,
    commitDialogError,
    setCommitDialogError,
    includeUnstagedChanges,
    setIncludeUnstagedChanges,
    gitOperationsByWorkspace,
    setGitOperationsByWorkspace,
    lastCommitSubjectsRef,
    gitActionInFlightRef,
    gitOperationInFlightWorkspaceIdsRef,
    gitOperationSequenceRef,
    previewRequestId,
    gitStatusRefreshCache,
    workspaceFileIndexCache,
    workspaceFileIndexRequestCache,
  };
}
