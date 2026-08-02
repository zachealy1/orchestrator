import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  comparePromptQueueDisplayOrder,
  isPromptQueueItemPending,
} from "../../lib/promptQueue";
import type {
  PromptQueueComposerEditState,
  PromptQueueItem,
  PromptQueuePauseReason,
} from "./types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type PromptQueueControllerOptions = {
  listItems: (chatId: number) => Promise<PromptQueueItem[]>;
};

export type PromptQueueController = {
  promptQueuesByChat: Record<number, PromptQueueItem[] | undefined>;
  setPromptQueuesByChat: StateSetter<
    Record<number, PromptQueueItem[] | undefined>
  >;
  promptQueuesByChatRef: MutableRefObject<
    Record<number, PromptQueueItem[] | undefined>
  >;
  promptQueueActionPendingItemId: string | null;
  setPromptQueueActionPendingItemId: StateSetter<string | null>;
  promptQueueComposerEdit: PromptQueueComposerEditState | null;
  setPromptQueueComposerEdit: StateSetter<PromptQueueComposerEditState | null>;
  promptQueueComposerEditRef: MutableRefObject<PromptQueueComposerEditState | null>;
  pausedPromptQueueChatIdsRef: MutableRefObject<Set<number>>;
  promptQueuePauseReasonsRef: MutableRefObject<
    Map<number, PromptQueuePauseReason>
  >;
  promptQueueEnqueueOperationsRef: MutableRefObject<Map<number, Promise<void>>>;
  promptQueuePendingSubmissionKeysRef: MutableRefObject<
    Map<number, Set<string>>
  >;
  promptQueueClaimLocksRef: MutableRefObject<Set<number>>;
  promptQueueActionLocksRef: MutableRefObject<Set<string>>;
  promptQueueDispatchTimersRef: MutableRefObject<Map<number, number>>;
  setChatPromptQueue: (chatId: number, items: PromptQueueItem[]) => void;
  upsertPromptQueueItem: (item: PromptQueueItem) => void;
  removePromptQueueItem: (chatId: number, itemId: string) => void;
  refreshPromptQueue: (chatId: number) => Promise<PromptQueueItem[]>;
  setPromptQueuePaused: (
    chatId: number,
    paused: boolean,
    reason?: PromptQueuePauseReason,
  ) => void;
};

export function usePromptQueueController({
  listItems,
}: PromptQueueControllerOptions): PromptQueueController {
  const [promptQueuesByChat, setPromptQueuesByChat] = useState<
    Record<number, PromptQueueItem[] | undefined>
  >({});
  const [promptQueueActionPendingItemId, setPromptQueueActionPendingItemId] =
    useState<string | null>(null);
  const [promptQueueComposerEdit, setPromptQueueComposerEdit] =
    useState<PromptQueueComposerEditState | null>(null);

  const promptQueuesByChatRef = useRef(promptQueuesByChat);
  const promptQueueComposerEditRef = useRef(promptQueueComposerEdit);
  const pausedPromptQueueChatIdsRef = useRef(new Set<number>());
  const promptQueuePauseReasonsRef = useRef(
    new Map<number, PromptQueuePauseReason>(),
  );
  const promptQueueEnqueueOperationsRef = useRef(
    new Map<number, Promise<void>>(),
  );
  const promptQueuePendingSubmissionKeysRef = useRef(
    new Map<number, Set<string>>(),
  );
  const promptQueueClaimLocksRef = useRef(new Set<number>());
  const promptQueueActionLocksRef = useRef(new Set<string>());
  const promptQueueDispatchTimersRef = useRef(new Map<number, number>());

  promptQueuesByChatRef.current = promptQueuesByChat;
  promptQueueComposerEditRef.current = promptQueueComposerEdit;

  useEffect(
    () => () => {
      promptQueueDispatchTimersRef.current.forEach((timer) =>
        window.clearTimeout(timer),
      );
      promptQueueDispatchTimersRef.current.clear();
    },
    [],
  );

  const setChatPromptQueue = useCallback(
    (chatId: number, items: PromptQueueItem[]) => {
      const nextItems = items
        .filter(isPromptQueueItemPending)
        .sort(comparePromptQueueDisplayOrder);
      const next = {
        ...promptQueuesByChatRef.current,
        [chatId]: nextItems,
      };
      if (nextItems.length === 0) delete next[chatId];
      promptQueuesByChatRef.current = next;
      setPromptQueuesByChat(next);
    },
    [],
  );

  const upsertPromptQueueItem = useCallback(
    (item: PromptQueueItem) => {
      const current = promptQueuesByChatRef.current[item.chatId] ?? [];
      const index = current.findIndex((candidate) => candidate.id === item.id);
      const next =
        index < 0
          ? [...current, item]
          : current.map((candidate) =>
              candidate.id === item.id ? item : candidate,
            );
      setChatPromptQueue(item.chatId, next);
    },
    [setChatPromptQueue],
  );

  const removePromptQueueItem = useCallback(
    (chatId: number, itemId: string) => {
      setChatPromptQueue(
        chatId,
        (promptQueuesByChatRef.current[chatId] ?? []).filter(
          (item) => item.id !== itemId,
        ),
      );
    },
    [setChatPromptQueue],
  );

  const refreshPromptQueue = useCallback(
    async (chatId: number) => {
      const items = await listItems(chatId);
      setChatPromptQueue(chatId, items);
      return items;
    },
    [listItems, setChatPromptQueue],
  );

  const setPromptQueuePaused = useCallback(
    (
      chatId: number,
      paused: boolean,
      reason: PromptQueuePauseReason = "manual",
    ) => {
      const next = new Set(pausedPromptQueueChatIdsRef.current);
      if (paused) {
        next.add(chatId);
        promptQueuePauseReasonsRef.current.set(chatId, reason);
      } else {
        next.delete(chatId);
        promptQueuePauseReasonsRef.current.delete(chatId);
      }
      pausedPromptQueueChatIdsRef.current = next;
    },
    [],
  );

  return {
    promptQueuesByChat,
    setPromptQueuesByChat,
    promptQueuesByChatRef,
    promptQueueActionPendingItemId,
    setPromptQueueActionPendingItemId,
    promptQueueComposerEdit,
    setPromptQueueComposerEdit,
    promptQueueComposerEditRef,
    pausedPromptQueueChatIdsRef,
    promptQueuePauseReasonsRef,
    promptQueueEnqueueOperationsRef,
    promptQueuePendingSubmissionKeysRef,
    promptQueueClaimLocksRef,
    promptQueueActionLocksRef,
    promptQueueDispatchTimersRef,
    setChatPromptQueue,
    upsertPromptQueueItem,
    removePromptQueueItem,
    refreshPromptQueue,
    setPromptQueuePaused,
  };
}
