import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { CodexAccessMode } from "../codex/types";
import type {
  ComposerContextFile,
  ComposerMentionSearchStatus,
  ExplorerDragPreview,
  ExplorerPointerDrag,
  SelectedComposerSkill,
  SlashCommandItem,
  SlashCommandSearchStatus,
} from "./types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type ComposerControllerOptions = {
  initialAccessMode: CodexAccessMode;
  initialSlashCommands: SlashCommandItem[];
};

export type ComposerController = {
  prompt: string;
  promptRevision: number;
  promptRef: MutableRefObject<string>;
  replaceComposerPrompt: (
    nextPrompt: string | ((currentPrompt: string) => string),
  ) => void;
  goalMode: boolean;
  setGoalMode: StateSetter<boolean>;
  planMode: boolean;
  setPlanMode: StateSetter<boolean>;
  accessMode: CodexAccessMode;
  setAccessMode: StateSetter<CodexAccessMode>;
  contextFiles: ComposerContextFile[];
  setContextFiles: StateSetter<ComposerContextFile[]>;
  contextFilesRef: MutableRefObject<ComposerContextFile[]>;
  selectedSkills: SelectedComposerSkill[];
  setSelectedSkills: StateSetter<SelectedComposerSkill[]>;
  selectedSkillsRef: MutableRefObject<SelectedComposerSkill[]>;
  taskContextDropActive: boolean;
  setTaskContextDropActive: StateSetter<boolean>;
  taskContextDropActiveRef: MutableRefObject<boolean>;
  nativeContextDropPathsRef: MutableRefObject<string[]>;
  explorerDragPreview: ExplorerDragPreview | null;
  setExplorerDragPreview: StateSetter<ExplorerDragPreview | null>;
  explorerDragContextFileRef: MutableRefObject<ComposerContextFile | null>;
  explorerPointerDragRef: MutableRefObject<ExplorerPointerDrag | null>;
  explorerPointerDragCleanupRef: MutableRefObject<(() => void) | null>;
  suppressWorkspaceFileClickRef: MutableRefObject<boolean>;
  taskContextDropSurfaceRef: MutableRefObject<HTMLElement | null>;
  taskComposerPromptRef: MutableRefObject<HTMLTextAreaElement | null>;
  handleTaskComposerDropSurfaceElementChange: (
    element: HTMLElement | null,
  ) => void;
  handleTaskComposerPromptElementChange: (
    element: HTMLTextAreaElement | null,
  ) => void;
  mentionResults: ComposerContextFile[];
  setMentionResults: StateSetter<ComposerContextFile[]>;
  mentionSearchStatus: ComposerMentionSearchStatus;
  setMentionSearchStatus: StateSetter<ComposerMentionSearchStatus>;
  mentionSearchError: string | null;
  setMentionSearchError: StateSetter<string | null>;
  slashCommandResults: SlashCommandItem[];
  setSlashCommandResults: StateSetter<SlashCommandItem[]>;
  slashCommandSearchStatus: SlashCommandSearchStatus;
  setSlashCommandSearchStatus: StateSetter<SlashCommandSearchStatus>;
  slashCommandSearchError: string | null;
  setSlashCommandSearchError: StateSetter<string | null>;
};

export function useComposerController({
  initialAccessMode,
  initialSlashCommands,
}: ComposerControllerOptions): ComposerController {
  const [prompt, setPrompt] = useState("");
  const [promptRevision, setPromptRevision] = useState(0);
  const [goalMode, setGoalMode] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [accessMode, setAccessMode] =
    useState<CodexAccessMode>(initialAccessMode);
  const [contextFiles, setContextFiles] = useState<ComposerContextFile[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<SelectedComposerSkill[]>([]);
  const [taskContextDropActive, setTaskContextDropActive] = useState(false);
  const [explorerDragPreview, setExplorerDragPreview] =
    useState<ExplorerDragPreview | null>(null);
  const [mentionResults, setMentionResults] = useState<ComposerContextFile[]>([]);
  const [mentionSearchStatus, setMentionSearchStatus] =
    useState<ComposerMentionSearchStatus>("idle");
  const [mentionSearchError, setMentionSearchError] = useState<string | null>(null);
  const [slashCommandResults, setSlashCommandResults] =
    useState<SlashCommandItem[]>(initialSlashCommands);
  const [slashCommandSearchStatus, setSlashCommandSearchStatus] =
    useState<SlashCommandSearchStatus>("idle");
  const [slashCommandSearchError, setSlashCommandSearchError] =
    useState<string | null>(null);

  const promptRef = useRef(prompt);
  const contextFilesRef = useRef(contextFiles);
  const selectedSkillsRef = useRef(selectedSkills);
  const taskContextDropSurfaceRef = useRef<HTMLElement | null>(null);
  const taskComposerPromptRef = useRef<HTMLTextAreaElement | null>(null);
  const taskContextDropActiveRef = useRef(taskContextDropActive);
  const nativeContextDropPathsRef = useRef<string[]>([]);
  const explorerDragContextFileRef = useRef<ComposerContextFile | null>(null);
  const explorerPointerDragRef = useRef<ExplorerPointerDrag | null>(null);
  const explorerPointerDragCleanupRef = useRef<(() => void) | null>(null);
  const suppressWorkspaceFileClickRef = useRef(false);

  // Prompt keystrokes stay local to TaskComposer so typing does not rerender
  // the application runtime. The callback updates this ref synchronously;
  // only explicit replacements update the React snapshot and revision below.
  // Reassigning from `prompt` here would overwrite newer local input whenever
  // an unrelated parent state change rerenders the controller.
  contextFilesRef.current = contextFiles;
  selectedSkillsRef.current = selectedSkills;
  taskContextDropActiveRef.current = taskContextDropActive;

  const replaceComposerPrompt = useCallback(
    (nextPrompt: string | ((currentPrompt: string) => string)) => {
      const resolvedPrompt =
        typeof nextPrompt === "function"
          ? nextPrompt(promptRef.current)
          : nextPrompt;
      promptRef.current = resolvedPrompt;
      setPrompt(resolvedPrompt);
      setPromptRevision((current) => current + 1);
    },
    [],
  );

  const handleTaskComposerDropSurfaceElementChange = useCallback(
    (element: HTMLElement | null) => {
      taskContextDropSurfaceRef.current = element;
    },
    [],
  );
  const handleTaskComposerPromptElementChange = useCallback(
    (element: HTMLTextAreaElement | null) => {
      taskComposerPromptRef.current = element;
    },
    [],
  );

  return {
    prompt,
    promptRevision,
    promptRef,
    replaceComposerPrompt,
    goalMode,
    setGoalMode,
    planMode,
    setPlanMode,
    accessMode,
    setAccessMode,
    contextFiles,
    setContextFiles,
    contextFilesRef,
    selectedSkills,
    setSelectedSkills,
    selectedSkillsRef,
    taskContextDropActive,
    setTaskContextDropActive,
    taskContextDropActiveRef,
    nativeContextDropPathsRef,
    explorerDragPreview,
    setExplorerDragPreview,
    explorerDragContextFileRef,
    explorerPointerDragRef,
    explorerPointerDragCleanupRef,
    suppressWorkspaceFileClickRef,
    taskContextDropSurfaceRef,
    taskComposerPromptRef,
    handleTaskComposerDropSurfaceElementChange,
    handleTaskComposerPromptElementChange,
    mentionResults,
    setMentionResults,
    mentionSearchStatus,
    setMentionSearchStatus,
    mentionSearchError,
    setMentionSearchError,
    slashCommandResults,
    setSlashCommandResults,
    slashCommandSearchStatus,
    setSlashCommandSearchStatus,
    slashCommandSearchError,
    setSlashCommandSearchError,
  };
}
