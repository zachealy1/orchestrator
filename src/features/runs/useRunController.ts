import {
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import { emptyRunView, type RunViewState } from "../../lib/codexEventReducer";
import type { CollaborationModeMask } from "../../lib/nativePlanMode";
import type { CodexProfileKey } from "../codex/types";
import type { PreflightReport } from "./types";
import type { PlanImplementationDialogState } from "./PlanImplementationDialog";
import type { GoalEditCandidate } from "./GoalEditDialog";
import type {
  ActiveRunControl,
  GoalTerminationState,
} from "./runtimeTypes";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type RunController = {
  preflightRef: MutableRefObject<PreflightReport | null>;
  runView: RunViewState;
  setRunView: StateSetter<RunViewState>;
  runViewRef: MutableRefObject<RunViewState>;
  activeRunControlRef: MutableRefObject<ActiveRunControl | null>;
  currentRunId: MutableRefObject<number | null>;
  currentTaskId: MutableRefObject<number | null>;
  currentRunAccountId: MutableRefObject<number | null>;
  currentRunProfileKey: MutableRefObject<CodexProfileKey | null>;
  planImplementationDialog: PlanImplementationDialogState | null;
  setPlanImplementationDialog: StateSetter<PlanImplementationDialogState | null>;
  planImplementationDialogRequestRef: MutableRefObject<number>;
  planImplementationDialogRef: RefObject<HTMLElement | null>;
  planImplementationReturnFocusRef: MutableRefObject<HTMLElement | null>;
  goalEditCandidate: GoalEditCandidate | null;
  setGoalEditCandidate: StateSetter<GoalEditCandidate | null>;
  goalTermination: GoalTerminationState | null;
  setGoalTermination: StateSetter<GoalTerminationState | null>;
  collaborationModeMasksRef: MutableRefObject<
    Map<CodexProfileKey, Promise<CollaborationModeMask[]>>
  >;
  planActionLocksRef: MutableRefObject<Set<string>>;
};

export function useRunController(): RunController {
  const preflightRef = useRef<PreflightReport | null>(null);
  const [runView, setRunView] = useState<RunViewState>(emptyRunView);
  const runViewRef = useRef<RunViewState>(emptyRunView);
  const activeRunControlRef = useRef<ActiveRunControl | null>(null);
  const currentRunId = useRef<number | null>(null);
  const currentTaskId = useRef<number | null>(null);
  const currentRunAccountId = useRef<number | null>(null);
  const currentRunProfileKey = useRef<CodexProfileKey | null>(null);
  const [planImplementationDialog, setPlanImplementationDialog] =
    useState<PlanImplementationDialogState | null>(null);
  const planImplementationDialogRequestRef = useRef(0);
  const planImplementationDialogRef = useRef<HTMLElement | null>(null);
  const planImplementationReturnFocusRef = useRef<HTMLElement | null>(null);
  const [goalEditCandidate, setGoalEditCandidate] =
    useState<GoalEditCandidate | null>(null);
  const [goalTermination, setGoalTermination] =
    useState<GoalTerminationState | null>(null);
  const collaborationModeMasksRef = useRef(
    new Map<CodexProfileKey, Promise<CollaborationModeMask[]>>(),
  );
  const planActionLocksRef = useRef(new Set<string>());

  runViewRef.current = runView;

  return {
    preflightRef,
    runView,
    setRunView,
    runViewRef,
    activeRunControlRef,
    currentRunId,
    currentTaskId,
    currentRunAccountId,
    currentRunProfileKey,
    planImplementationDialog,
    setPlanImplementationDialog,
    planImplementationDialogRequestRef,
    planImplementationDialogRef,
    planImplementationReturnFocusRef,
    goalEditCandidate,
    setGoalEditCandidate,
    goalTermination,
    setGoalTermination,
    collaborationModeMasksRef,
    planActionLocksRef,
  };
}
