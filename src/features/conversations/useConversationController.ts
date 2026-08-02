import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import { useDismissibleContextMenu } from "../../shared/useDismissibleContextMenu";
import type {
  ChatHistoryContextMenuState,
  ChatListItem,
  HistoricalTranscriptState,
  HistoryChatLoadState,
  HistoryOpenRequest,
  WorkspaceChatSession,
  WorkspaceHistoryState,
  TaskChatEntry,
} from "./types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type ConversationController = {
  taskChatEntries: TaskChatEntry[];
  setTaskChatEntries: StateSetter<TaskChatEntry[]>;
  taskChatEntriesRef: MutableRefObject<TaskChatEntry[]>;
  activeChatEntryId: string | null;
  setActiveChatEntryId: StateSetter<string | null>;
  activeChatEntryIdRef: MutableRefObject<string | null>;
  selectedDraftChatEntryId: string | null;
  setSelectedDraftChatEntryId: StateSetter<string | null>;
  selectedDraftChatEntryIdRef: MutableRefObject<string | null>;
  unreadCompletedChats: Record<number, number[]>;
  setUnreadCompletedChats: StateSetter<Record<number, number[]>>;
  historyState: WorkspaceHistoryState;
  setHistoryState: StateSetter<WorkspaceHistoryState>;
  historyStateRef: MutableRefObject<WorkspaceHistoryState>;
  historyChatLoadState: HistoryChatLoadState | null;
  setHistoryChatLoadState: StateSetter<HistoryChatLoadState | null>;
  selectedHistoryChatId: number | null;
  setSelectedHistoryChatId: StateSetter<number | null>;
  historyOpenRequest: HistoryOpenRequest | null;
  setHistoryOpenRequest: StateSetter<HistoryOpenRequest | null>;
  historicalTranscript: HistoricalTranscriptState | null;
  setHistoricalTranscript: StateSetter<HistoricalTranscriptState | null>;
  historicalTranscriptRef: MutableRefObject<HistoricalTranscriptState | null>;
  workspaceChatSessions: Record<number, WorkspaceChatSession | undefined>;
  setWorkspaceChatSessions: StateSetter<
    Record<number, WorkspaceChatSession | undefined>
  >;
  workspaceChatSessionsRef: MutableRefObject<
    Record<number, WorkspaceChatSession | undefined>
  >;
  chatHistoryContextMenu: ChatHistoryContextMenuState | null;
  setChatHistoryContextMenu: StateSetter<ChatHistoryContextMenuState | null>;
  chatHistoryContextMenuRef: RefObject<HTMLDivElement | null>;
  chatHistoryDeleteCandidate: ChatListItem | null;
  setChatHistoryDeleteCandidate: StateSetter<ChatListItem | null>;
  historyChatLoadIdRef: MutableRefObject<number>;
};

const emptyHistoryState = (): WorkspaceHistoryState => ({
  status: "idle",
  chats: [],
  error: null,
});

export function useConversationController(): ConversationController {
  const [taskChatEntries, setTaskChatEntries] = useState<TaskChatEntry[]>([]);
  const [activeChatEntryId, setActiveChatEntryId] = useState<string | null>(null);
  const [selectedDraftChatEntryId, setSelectedDraftChatEntryId] = useState<
    string | null
  >(null);
  const [unreadCompletedChats, setUnreadCompletedChats] = useState<
    Record<number, number[]>
  >({});
  const [historyState, setHistoryState] =
    useState<WorkspaceHistoryState>(emptyHistoryState);
  const [historyChatLoadState, setHistoryChatLoadState] =
    useState<HistoryChatLoadState | null>(null);
  const [selectedHistoryChatId, setSelectedHistoryChatId] =
    useState<number | null>(null);
  const [historyOpenRequest, setHistoryOpenRequest] =
    useState<HistoryOpenRequest | null>(null);
  const [historicalTranscript, setHistoricalTranscript] =
    useState<HistoricalTranscriptState | null>(null);
  const [workspaceChatSessions, setWorkspaceChatSessions] = useState<
    Record<number, WorkspaceChatSession | undefined>
  >({});
  const [chatHistoryContextMenu, setChatHistoryContextMenu] =
    useState<ChatHistoryContextMenuState | null>(null);
  const [chatHistoryDeleteCandidate, setChatHistoryDeleteCandidate] =
    useState<ChatListItem | null>(null);

  const taskChatEntriesRef = useRef(taskChatEntries);
  const activeChatEntryIdRef = useRef(activeChatEntryId);
  const selectedDraftChatEntryIdRef = useRef(selectedDraftChatEntryId);
  const historyStateRef = useRef(historyState);
  const historicalTranscriptRef = useRef(historicalTranscript);
  const workspaceChatSessionsRef = useRef(workspaceChatSessions);
  const chatHistoryContextMenuRef = useRef<HTMLDivElement | null>(null);
  const historyChatLoadIdRef = useRef(0);

  taskChatEntriesRef.current = taskChatEntries;
  activeChatEntryIdRef.current = activeChatEntryId;
  selectedDraftChatEntryIdRef.current = selectedDraftChatEntryId;
  historyStateRef.current = historyState;
  historicalTranscriptRef.current = historicalTranscript;
  workspaceChatSessionsRef.current = workspaceChatSessions;

  const dismissChatHistoryContextMenu = useCallback(
    () => setChatHistoryContextMenu(null),
    [],
  );
  useDismissibleContextMenu(
    chatHistoryContextMenu !== null,
    chatHistoryContextMenuRef,
    dismissChatHistoryContextMenu,
  );

  return {
    taskChatEntries,
    setTaskChatEntries,
    taskChatEntriesRef,
    activeChatEntryId,
    setActiveChatEntryId,
    activeChatEntryIdRef,
    selectedDraftChatEntryId,
    setSelectedDraftChatEntryId,
    selectedDraftChatEntryIdRef,
    unreadCompletedChats,
    setUnreadCompletedChats,
    historyState,
    setHistoryState,
    historyStateRef,
    historyChatLoadState,
    setHistoryChatLoadState,
    selectedHistoryChatId,
    setSelectedHistoryChatId,
    historyOpenRequest,
    setHistoryOpenRequest,
    historicalTranscript,
    setHistoricalTranscript,
    historicalTranscriptRef,
    workspaceChatSessions,
    setWorkspaceChatSessions,
    workspaceChatSessionsRef,
    chatHistoryContextMenu,
    setChatHistoryContextMenu,
    chatHistoryContextMenuRef,
    chatHistoryDeleteCandidate,
    setChatHistoryDeleteCandidate,
    historyChatLoadIdRef,
  };
}
