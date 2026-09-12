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
import { persistSelectedWorkspace } from "./selection";
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
  WorkspaceTreeEntry,
} from "./types";

import { readSidebarPreferences } from "./sidebarPreferences";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

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
  gitStatusStates: Record<number, WorkspaceGitStatusState>;
  setGitStatusStates: StateSetter<Record<number, WorkspaceGitStatusState>>;
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
  gitStatusRefreshCache: MutableRefObject<Map<number, Promise<void>>>;
  workspaceFileIndexCache: MutableRefObject<Map<number, WorkspaceTreeEntry[]>>;
  workspaceFileIndexRequestCache: MutableRefObject<
    Map<number, Promise<WorkspaceTreeEntry[]>>
  >;
};

export function useWorkspaceController(): WorkspaceController {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(
    null,
  );
  const [workspaceContextMenu, setWorkspaceContextMenu] =
    useState<WorkspaceContextMenuState | null>(null);
  const [workspaceDeleteCandidate, setWorkspaceDeleteCandidate] =
    useState<Workspace | null>(null);
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<Set<number>>(
    () => new Set(readSidebarPreferences().files),
  );
  const [expandedDirectoryPaths, setExpandedDirectoryPaths] =
    useState<Set<string>>(() => new Set(readSidebarPreferences().directories));
  const [directoryStates, setDirectoryStates] = useState<
    Record<string, WorkspaceDirectoryState>
  >({});
  const [gitStatusStates, setGitStatusStates] = useState<
    Record<number, WorkspaceGitStatusState>
  >({});
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
  const workspaceContextMenuRef = useRef<HTMLDivElement | null>(null);
  const directoryEntriesCache = useRef(new Map<string, WorkspaceTreeEntry[]>());
  const directoryRequestCache = useRef(
    new Map<string, Promise<WorkspaceTreeEntry[]>>(),
  );
  const directoryRequestGenerations = useRef(new Map<string, number>());
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

  useEffect(() => {
    if (selectedWorkspace) persistSelectedWorkspace(selectedWorkspace.id);
  }, [selectedWorkspace?.id]);

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
    gitStatusStates,
    setGitStatusStates,
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
    gitStatusRefreshCache,
    workspaceFileIndexCache,
    workspaceFileIndexRequestCache,
  };
}
